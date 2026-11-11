import { wrapDegrees } from './science.ts'
import type { Coordinates, HorizonProfile } from './science.ts'

export type PolarGrid = {
  tileDirectory: string
  tileSize: number
  sha256: string
  source: string
  sourceSha256: string
  frame: 'MOON_ME'
  projection: 'south-polar-stereographic'
  radiusM: number
  width: number
  height: number
  gridM: number
  xMinM: number
  yMaxM: number
  scaleM: number
  missing: number
  minSouthLatitude: number
  reachM: number
  mapExtentM: number
}

const RAD = Math.PI / 180

export function polarXY(site: Coordinates, radius: number) {
  const rho = 2 * radius * Math.tan((90 + site.lat) * RAD / 2)
  return { x: rho * Math.sin(site.lon * RAD), y: rho * Math.cos(site.lon * RAD) }
}

export function polarSite(x: number, y: number, radius: number): Coordinates {
  return {
    lat: -90 + 2 * Math.atan(Math.hypot(x, y) / (2 * radius)) / RAD,
    lon: wrapDegrees(Math.atan2(x, y) / RAD),
  }
}

export function readPolarGrid(buffer: ArrayBuffer, grid: Pick<PolarGrid, 'width' | 'height' | 'missing'>) {
  if (buffer.byteLength !== grid.width * grid.height * 2) {
    throw new Error('The polar elevation grid is incomplete.')
  }
  const view = new DataView(buffer)
  const values = new Int16Array(grid.width * grid.height)
  for (let row = 0; row < grid.height; row += 1) {
    let previous = 0
    for (let col = 0; col < grid.width; col += 1) {
      const index = row * grid.width + col
      const delta = view.getInt16(index * 2, true)
      if (delta === grid.missing) {
        values[index] = grid.missing
        previous = 0
      } else {
        previous += delta
        values[index] = previous
      }
    }
  }
  return values
}

export function customHorizon(site: Coordinates, grid: PolarGrid, values: Int16Array, observerHeightM: number): HorizonProfile {
  if (site.lat > grid.minSouthLatitude || site.lat < -90) throw new Error('The site is outside the polar grid.')
  const sample = (x: number, y: number) => {
    const col = (x - grid.xMinM) / grid.gridM - 0.5
    const row = (grid.yMaxM - y) / grid.gridM - 0.5
    const i = Math.floor(col)
    const j = Math.floor(row)
    if (i < 0 || i + 1 >= grid.width || j < 0 || j + 1 >= grid.height) {
      throw new Error('A skyline bearing leaves the polar grid.')
    }
    const index = j * grid.width + i
    const a = values[index]
    const b = values[index + 1]
    const c = values[index + grid.width]
    const d = values[index + grid.width + 1]
    if (a === grid.missing || b === grid.missing || c === grid.missing || d === grid.missing) {
      throw new Error('A skyline bearing crosses missing terrain.')
    }
    const dx = col - i
    const dy = row - j
    return ((a + (b - a) * dx) * (1 - dy) + (c + (d - c) * dx) * dy) * grid.scaleM
  }
  const { x, y } = polarXY(site, grid.radiusM)
  const siteHeightM = sample(x, y)
  const observerRadius = grid.radiusM + siteHeightM + observerHeightM
  const phi = site.lat * RAD
  const lambda = site.lon * RAD
  const upX = Math.cos(phi) * Math.cos(lambda)
  const upY = Math.cos(phi) * Math.sin(lambda)
  const upZ = Math.sin(phi)
  const distanceStep = grid.gridM / 2
  const arcs = Array.from({ length: Math.ceil(grid.reachM / distanceStep) }, (_, index) => {
    const theta = Math.min((index + 1) * distanceStep, grid.reachM) / grid.radiusM
    return [Math.cos(theta), Math.sin(theta)]
  })
  const anglesDeg = Array.from({ length: 360 }, (_, bearing) => {
    const az = bearing * RAD
    const cosAz = Math.cos(az)
    const sinAz = Math.sin(az)
    const rayX = -cosAz * Math.sin(phi) * Math.cos(lambda) - sinAz * Math.sin(lambda)
    const rayY = -cosAz * Math.sin(phi) * Math.sin(lambda) + sinAz * Math.cos(lambda)
    const rayZ = cosAz * Math.cos(phi)
    let maximum = -Infinity
    for (const [cosArc, sinArc] of arcs) {
      const factor = 2 * grid.radiusM / (1 - (cosArc * upZ + sinArc * rayZ))
      const targetRadius = grid.radiusM + sample(
        factor * (cosArc * upY + sinArc * rayY),
        factor * (cosArc * upX + sinArc * rayX),
      )
      const angle = Math.atan2(targetRadius * cosArc - observerRadius, targetRadius * sinArc)
      maximum = Math.max(maximum, angle)
    }
    return maximum / RAD
  })
  return { ...site, siteHeightM, anglesDeg, layers: [{ gridM: grid.gridM, maxDistanceM: grid.reachM, url: grid.source }] }
}
