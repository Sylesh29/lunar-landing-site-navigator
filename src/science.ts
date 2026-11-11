export const MINUTE_MS = 60_000
export const HOUR_MS = 60 * MINUTE_MS
export const DAY_MS = 24 * HOUR_MS
const RAD = Math.PI / 180

export type Vector = readonly [number, number, number]
export type Body = 'sun' | 'earth'
export type Interval = readonly [startMs: number, endMs: number]
export type Coordinates = { lat: number; lon: number }
export type Preset = Coordinates & { id: string; name: string; region: string; source: string }
export type HorizonProfile = Coordinates & {
  siteHeightM: number
  anglesDeg: number[]
  layers?: { gridM: number; maxDistanceM: number; url: string }[]
}
type Source = { file: string; url: string; sha256: string }

export type Model = {
  ephemeris: {
    file: string
    frame: string
    units: string
    encoding: string
    startUtc: string
    endUtc: string
    stepSeconds: number
    sampleCount: number
    sha256: string
    sources: Source[]
  }
  observerHeightM: number
  referenceRadiusKm: number
  terrain: (Source & {
    gridM: number
    reachM: number
    rayStepM: number
    azimuthStepDeg: number
    profiles: Record<string, HorizonProfile>
  }) | null
}

export type Ephemeris = {
  start: number
  stepMs: number
  rows: number
  data: DataView
}

export function readEphemeris(model: Model, buffer: ArrayBuffer): Ephemeris {
  const metadata = model.ephemeris
  const start = Date.parse(metadata.startUtc)
  const stepMs = metadata.stepSeconds * 1000
  if (
    metadata.frame !== 'MOON_ME_DE440_ME421' || metadata.units !== 'km' ||
    metadata.encoding !== 'float64-le' || metadata.sampleCount < 2 ||
    buffer.byteLength !== metadata.sampleCount * 6 * 8 ||
    start + (metadata.sampleCount - 1) * stepMs !== Date.parse(metadata.endUtc) ||
    !Number.isFinite(start) || stepMs !== HOUR_MS
  ) {
    throw new Error('The bundled ephemeris does not match its manifest.')
  }
  return { start, stepMs, rows: metadata.sampleCount, data: new DataView(buffer) }
}

export function wrapDegrees(value: number) {
  return ((value % 360) + 360) % 360
}

export function parseCoordinates(latitude: string, longitude: string): Coordinates | null {
  const lat = Number(latitude)
  const lon = Number(longitude)
  if (
    !latitude.trim() || !longitude.trim() || !Number.isFinite(lat) ||
    !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 360
  ) return null
  return { lat, lon: wrapDegrees(lon) }
}

