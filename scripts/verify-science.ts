import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import {
  DAY_MS, MINUTE_MS, bodyVector, computeScenario, makeObserver, positionAt, profileFor,
  project, readEphemeris, totalHours,
} from '../src/science.ts'
import type { Body, Interval, Model, Preset, Vector } from '../src/science.ts'

const json = <T>(path: string): T => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
const model = json<Model>('../public/data/model.json')
const vectors = readFileSync(new URL(`../public/data/${model.ephemeris.file}`, import.meta.url))
assert.equal(createHash('sha256').update(vectors).digest('hex'), model.ephemeris.sha256)
const ephemeris = readEphemeris(model, Uint8Array.from(vectors).buffer)
const presets = json<Preset[]>('../data/sites.json')
const refs = json<{ samples: {
  body: Body; site: string; utc: string; lat: number; lon: number; altitudeKm: number
  azimuthDeg: number; elevationDeg: number
}[] }>('../data/horizons-checks.json')
const midpoints = json<{ utc: string; vectorsKm: number[] }[]>('../data/spice-checks.json')

const RAD = Math.PI / 180
function direction(azimuth: number | null, elevation: number): Vector {
  const az = (azimuth ?? 0) * RAD
  const el = elevation * RAD
  return [Math.cos(el) * Math.sin(az), Math.cos(el) * Math.cos(az), Math.sin(el)]
}

function separation(a: Vector, b: Vector) {
  const cross = Math.hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
  return Math.atan2(cross, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / RAD
}

assert.equal(refs.samples.length, 24)
assert.equal(new Set(refs.samples.map(ref => `${ref.site}/${ref.body}/${ref.utc}`)).size, 24)
assert.equal(midpoints.length, 4)
let largestHorizonsError = 0
let largestInterpolationError = 0
for (const ref of refs.samples) {
  const utc = Date.parse(ref.utc)
  const site = presets.find(preset => preset.id === ref.site) ?? { lat: 0, lon: 0 }
  assert.equal(ref.lat, site.lat)
  assert.equal(ref.lon, site.lon)
  const profile = profileFor(model, site)
  assert.ok(Math.abs(ref.altitudeKm - ((profile?.siteHeightM ?? 0) + model.observerHeightM) / 1000) < 1e-9)
  const observer = makeObserver(site, model, profile)
  const sky = positionAt(ephemeris, observer, ref.body, utc)
  const error = separation(direction(sky.azimuth, sky.elevation), direction(ref.azimuthDeg, ref.elevationDeg))
  assert.ok(error <= 0.05, `Horizons difference ${error}° for ${ref.site}/${ref.body} at ${ref.utc}`)
  largestHorizonsError = Math.max(largestHorizonsError, error)
  const directRow = midpoints.find(row => row.utc === ref.utc)
  assert.ok(directRow)
  const [x, y, z] = directRow.vectorsKm.slice(ref.body === 'sun' ? 0 : 3)
  const direct = project([x, y, z], observer)
  const interpolationError = separation(direction(sky.azimuth, sky.elevation), direction(direct.azimuth, direct.elevation))
  assert.ok(interpolationError <= 0.005, `Interpolation difference ${interpolationError}° at ${ref.utc}`)
  largestInterpolationError = Math.max(largestInterpolationError, interpolationError)
}

for (const preset of presets) {
  if (model.terrain) assert.ok(profileFor(model, preset), `Missing terrain for ${preset.id}`)
}
const finalDate = Date.parse('2027-12-31T23:59:00Z')
assert.ok(bodyVector(ephemeris, finalDate + 30 * DAY_MS, 'sun').every(Number.isFinite))

const demo = json<{ site: string; startA: string; startB: string }>('../public/data/demo.json')
const demoSite = presets.find(site => site.id === demo.site)
assert.ok(demoSite)
assert.equal(Date.parse(demo.startB) - Date.parse(demo.startA), 3 * DAY_MS)
const profile = profileFor(model, demoSite)
const observer = makeObserver(demoSite, model, profile)
const landings = [demo.startA, demo.startB]
const results = landings.map(date => computeScenario(ephemeris, observer, Date.parse(date), 7 * DAY_MS))
const [a, b] = results
const overlapA = totalHours(a.both)
const overlapB = totalHours(b.both)

console.log(`Horizons: ${refs.samples.length} positions, maximum separation ${largestHorizonsError.toFixed(6)}°.`)
console.log(`SPICE midpoints: ${refs.samples.length} positions, maximum interpolation error ${largestInterpolationError.toFixed(6)}°.`)
console.log(`Demo: ${demoSite.name}, overlap ${overlapA.toFixed(1)} h → ${overlapB.toFixed(1)} h.`)

if (model.terrain) {
  assert.ok(profile?.layers)
  assert.ok(totalHours(b.sun.windows) > totalHours(a.sun.windows))
  assert.ok(totalHours(a.earth.windows) > 0 && b.earth.windows.length === 0)
  assert.ok(overlapA > 0 && overlapB === 0)
  const benchmark = json<{
    site: string
    lat: number
    lon: number
    observerHeightM: number
    groundElevationM: number
    azimuthStepDeg: number
    durationSeconds: number
    sources: NonNullable<typeof profile.layers>
    cases: { landingUtc: string; windowsElapsedSeconds: Record<Body, Interval[]> }[]
  }>('../data/ridge-benchmark.json')
  assert.equal(benchmark.site, demoSite.id)
  assert.equal(benchmark.lat, demoSite.lat)
  assert.equal(benchmark.lon, demoSite.lon)
  assert.equal(benchmark.observerHeightM, model.observerHeightM)
  assert.equal(benchmark.groundElevationM, profile.siteHeightM)
  assert.equal(benchmark.azimuthStepDeg, 360 / profile.anglesDeg.length)
  assert.equal(benchmark.durationSeconds, 7 * DAY_MS / 1000)
  assert.deepEqual(benchmark.sources, profile.layers)
  assert.deepEqual(benchmark.cases.map(entry => entry.landingUtc), landings)
  let largestCrossingError = 0
  let crossingCount = 0
  for (const [index, entry] of benchmark.cases.entries()) {
    for (const body of ['sun', 'earth'] as const) {
      const expected = entry.windowsElapsedSeconds[body]
      const actual = results[index][body].windows
      assert.equal(actual.length, expected.length, `Window count for ${entry.landingUtc} / ${body}`)
      for (const [windowIndex, window] of expected.entries()) {
        for (const [edge, seconds] of window.entries()) {
          const error = Math.abs(actual[windowIndex][edge] - seconds * 1000)
          if (seconds > 0 && seconds < benchmark.durationSeconds) {
            largestCrossingError = Math.max(error, largestCrossingError)
            crossingCount += 1
          } else {
            assert.equal(error, 0, 'Observation window must clip to the exact start or end')
          }
        }
      }
    }
  }
  assert.equal(crossingCount, 2)
  assert.ok(largestCrossingError <= 2 * MINUTE_MS, `Ridge crossing drift of ${largestCrossingError / 1000} seconds`)
  console.log(`Ridge benchmark: ${crossingCount} horizon crossings, maximum difference ${(largestCrossingError / 1000).toFixed(1)} s.`)
}
