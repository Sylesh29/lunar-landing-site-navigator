import { readFileSync, writeFileSync } from 'node:fs'
import { DAY_MS, computeScenario, makeObserver, profileFor, readEphemeris, totalHours } from '../src/science.ts'
import type { Model, Preset } from '../src/science.ts'

const json = <T>(path: string): T => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
const model = json<Model>('../public/data/model.json')
const vectors = readFileSync(new URL(`../public/data/${model.ephemeris.file}`, import.meta.url))
const ephemeris = readEphemeris(model, Uint8Array.from(vectors).buffer)
const presets = json<Preset[]>('../data/sites.json')
const start = Date.parse('2027-01-01T00:00:00Z')

let best = { site: '', startA: '', startB: '', gain: 0 }
for (const site of presets) {
  const observer = makeObserver(site, model, profileFor(model, site))
  const overlaps = Array.from({ length: 365 }, (_, day) =>
    totalHours(computeScenario(ephemeris, observer, start + day * DAY_MS, 7 * DAY_MS).both))
  for (let day = 0; day + 3 < overlaps.length; day += 1) {
    const gain = overlaps[day + 3] - overlaps[day]
    if (gain > best.gain) {
      best = {
        site: site.id,
        startA: new Date(start + day * DAY_MS).toISOString(),
        startB: new Date(start + (day + 3) * DAY_MS).toISOString(),
        gain,
      }
    }
  }
}
if (!best.site) throw new Error('No improvement from a 72-hour delay was found.')
writeFileSync(new URL('../public/data/demo.json', import.meta.url), JSON.stringify(best, null, 2) + '\n')
console.log(best)
