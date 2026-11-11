import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { comparisonLink, readComparisonLink } from '../src/comparison-link.ts'
import { candidateSummary, evaluateFootprint, initialFootprint, samplePosition, validateFootprintData } from '../src/footprint.ts'
import type { FootprintRequest } from '../src/footprint.ts'
import { initialLimits, parseLimits } from '../src/planning.ts'
import { DAY_MS, readEphemeris } from '../src/science.ts'
import type { Model } from '../src/science.ts'

const asset = (file: string) => new URL(`../public/data/${file}`, import.meta.url)
const model: Model = JSON.parse(readFileSync(asset('model.json'), 'utf8'))
const data = validateFootprintData(JSON.parse(readFileSync(asset('ridge-footprint.json'), 'utf8')))
const bytes = readFileSync(asset('vectors.bin'))
const request: FootprintRequest = {
  ephemeris: readEphemeris(model, Uint8Array.from(bytes).buffer),
  referenceRadiusKm: model.referenceRadiusKm,
  start: Date.parse('2027-08-30T00:00Z'),
  duration: 7 * DAY_MS,
  settings: initialFootprint,
  limits: parseLimits(initialLimits)!,
}

test('a 2 m ridge footprint has no qualifying date and exposes the LROC sun gap', () => {
  const result = evaluateFootprint(data, request)
  assert.equal(result.candidates.length, 29)
  const { earliest, widest } = candidateSummary(result)
  assert.equal(earliest, undefined)
  assert.equal(widest.utc, Date.parse('2027-09-14T00:00Z'))
  const september13 = result.candidates[14]
  assert.deepEqual(september13.counts, [14, 10])
  assert.equal(september13.binding.surface, 1)
  assert.equal(september13.binding.constraint, 'Sun gap')
  assert.equal(samplePosition(september13.binding.sample).label, '50 m S')
  assert.ok(september13.points[1][september13.binding.sample].margins['Sun gap'] < -40)
})

test('a 5 m footprint rejects the LOLA-only choice and finds the first two-terrain date', () => {
  const result = evaluateFootprint(data, { ...request, settings: { panel: 5, antenna: 5 } })
  const { earliest, widest } = candidateSummary(result)
  assert.deepEqual(result.candidates[13].counts, [17, 15])
  assert.deepEqual(earliest?.counts, [17, 17])
  assert.equal(earliest?.utc, Date.parse('2027-09-13T00:00Z'))
  assert.equal(widest.utc, Date.parse('2027-09-22T00:00Z'))
})

test('search clamps to the last supported landing even with a 30-day analysis', () => {
  const start = Date.parse('2030-12-31T23:59Z')
  const result = evaluateFootprint(data, { ...request, start, duration: 30 * DAY_MS })
  assert.deepEqual(result.candidates.map(candidate => candidate.utc), [start])
  assert.ok(Number.isFinite(result.candidates[0].binding.hours))
})

test('links preserve the footprint settings and reject an invalid height', () => {
  const a = { site: 'ridge', date: '2027-08-27', time: '00:00', lat: '-89.468', lon: '222.6' }
  const state = {
    a, b: { ...a, date: '2027-09-13' }, days: 7, limits: initialLimits,
    footprint: { panel: 5, antenna: 5, anchor: request.start } as const,
  }
  const read = (settings: typeof state) => readComparisonLink(
    new URL(comparisonLink('https://example.org/navigator/', settings)).search, ['ridge'],
  )
  assert.deepEqual(read(state), state)
  assert.equal(read({ ...state, footprint: { ...state.footprint, antenna: 3 as 5 } }), null)
})
