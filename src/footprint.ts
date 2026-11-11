import { assessWindows, clipPlanningWindows, CONSTRAINTS, dateSearchBounds } from './planning.ts'
import type { OperatingLimits, PlanningWindows } from './planning.ts'
import { DAY_MS, HOUR_MS, intersectWindows, makeObserver, MAX_DATE, MIN_DATE, positionAt, visibilityWindows } from './science.ts'
import type { Ephemeris } from './science.ts'

export const HEIGHTS = [1, 2, 5] as const
export const SURFACES = ['LOLA', 'LROC shape-from-shading'] as const
export type Height = typeof HEIGHTS[number]
type SurfaceIndex = 0 | 1
export type FootprintSettings = { panel: Height; antenna: Height; anchor?: number }
export const initialFootprint: FootprintSettings = { panel: 2, antenna: 2 }
export const FOOTPRINT_DAYS = 28
const RESOLUTION = { scanMs: 30_000, refineMs: 3750 }

type Profile = { siteHeightM: number; angles: number[][] }
type Sample = { radius: number; bearing: number; lat: number; lon: number; models: [Profile, Profile] }
export type FootprintData = { version: 1; site: 'ridge'; heights: number[]; azimuthStepDeg: number; imageRayFraction: number; samples: Sample[] }
type Assessment = ReturnType<typeof assessWindows>
type Binding = { sample: number; surface: SurfaceIndex; constraint: typeof CONSTRAINTS[number]; hours: number }
export type Candidate = { utc: number; points: [Assessment[], Assessment[]]; counts: [number, number]; binding: Binding }
export type FootprintResult = { candidates: Candidate[]; imageRayFraction: number }
export type FootprintRequest = { ephemeris: Ephemeris; referenceRadiusKm: number; start: number; duration: number; limits: OperatingLimits; settings: FootprintSettings }

export function isFootprintSettings(value: unknown): value is FootprintSettings {
  if (!value || typeof value !== 'object') return false
  const { panel, antenna, anchor } = value as FootprintSettings
  return HEIGHTS.includes(panel) && HEIGHTS.includes(antenna) && (
    anchor === undefined || (Number.isSafeInteger(anchor) && anchor % 60_000 === 0 &&
      anchor >= Date.parse(MIN_DATE + 'T00:00Z') && anchor <= Date.parse(MAX_DATE + 'T23:59Z'))
  )
}

export function validateFootprintData(data: FootprintData) {
  if (data.version !== 1 || data.site !== 'ridge' || data.azimuthStepDeg !== 0.25 ||
    data.heights?.join() !== HEIGHTS.join() || data.samples?.length !== 17 ||
    !Number.isFinite(data.imageRayFraction) || data.imageRayFraction <= 0 || data.imageRayFraction > 1 ||
    data.samples.some((sample, i) =>
      sample.radius !== (i === 0 ? 0 : i <= 8 ? 50 : 100) || sample.bearing !== (i === 0 ? 0 : (i - 1) % 8 * 45) ||
      !Number.isFinite(sample.lat) || Math.abs(sample.lat) > 90 ||
      !Number.isFinite(sample.lon) || sample.lon < 0 || sample.lon >= 360 ||
      sample.models?.length !== 2 || sample.models.some(profile =>
        !Number.isFinite(profile.siteHeightM) || profile.angles?.length !== HEIGHTS.length ||
        profile.angles.some(angles => angles.length !== 1440 || angles.some(angle => !Number.isFinite(angle) || Math.abs(angle) > 90))))) {
    throw new Error('The bundled footprint does not match the Connecting Ridge model.')
  }
  return data
}