export function parseLanding(date: string, time: string) {
  if (!/^2027-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null
  const input = `${date}T${time}:00.000Z`
  const utc = Date.parse(input)
  return Number.isFinite(utc) && new Date(utc).toISOString() === input ? utc : null
}

export function bodyVector(ephemeris: Ephemeris, utc: number, body: Body): Vector {
  const position = (utc - ephemeris.start) / ephemeris.stepMs
  if (!Number.isFinite(position) || position < 0 || position > ephemeris.rows - 1) {
    throw new RangeError('UTC time is outside the bundled ephemeris.')
  }
  const row = Math.min(Math.floor(position), ephemeris.rows - 2)
  const fraction = position - row
  const offset = (row * 6 + (body === 'sun' ? 0 : 3)) * 8
  const sample = (component: number) => {
    const lo = ephemeris.data.getFloat64(offset + component, true)
    const hi = ephemeris.data.getFloat64(offset + 48 + component, true)
    return lo + (hi - lo) * fraction
  }
  return [sample(0), sample(8), sample(16)]
}

export function makeObserver(site: Coordinates, model: Model, profile?: HorizonProfile) {
  const lat = site.lat * RAD
  const lon = site.lon * RAD
  const cosLat = Math.cos(lat)
  const sinLat = Math.sin(lat)
  const cosLon = Math.cos(lon)
  const sinLon = Math.sin(lon)
  const up: Vector = [cosLat * cosLon, cosLat * sinLon, sinLat]
  const east: Vector = [-sinLon, cosLon, 0]
  const north: Vector = [-sinLat * cosLon, -sinLat * sinLon, cosLat]
  const radius = model.referenceRadiusKm + ((profile?.siteHeightM ?? 0) + model.observerHeightM) / 1000
  const position: Vector = [up[0] * radius, up[1] * radius, up[2] * radius]
  const dip = -Math.acos(model.referenceRadiusKm / (model.referenceRadiusKm + model.observerHeightM / 1000)) / RAD
  return { up, east, north, position, dip, profile }
}

export type Observer = ReturnType<typeof makeObserver>

const dot = (a: Vector, b: Vector) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

export function horizonAt(angles: readonly number[], azimuth: number) {
  const sample = wrapDegrees(azimuth) * angles.length / 360
  const i = Math.floor(sample)
  return angles[i] + (angles[(i + 1) % angles.length] - angles[i]) * (sample - i)
}

export function project(vector: Vector, observer: Observer) {
  const offset: Vector = [
    vector[0] - observer.position[0],
    vector[1] - observer.position[1],
    vector[2] - observer.position[2],
  ]
  const e = dot(offset, observer.east)
  const n = dot(offset, observer.north)
  const u = dot(offset, observer.up)
  const horizontal = Math.hypot(e, n)
  const azimuth = horizontal <= Math.abs(u) * 1e-12 ? null : wrapDegrees(Math.atan2(e, n) / RAD)
  const elevation = Math.atan2(u, horizontal) / RAD
  const horizon = observer.profile ? horizonAt(observer.profile.anglesDeg, azimuth ?? 0) : observer.dip
  return { azimuth, elevation, horizon, clearance: elevation - horizon }
}

export function positionAt(ephemeris: Ephemeris, observer: Observer, body: Body, utc: number) {
  return project(bodyVector(ephemeris, utc, body), observer)
}

export function profileFor(model: Model, site: Preset | Coordinates) {
  if (!('id' in site)) return undefined
  const profile = model.terrain?.profiles[site.id]
  if (
    !profile || profile.lat !== site.lat || profile.lon !== site.lon ||
    !Number.isFinite(profile.siteHeightM) || profile.anglesDeg.length < 360 || profile.anglesDeg.length % 360 !== 0 ||
    profile.anglesDeg.some(angle => !Number.isFinite(angle) || Math.abs(angle) > 90)
  ) return undefined
  return profile
}

export function visibilityWindows(duration: number, clearance: (elapsed: number) => number) {
  const windows: Interval[] = []
  const transitions: { elapsed: number; visible: boolean }[] = []
  let visible = clearance(0) > 0
  let start = 0
  let previous = 0
  while (previous < duration) {
    const current = Math.min(duration, previous + 5 * MINUTE_MS)
    const nextVisible = clearance(current) > 0
    if (visible !== nextVisible) {
      let low = previous
      let high = current
      while (high - low > MINUTE_MS) {
        const middle = (low + high) / 2
        if ((clearance(middle) > 0) === visible) low = middle
        else high = middle
      }
      const edge = clearance(previous) === 0 ? previous
        : clearance(current) === 0 ? current : (low + high) / 2
      if (visible && edge > start) windows.push([start, edge])
      if (nextVisible) start = edge
      transitions.push({ elapsed: edge, visible: nextVisible })
      visible = nextVisible
    }
    previous = current
  }
  if (visible && duration > start) windows.push([start, duration])
  return { windows, transitions }
}

export function intersectWindows(a: Interval[], b: Interval[]) {
  const result: Interval[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    const start = Math.max(a[i][0], b[j][0])
    const end = Math.min(a[i][1], b[j][1])
    if (start < end) result.push([start, end])
    if (a[i][1] < b[j][1]) i += 1
    else j += 1
  }
  return result
}

export function totalHours(windows: Interval[]) {
  return windows.reduce((total, [start, end]) => total + (end - start) / HOUR_MS, 0)
}

export function computeScenario(ephemeris: Ephemeris, observer: Observer, utc: number, duration: number) {
  const sun = visibilityWindows(duration, elapsed => positionAt(ephemeris, observer, 'sun', utc + elapsed).clearance)
  const earth = visibilityWindows(duration, elapsed => positionAt(ephemeris, observer, 'earth', utc + elapsed).clearance)
  const both = intersectWindows(sun.windows, earth.windows)
  return { sun, earth, both }
}

export type ScenarioResult = ReturnType<typeof computeScenario>
