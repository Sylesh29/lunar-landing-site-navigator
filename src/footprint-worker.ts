import { evaluateFootprint, validateFootprintData } from './footprint.ts'
import type { FootprintRequest } from './footprint.ts'

self.onmessage = async ({ data }: MessageEvent<{ request: FootprintRequest; terrainUrl: string }>) => {
  try {
    const response = await fetch(data.terrainUrl)
    if (!response.ok) throw new Error('Footprint terrain is unavailable.')
    self.postMessage({ result: evaluateFootprint(validateFootprintData(await response.json()), data.request) })
  } catch {
    self.postMessage({ error: 'Could not evaluate the footprint. Try the search again.' })
  }
}
