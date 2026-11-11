import { useState } from 'react'
import { polarSite, polarXY } from './polar.ts'
import type { PolarGrid } from './polar.ts'
import type { Coordinates } from './science.ts'

export function PolarMap({ grid, sites, onPick }: {
  grid: PolarGrid
  sites: [Coordinates | null, Coordinates | null]
  onPick: (index: number, site: Coordinates) => void
}) {
  const [target, setTarget] = useState(1)
  const [notice, setNotice] = useState('')
  const radius = polarXY({ lat: grid.minSouthLatitude, lon: 0 }, grid.radiusM).y
  const sameSite = sites[0] && sites[1] && sites[0].lat === sites[1].lat && sites[0].lon === sites[1].lon
  return <details className="panel extra-panel">
    <summary>Pick a site on the south pole map</summary>
    <div className="extra-content polar-layout">
      <div>
        <h3>LOLA terrain coverage</h3>
        <p>Choose a scenario, then select a point inside the circle. Custom terrain is available from {Math.abs(grid.minSouthLatitude)}°S to the pole. You can also enter coordinates in the landing form.</p>
        <div className="segmented map-target" role="group" aria-label="Scenario to update">
          {['Set A', 'Set B'].map((label, index) =>
            <button type="button" key={label} aria-pressed={target === index} onClick={() => setTarget(index)}>{label}</button>)}
        </div>
        <p className="map-message" role="status">{notice}</p>
      </div>
      <div className="polar-map" onClick={event => {
        const rect = event.currentTarget.getBoundingClientRect()
        const x = ((event.clientX - rect.left) / rect.width * 2 - 1) * grid.mapExtentM
        const y = (1 - (event.clientY - rect.top) / rect.height * 2) * grid.mapExtentM
        const site = polarSite(x, y, grid.radiusM)
        if (site.lat > grid.minSouthLatitude) {
          setNotice('Choose a point inside the coverage circle.')
          return
        }
        onPick(target, { lat: Number(site.lat.toFixed(5)), lon: Number(site.lon.toFixed(5)) })
        setNotice(`Scenario ${target === 0 ? 'A' : 'B'} updated.`)
      }}>
        <img src={`${import.meta.env.BASE_URL}data/polar-map.webp`} alt="Shaded relief of the lunar south pole, with 0 degrees longitude at the top" loading="lazy" />
        <span className="map-ring" style={{ width: `${radius / grid.mapExtentM * 100}%` }} aria-hidden="true" />
        <span className="map-north" aria-hidden="true">0° E</span>
        {sites.map((site, index) => {
          if (!site || site.lat > grid.minSouthLatitude || (sameSite && index === 1)) return null
          const { x, y } = polarXY(site, grid.radiusM)
          return <span key={index} className={`map-pin map-pin-${index}`}
            style={{ left: `${50 + x / grid.mapExtentM * 50}%`, top: `${50 - y / grid.mapExtentM * 50}%` }}>
            {sameSite ? 'A/B' : index === 0 ? 'A' : 'B'}
          </span>
        })}
      </div>
    </div>
  </details>
}
