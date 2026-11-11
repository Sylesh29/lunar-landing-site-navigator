import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  HOUR_MS, MINUTE_MS, bodyVector, horizonAt, intersectWindows, makeObserver,
  parseCoordinates, parseLanding, project, totalHours, visibilityWindows,
} from '../src/science.ts'
import type { Model } from '../src/science.ts'

const geometry = { referenceRadiusKm: 1737.4, observerHeightM: 2 } as Model

test('accepts valid 2027 UTC dates and normalizes east-positive longitude', () => {
  assert.equal(parseLanding('2027-12-31', '23:59'), Date.UTC(2027, 11, 31, 23, 59))
  assert.equal(parseLanding('2027-02-29', '00:00'), null)
  assert.equal(parseLanding('2027-01-01', '24:00'), null)
  assert.equal(parseLanding('2028-01-01', '00:00'), null)
  assert.equal(parseLanding('2027-01-01', ''), null)
  assert.deepEqual(parseCoordinates('-89.468', '-137.4'), { lat: -89.468, lon: 222.6 })
  assert.deepEqual(parseCoordinates('90', '360'), { lat: 90, lon: 0 })
  assert.equal(parseCoordinates('91', '0'), null)
  assert.equal(parseCoordinates('0', '361'), null)
  assert.equal(parseCoordinates(' ', '0'), null)
})

test('interpolates Sun and Earth Cartesian components through the last sample', () => {
  const values = new Float64Array([1, 2, 3, 4, 5, 6, 3, 4, 5, 6, 7, 8])
  const ephemeris = { start: 0, rows: 2, stepMs: HOUR_MS, data: new DataView(values.buffer) }
  assert.deepEqual(bodyVector(ephemeris, HOUR_MS / 2, 'sun'), [2, 3, 4])
  assert.deepEqual(bodyVector(ephemeris, HOUR_MS, 'earth'), [6, 7, 8])
  assert.throws(() => bodyVector(ephemeris, HOUR_MS + 1, 'sun'), RangeError)
})

test('projects through topocentric east, north and up and computes a 2 m horizon dip', () => {
  const observer = makeObserver({ lat: 0, lon: 0 }, geometry)
  const [x] = observer.position
  assert.equal(project([x, 100, 0], observer).azimuth, 90)
  assert.equal(project([x, 0, 100], observer).azimuth, 0)
  assert.equal(project([x, -100, 0], observer).azimuth, 270)
  assert.equal(project([x, 0, -100], observer).azimuth, 180)
  assert.equal(project([x + 100, 0, 0], observer).azimuth, null)
  assert.equal(project([x + 100, 0, 0], observer).elevation, 90)
  assert.ok(Math.abs(observer.dip - (-0.086936)) < 0.0001)
})

test('interpolates the north seam between the last and first terrain bearings', () => {
  const angles = Array<number>(360).fill(0)
  angles[359] = 4
  angles[0] = 2
  assert.equal(horizonAt(angles, 359.5), 3)
  assert.equal(horizonAt(angles, -0.5), 3)
  assert.equal(horizonAt(angles, 360), 2)
  const finerAngles = Array<number>(1440).fill(0)
  finerAngles[1439] = 4
  finerAngles[0] = 2
  assert.equal(horizonAt(finerAngles, 359.875), 3)
})

test('finds and refines rise and set times', () => {
  const t = MINUTE_MS
  const result = visibilityWindows(30 * t, elapsed => (elapsed - 3.5 * t) * (17 * t - elapsed))
  assert.deepEqual(result.transitions.map(event => event.visible), [true, false])
  assert.equal(result.windows.length, 1)
  assert.ok(Math.abs(result.windows[0][0] - 3.5 * t) < t)
  assert.ok(Math.abs(result.windows[0][1] - 17 * t) < t)
})

test('clips windows at the exact endpoints and handles always and never visible', () => {
  const t = MINUTE_MS
  assert.deepEqual(visibilityWindows(13 * t, () => 1).windows, [[0, 13 * t]])
  assert.deepEqual(visibilityWindows(13 * t, () => -1).windows, [])
  assert.deepEqual(visibilityWindows(13 * t, elapsed => 13 * t - elapsed).windows, [[0, 13 * t]])
  assert.deepEqual(visibilityWindows(13 * t, elapsed => elapsed).windows, [[0, 13 * t]])
  assert.deepEqual(visibilityWindows(13 * t, elapsed => elapsed - 13 * t).windows, [])
})

test('intersects disjoint Sun and Earth intervals and totals them in hours', () => {
  const h = HOUR_MS
  const both = intersectWindows([[0, 4 * h], [6 * h, 10 * h]], [[2 * h, 6 * h], [8 * h, 9 * h]])
  assert.deepEqual(both, [[2 * h, 4 * h], [8 * h, 9 * h]])
  assert.equal(totalHours(both), 3)
})
