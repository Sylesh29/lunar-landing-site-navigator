import { DAY_MS, HOUR_MS, MAX_DATE, MIN_DATE, MINUTE_MS, computeScenario, intersectWindows, positionAt } from './science.ts'
import type { Coordinates, Ephemeris, Interval, Observer, ScenarioResult } from './science.ts'

export type LandingDraft = { site: string; date: string; time: string; lat: string; lon: string }
export type OperatingLimits = {
  sunElevationDeg: number
  earthClearanceDeg: number
  minJointHours: number
  maxLowSunHours: number
  maxEarthGapHours: number
}
export type LimitsDraft = Record<keyof OperatingLimits, string>
export type DateSearchRange = 'around' | 'onward'

export const LIMIT_FIELDS = {
  sunElevationDeg: { label: 'Minimum Sun elevation (°)', min: 0, max: 90, initial: '0' },
  earthClearanceDeg: { label: 'Minimum Earth clearance (°)', min: 0, max: 90, initial: '0' },
  minJointHours: { label: 'Minimum continuous overlap (h)', min: 0, max: 720, initial: '4' },
  maxLowSunHours: { label: 'Maximum time without usable Sun (h)', min: 0, max: 720, initial: '72' },
  maxEarthGapHours: { label: 'Maximum time without usable Earth view (h)', min: 0, max: 720, initial: '120' },
}
const limitKeys = Object.keys(LIMIT_FIELDS) as (keyof OperatingLimits)[]
export const initialLimits = Object.fromEntries(limitKeys.map(key => [key, LIMIT_FIELDS[key].initial])) as LimitsDraft

export function parseLimits(draft: LimitsDraft): OperatingLimits | null {
  const values = limitKeys.map(key => {
    const value = Number(draft[key])
    const { min, max } = LIMIT_FIELDS[key]
    return [key, draft[key].trim() && Number.isFinite(value) && value >= min && value <= max ? value : null] as const
  })
  if (values.some(([, value]) => value === null)) return null
  return Object.fromEntries(values) as OperatingLimits
}

export function longestGap(windows: Interval[], duration: number) {
  let longest = 0
  let end = 0
  for (const [start, stop] of windows) {
    longest = Math.max(longest, start - end)
    end = stop
  }
  return Math.max(longest, duration - end) / HOUR_MS
}

export type PlanningWindows = { sun: Interval[]; earth: Interval[]; both: Interval[] }

export const CONSTRAINTS = ['Continuous overlap', 'Sun gap', 'Earth gap'] as const
export type Constraint = typeof CONSTRAINTS[number]

export function assessWindows(windows: PlanningWindows, duration: number, limits: OperatingLimits) {
  const longestJoint = Math.max(0, ...windows.both.map(([start, end]) => (end - start) / HOUR_MS))
  const sunGap = longestGap(windows.sun, duration)
  const earthGap = longestGap(windows.earth, duration)
  const margins: Record<Constraint, number> = {
    'Continuous overlap': longestJoint - limits.minJointHours,
    'Sun gap': limits.maxLowSunHours - sunGap,
    'Earth gap': limits.maxEarthGapHours - earthGap,
  }
  const unmet = CONSTRAINTS.filter(constraint => margins[constraint] < 0)
  return { longestJoint, sunGap, earthGap, unmet, margins }
}

export function planningWindows(result: ScenarioResult): PlanningWindows {
  return { sun: result.sun.windows, earth: result.earth.windows, both: result.both }
}

export function horizontalSunHours(ephemeris: Ephemeris, observer: Observer, start: number, sun: Interval[]) {
  let total = 0
  for (const [from, to] of sun) {
    for (let t = from; t < to;) {
      const next = Math.min(t + 5 * MINUTE_MS, to)
      const sky = positionAt(ephemeris, observer, 'sun', start + (t + next) / 2)
      total += Math.max(0, Math.sin(sky.elevation * Math.PI / 180)) * (next - t) / HOUR_MS
      t = next
    }
  }
  return total
}

export function nearbyDates(
  ephemeris: Ephemeris, observer: Observer, start: number, duration: number, limits: OperatingLimits,
  range: DateSearchRange = 'around',
) {
  const { first, last } = dateSearchBounds(start, range, 14)
  const all = planningWindows(computeScenario(
    ephemeris, observer, start + first * DAY_MS, (last - first) * DAY_MS + duration, limits,
  ))
  const results = []
  for (let day = first; day <= last; day += 1) {
    const offset = (day - first) * DAY_MS
    const assessment = assessWindows(clipPlanningWindows(all, offset, duration), duration, limits)
    if (!assessment.unmet.length) results.push({ day, utc: start + day * DAY_MS, ...assessment })
  }
  return {
    evaluated: last - first + 1,
    matches: results.sort((a, b) => Math.abs(a.day) - Math.abs(b.day) || a.day - b.day),
  }
}

export function dateSearchBounds(start: number, range: DateSearchRange, days: number) {
  return {
    first: Math.max(range === 'onward' ? 0 : -days, Math.ceil((Date.parse(MIN_DATE + 'T00:00Z') - start) / DAY_MS)),
    last: Math.min(days, Math.floor((Date.parse(MAX_DATE + 'T23:59Z') - start) / DAY_MS)),
  }
}

export function clipPlanningWindows(windows: PlanningWindows, offset: number, duration: number): PlanningWindows {
  const clip = (intervals: Interval[]) => intersectWindows(intervals, [[offset, offset + duration]])
    .map(([from, to]): Interval => [from - offset, to - offset])
  return { sun: clip(windows.sun), earth: clip(windows.earth), both: clip(windows.both) }
}

type ExportSite = Coordinates & { name: string; terrain: string; start: number }

export function windowCsv(
  days: number, limits: OperatingLimits, sites: ExportSite[],
  geometry: ScenarioResult[], operating: ScenarioResult[],
) {
  const rows: (string | number)[][] = [[
    'scenario', 'site', 'latitude_deg', 'longitude_east_deg', 'terrain', 'landing_utc',
    'period_days', 'minimum_sun_elevation_deg', 'minimum_earth_clearance_deg',
    'mode', 'target', 'window_start_utc', 'window_end_utc', 'duration_hours',
  ]]
  for (const [index, site] of sites.entries()) {
    const base = [
      index === 0 ? 'A' : 'B', site.name, site.lat, site.lon, site.terrain,
      new Date(site.start).toISOString(), days,
    ]
    const rowsByMode = [['geometric', geometry[index]], ['operating', operating[index]]] as const
    for (const [mode, result] of rowsByMode) {
      const modeFields = mode === 'operating' ? [limits.sunElevationDeg, limits.earthClearanceDeg] : ['', '']
      const windows = planningWindows(result)
      for (const target of ['sun', 'earth', 'both'] as const) {
        if (!windows[target].length) rows.push([...base, ...modeFields, mode, target, '', '', '0'])
        for (const [start, end] of windows[target]) {
          rows.push([
            ...base, ...modeFields, mode, target,
            new Date(site.start + start).toISOString(), new Date(site.start + end).toISOString(),
            ((end - start) / HOUR_MS).toFixed(3),
          ])
        }
      }
    }
  }
  return rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n') + '\r\n'
}