function windowsAtSample(request: FootprintRequest, sample: Sample, model: SurfaceIndex, duration: number): PlanningWindows {
  const { referenceRadiusKm, settings, limits, ephemeris, start } = request
  const { siteHeightM, angles } = sample.models[model]
  const observer = (height: Height) => makeObserver(sample, { referenceRadiusKm, observerHeightM: height }, {
    lat: sample.lat, lon: sample.lon, siteHeightM, anglesDeg: angles[HEIGHTS.indexOf(height)],
  })
  const panel = observer(settings.panel)
  const antenna = observer(settings.antenna)
  const sun = visibilityWindows(duration, elapsed => {
    const sky = positionAt(ephemeris, panel, 'sun', start + elapsed)
    return Math.min(sky.clearance, sky.elevation - limits.sunElevationDeg)
  }, RESOLUTION).windows
  const earth = visibilityWindows(duration, elapsed =>
    positionAt(ephemeris, antenna, 'earth', start + elapsed).clearance - limits.earthClearanceDeg,
  RESOLUTION).windows
  return { sun, earth, both: intersectWindows(sun, earth) }
}

export function evaluateFootprint(data: FootprintData, request: FootprintRequest): FootprintResult {
  const { last } = dateSearchBounds(request.start, 'onward', FOOTPRINT_DAYS)
  const span = last * DAY_MS + request.duration
  const surfaces = [0, 1] as const
  const windows = surfaces.map(surface => data.samples.map(sample => windowsAtSample(request, sample, surface, span)))
  const candidates = Array.from({ length: last + 1 }, (_, day): Candidate => {
    const points = surfaces.map(surface => windows[surface].map(window =>
      assessWindows(clipPlanningWindows(window, day * DAY_MS, request.duration), request.duration, request.limits),
    )) as Candidate['points']
    const counts: Candidate['counts'] = [0, 0]
    let binding: Binding = { sample: 0, surface: 0, constraint: CONSTRAINTS[0], hours: Infinity }
    for (const surface of surfaces) {
      for (const [sample, point] of points[surface].entries()) {
        if (!point.unmet.length) counts[surface] += 1
        for (const constraint of CONSTRAINTS) {
          const hours = point.margins[constraint]
          if (hours < binding.hours) binding = { sample, surface, constraint, hours }
        }
      }
    }
    return { utc: request.start + day * DAY_MS, points, counts, binding }
  })
  return { candidates, imageRayFraction: data.imageRayFraction }
}

export function samplePosition(index: number) {
  if (index === 0) return { radius: 0, bearing: 0, label: 'Reference point' }
  const radius = index <= 8 ? 50 : 100
  const direction = (index - 1) % 8
  return { radius, bearing: direction * 45, label: `${radius} m ${['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][direction]}` }
}

export function candidateSummary(result: FootprintResult) {
  const passes = result.candidates.filter(candidate => candidate.binding.hours >= 0)
  const widest = result.candidates.reduce((best, candidate) => candidate.binding.hours > best.binding.hours ? candidate : best)
  return { passes, earliest: passes[0], widest }
}

export function footprintCsv(result: FootprintResult, request: Pick<FootprintRequest, 'duration' | 'limits' | 'settings'>) {
  const rows = [[
    'landing_utc', 'period_hours', 'panel_height_m', 'antenna_height_m', 'terrain', 'radius_m', 'bearing_deg',
    'min_sun_elevation_deg', 'min_earth_clearance_deg', 'min_overlap_h', 'max_sun_gap_h', 'max_earth_gap_h',
    'longest_overlap_h', 'longest_sun_gap_h', 'longest_earth_gap_h', 'unmet',
  ].join(',')]
  const { settings, limits, duration } = request
  for (const candidate of result.candidates) {
    for (const [surface, points] of candidate.points.entries()) {
      for (const [index, point] of points.entries()) {
        const { radius, bearing } = samplePosition(index)
        rows.push([
          new Date(candidate.utc).toISOString(), duration / HOUR_MS, settings.panel, settings.antenna, SURFACES[surface],
          radius, bearing, limits.sunElevationDeg, limits.earthClearanceDeg, limits.minJointHours, limits.maxLowSunHours,
          limits.maxEarthGapHours, point.longestJoint, point.sunGap, point.earthGap, point.unmet.join(' / '),
        ].join(','))
      }
    }
  }
  return rows.join('\r\n') + '\r\n'
}
