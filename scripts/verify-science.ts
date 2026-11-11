import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import {
  DAY_MS, bodyVector, computeScenario, makeObserver, positionAt, profileFor,
  project, readEphemeris, totalHours,
} from '../src/science.ts'
import type { Body, Model, Preset, Vector } from '../src/science.ts'

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
const observer = makeObserver(demoSite, model, profileFor(model, demoSite))
const totalA = totalHours(computeScenario(ephemeris, observer, Date.parse(demo.startA), 7 * DAY_MS).both)
const totalB = totalHours(computeScenario(ephemeris, observer, Date.parse(demo.startB), 7 * DAY_MS).both)
assert.ok(totalB - totalA > 1, 'The default scenario must demonstrate a visible improvement.')
console.log(`Horizons: ${refs.samples.length} positions, maximum separation ${largestHorizonsError.toFixed(6)}°.`)
console.log(`SPICE midpoints: ${refs.samples.length} positions, maximum interpolation error ${largestInterpolationError.toFixed(6)}°.`)
console.log(`Demo: ${demoSite.name}, overlap ${totalA.toFixed(1)} h → ${totalB.toFixed(1)} h (+${(totalB - totalA).toFixed(1)} h).`)
