import { customHorizon, polarXY, readPolarGrid } from './polar.ts'
import type { PolarGrid } from './polar.ts'
import type { Coordinates, HorizonProfile } from './science.ts'

export type TerrainRequest = {
  id: number
  assetUrl: string
  grid: PolarGrid
  heightM: number
  sites: Coordinates[]
}

export type TerrainReply =
  | { id: number; profiles: HorizonProfile[] }
  | { id: number; error: true }

const tiles = new Map<string, Promise<Int16Array>>()

async function fetchTile(url: string, width: number, height: number, missing: number) {
  const response = await fetch(url)
  if (!response.ok || !response.body) throw new Error('The polar grid could not be downloaded.')
  const stream = response.body.pipeThrough(new DecompressionStream('deflate'))
  return readPolarGrid(await new Response(stream).arrayBuffer(), { width, height, missing })
}

async function profileAt(site: Coordinates, request: TerrainRequest) {
  const grid = request.grid
  const { tileSize, gridM } = grid
  const { x, y } = polarXY(site, grid.radiusM)
  // Include the stereographic scale factor at the outer coverage boundary and bilinear padding.
  const padding = grid.reachM * 1.005 + 2 * gridM
  const tileMeters = tileSize * gridM
  const firstCol = Math.max(0, Math.floor((x - padding - grid.xMinM) / tileMeters))
  const lastCol = Math.min(Math.ceil(grid.width / tileSize) - 1, Math.floor((x + padding - grid.xMinM) / tileMeters))
  const firstRow = Math.max(0, Math.floor((grid.yMaxM - y - padding) / tileMeters))
  const lastRow = Math.min(Math.ceil(grid.height / tileSize) - 1, Math.floor((grid.yMaxM - y + padding) / tileMeters))
  const width = Math.min(grid.width, (lastCol + 1) * tileSize) - firstCol * tileSize
  const height = Math.min(grid.height, (lastRow + 1) * tileSize) - firstRow * tileSize
  const pixels = new Int16Array(width * height)
  const loaded = []
  for (let row = firstRow; row <= lastRow; row += 1) {
    for (let col = firstCol; col <= lastCol; col += 1) {
      const tileWidth = Math.min(tileSize, grid.width - col * tileSize)
      const tileHeight = Math.min(tileSize, grid.height - row * tileSize)
      const url = new URL(`${row}-${col}.bin?v=${grid.sha256.slice(0, 12)}`, request.assetUrl).href
      let tile = tiles.get(url)
      if (!tile) {
        tile = fetchTile(url, tileWidth, tileHeight, grid.missing).catch(error => {
          tiles.delete(url)
          throw error
        })
        tiles.set(url, tile)
      }
      loaded.push(tile.then(values => {
        const targetRow = (row - firstRow) * tileSize
        const targetCol = (col - firstCol) * tileSize
        for (let localRow = 0; localRow < tileHeight; localRow += 1) {
          const from = localRow * tileWidth
          pixels.set(values.subarray(from, from + tileWidth), (targetRow + localRow) * width + targetCol)
        }
      }))
    }
  }
  await Promise.all(loaded)
  return customHorizon(site, {
    ...grid, width, height,
    xMinM: grid.xMinM + firstCol * tileMeters,
    yMaxM: grid.yMaxM - firstRow * tileMeters,
  }, pixels, request.heightM)
}

self.onmessage = async ({ data: request }: MessageEvent<TerrainRequest>) => {
  try {
    const profiles = await Promise.all(request.sites.map(site => profileAt(site, request)))
    self.postMessage({ id: request.id, profiles } satisfies TerrainReply)
  } catch {
    self.postMessage({ id: request.id, error: true } satisfies TerrainReply)
  }
}
