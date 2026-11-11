import { useEffect, useId, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import presets from '../data/sites.json'
import { comparisonLink, readComparisonLink } from './comparison-link.ts'
import { PlanningPanel } from './PlanningPanel.tsx'
import { PolarMap } from './PolarMap.tsx'
import { assessWindows, horizontalSunHours, initialLimits, nearbyDates, parseLimits, planningWindows, windowCsv } from './planning.ts'
import type { LandingDraft as Draft } from './planning.ts'
import type { PolarGrid } from './polar.ts'
import {
  DAY_MS, MAX_DATE, MIN_DATE, MINUTE_MS, computeScenario, makeObserver, parseCoordinates,
  parseLanding, positionAt, readEphemeris, totalHours,
} from './science.ts'
import type { Body, Coordinates, Ephemeris, Interval, Model, Observer, ScenarioResult } from './science.ts'
import { useTerrain } from './use-terrain.ts'

type Demo = { site: string; startA: string; startB: string }
type Loaded = { model: Model; ephemeris: Ephemeris; demo: Demo; grid?: PolarGrid }
type ScenarioId = 'A' | 'B'

const bodyNames = { sun: 'Sun', earth: 'Earth', both: 'Overlap' } as const
const bodies = ['sun', 'earth'] as const
const displayUtc = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  hourCycle: 'h23', timeZone: 'UTC',
})

function Icon({ name, size = 18 }: { name: keyof typeof paths; size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}

const paths = {
  orbit: <><circle cx="12" cy="12" r="6.5" /><ellipse cx="12" cy="12" rx="11" ry="3.6" transform="rotate(-35 12 12)" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5" /></>,
  earth: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5a13 13 0 0 0 0 17m0-17a13 13 0 0 1 0 17" /></>,
  both: <><circle cx="9" cy="12" r="6" /><circle cx="15" cy="12" r="6" /></>,
  pin: <><path d="M19 10c0 4-7 10-7 10S5 14 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></>,
  mountain: <path d="m2 19 6-9 3 4 4-8 7 13H2Zm9-5 3 5" />,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  external: <path d="M13 5h6v6m0-6-9 9m7-1v6H5V7h6" />,
}

async function loadData(signal: AbortSignal): Promise<Loaded> {
  const get = async (file: string) => {
    const response = await fetch(`${import.meta.env.BASE_URL}data/${file}`, { signal, cache: 'no-cache' })
    if (!response.ok) throw new Error('The science assets could not be loaded.')
    return response
  }
  const [modelResponse, demoResponse, grid] = await Promise.all([
    get('model.json'), get('demo.json'), get('polar.json').then(response => response.json() as Promise<PolarGrid>).catch(() => undefined),
  ])
  const model: Model = await modelResponse.json()
  const demo: Demo = await demoResponse.json()
  const vectors = await get(`${model.ephemeris.file}?v=${model.ephemeris.sha256.slice(0, 12)}`)
  return { model, demo, grid, ephemeris: readEphemeris(model, await vectors.arrayBuffer()) }
}

function draft(site: string, utc: string): Draft {
  return { site, date: utc.slice(0, 10), time: utc.slice(11, 16), lat: '-89.468', lon: '222.6' }
}

function resolveSite(config: Draft) {
  if (config.site !== 'custom') return presets.find(site => site.id === config.site) ?? null
  const coordinates = parseCoordinates(config.lat, config.lon)
  return coordinates && { ...coordinates, name: 'Custom site', region: 'User-defined coordinates' }
}

function scenarioLabel(site: NonNullable<ReturnType<typeof resolveSite>>) {
  const latitude = `${Math.abs(site.lat).toFixed(4).replace(/\.?0+$/, '')}°${site.lat < 0 ? 'S' : 'N'}`
  const longitude = `${site.lon.toFixed(4).replace(/\.?0+$/, '')}°E`
  return `${latitude}, ${longitude}`
}

function ScenarioEditor({ id, value, onChange }: { id: ScenarioId; value: Draft; onChange: (value: Draft) => void }) {
  const site = resolveSite(value)
  const validTime = parseLanding(value.date, value.time) !== null
  const set = (key: keyof Draft, next: string) => onChange({ ...value, [key]: next })
  return <fieldset className={`scenario scenario-${id.toLowerCase()}`}>
    <legend className="sr-only">Scenario {id}</legend>
    <div className="scenario-heading">
      <span className="scenario-letter" aria-hidden="true">{id}</span>
      <div><h2>{id === 'A' ? 'Baseline' : 'Alternative'}</h2><p>Scenario {id}</p></div>
    </div>
    <label className="field">Landing site
      <select value={value.site} onChange={event => set('site', event.target.value)}>
        {presets.map(preset => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
        <option value="custom">Custom coordinates</option>
      </select>
    </label>
    {value.site === 'custom' && <div className="fields">
      <label className="field">Latitude (°N)
        <input type="number" min="-90" max="90" step="any" value={value.lat}
          onChange={event => set('lat', event.target.value)} aria-invalid={!site} />
      </label>
      <label className="field">Longitude (°E)
        <input type="number" min="-180" max="360" step="any" value={value.lon}
          onChange={event => set('lon', event.target.value)} aria-invalid={!site} />
      </label>
    </div>}
    <div className="site-meta">
      <Icon name="pin" size={14} />
      {site ? <span>{site.region} <span className="coordinates">{scenarioLabel(site)}</span></span>
        : <span className="field-error">Latitude −90 to 90°. Longitude −180 to 360° east.</span>}
    </div>
    <div className="fields">
      <label className="field">Landing date
        <input type="date" min={MIN_DATE} max={MAX_DATE} value={value.date}
          onChange={event => set('date', event.target.value)} aria-invalid={!validTime} />
      </label>
      <label className="field">Time (UTC)
        <input type="time" value={value.time} onChange={event => set('time', event.target.value)}
          aria-invalid={!validTime} />
      </label>
    </div>
    {!validTime && <p className="field-error">Enter a complete UTC date and time from 2026 through 2030.</p>}
  </fieldset>
}

const formatHours = (value: number) => value.toFixed(1)
const formatUtc = (value: number) => `${displayUtc.format(value).replace(',', ' ·')} UTC`
const signed = (value: number) => {
  if (Math.abs(value) < 0.05) return '0.0'
  return `${value > 0 ? '+' : '−'}${Math.abs(value).toFixed(1)}`
}

function Totals({ results, days }: { results: [ScenarioResult, ScenarioResult]; days: number }) {
  const metrics = [
    { key: 'both', title: 'Sun + Earth overlap', values: results.map(result => totalHours(result.both)) },
    { key: 'sun', title: 'Sun visibility', values: results.map(result => totalHours(result.sun.windows)) },
    { key: 'earth', title: 'Earth visibility', values: results.map(result => totalHours(result.earth.windows)) },
  ] as const
  return <div className="metric-grid" aria-label={`Visibility totals over ${days} days`}>
    {metrics.map(({ key, title, values: [a, b] }) => <article className={`metric metric-${key}`} key={key}>
      <div className="metric-heading"><span className="metric-icon"><Icon name={key} /></span><h3>{title}</h3></div>
      <div className="metric-figures">
        <div><span className="metric-scenario">A · Baseline</span><strong>{formatHours(a)}<small>h</small></strong></div>
        <div><span className="metric-scenario">B · Alternative</span><strong>{formatHours(b)}<small>h</small></strong></div>
        <div className="metric-delta"><span className="metric-scenario">B − A</span><strong>{signed(b - a)}<small>h</small></strong></div>
      </div>
    </article>)}
  </div>
}

function elapsedLabel(elapsed: number) {
  const minutes = Math.round(elapsed / MINUTE_MS)
  const days = Math.floor(minutes / (24 * 60))
  const hours = Math.floor(minutes / 60) % 24
  const remaining = minutes % 60
  return [days && `${days}d`, hours && `${hours}h`, (remaining || (!days && !hours)) && `${remaining}m`].filter(Boolean).join(' ')
}

function Timeline({ results, starts, elapsed, duration, onSeek, operating, mode, onMode }: {
  results: ScenarioResult[]
  starts: [number, number]
  elapsed: number
  duration: number
  onSeek: (elapsed: number) => void
  operating: ScenarioResult[] | null
  mode: 'geometry' | 'operating'
  onMode: (mode: 'geometry' | 'operating') => void
}) {
  const days = duration / DAY_MS
  const ticks = days === 7 ? [0, 1, 2, 3, 4, 5, 6, 7] : [0, 5, 10, 15, 20, 25, 30]
  const cursor = elapsed / duration * 100
  const rows = (result: ScenarioResult): [keyof typeof bodyNames, Interval[]][] => [
    ['sun', result.sun.windows], ['earth', result.earth.windows], ['both', result.both],
  ]
  const filtered = mode === 'operating' && operating
  const visibleResults = filtered || results
  return <section className="panel timeline" aria-labelledby="timeline-title">
    <div className="panel-heading"><div><h2 id="timeline-title">Visibility windows</h2><p>Elapsed time from each landing</p></div>
      <output className="elapsed-chip">T+ {elapsedLabel(elapsed)}</output>
    </div>
    <div className="segmented timeline-mode" role="group" aria-label="Visibility window mode">
      <button type="button" aria-pressed={!filtered} onClick={() => onMode('geometry')}>Geometry</button>
      <button type="button" aria-pressed={Boolean(filtered)} disabled={!operating} onClick={() => onMode('operating')}>With mission limits</button>
    </div>
    <div className="timeline-chart">
      <div className="time-scale" aria-hidden="true">
        {ticks.map(day => <span key={day} style={{ left: `${day / days * 100}%` }}>{day}d</span>)}
      </div>
      {visibleResults.map((result, index) => <div key={index} className="timeline-group">
        <div className="timeline-date">
          <span className={`scenario-letter mini scenario-${index === 0 ? 'a' : 'b'}`}>{index === 0 ? 'A' : 'B'}</span>
          <time dateTime={new Date(starts[index] + elapsed).toISOString()}>{formatUtc(starts[index] + elapsed)}</time>
        </div>
        {rows(result).map(([body, windows]) => <div className="time-row" key={body}>
          <span className={`time-label tone-${body}`}><Icon name={body} size={14} />{bodyNames[body]}</span>
          <div className="lane" aria-hidden="true" onPointerDown={event => {
            const rect = event.currentTarget.getBoundingClientRect()
            const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
            onSeek(Math.round(fraction * duration / MINUTE_MS) * MINUTE_MS)
          }}>
            {ticks.map(day => <i className="grid-tick" key={day} style={{ left: `${day / days * 100}%` }} />)}
            {windows.map(([start, end]) => <span className={`window window-${body}`} key={start}
              style={{ left: `${start / duration * 100}%`, width: `${(end - start) / duration * 100}%` }}
              title={`T+ ${elapsedLabel(start)} – ${elapsedLabel(end)}`} />)}
            <span className="cursor-line" style={{ left: `${cursor}%` }} />
          </div>
        </div>)}
      </div>)}
    </div>
    <label className="scrubber"><span><Icon name="clock" size={16} /> Time cursor</span>
      <input type="range" min={0} max={duration / MINUTE_MS} step={1}
        value={elapsed / MINUTE_MS} aria-valuetext={`T plus ${elapsedLabel(elapsed)}`}
        onChange={event => onSeek(Number(event.target.value) * MINUTE_MS)} />
    </label>
    <details className="intervals"><summary>Window start and end times (UTC)</summary>
      {visibleResults.map((result, index) => <div className="interval-group" key={index}>
        <h3>Scenario {index === 0 ? 'A' : 'B'}</h3>
        <dl>{rows(result).map(([body, windows]) => <div key={body}>
          <dt>{bodyNames[body]}</dt><dd>{windows.length
            ? <ul>{windows.map(([start, end]) => <li key={start}>
              {formatUtc(starts[index] + start)} → {formatUtc(starts[index] + end)}
            </li>)}</ul>
            : 'No visible window'}</dd>
        </div>)}</dl>
      </div>)}
    </details>
  </section>
}

type SkyPosition = ReturnType<typeof positionAt>
type BodyPositions = Record<Body, SkyPosition>
type SkyScale = { min: number; max: number; ticks: number[] }

function commonSkyScale(positions: BodyPositions[], observers: Observer[]): SkyScale {
  const elevations = positions.flatMap(values => bodies.map(body => values[body].elevation))
  const terrain = observers.flatMap(observer => observer.profile?.anglesDeg ?? [observer.dip])
  const low = Math.min(-4, ...elevations, ...terrain)
  const high = Math.max(4, ...elevations, ...terrain)
  const step = high - low > 50 ? 20 : high - low > 18 ? 10 : 5
  const min = Math.floor((low - 1) / step) * step
  const max = Math.ceil((high + 1) / step) * step
  return { min, max, ticks: Array.from({ length: (max - min) / step + 1 }, (_, i) => min + i * step) }
}

function Skyline({ observer, positions, scale }: {
  observer: Observer; positions: BodyPositions; scale: SkyScale
}) {
  const title = useId()
  const gradient = useId()
  const left = 39, right = 480, top = 14, bottom = 134
  const x = (azimuth: number) => left + (right - left) * azimuth / 360
  const y = (elevation: number) => top + (bottom - top) * (scale.max - elevation) / (scale.max - scale.min)
  const angles = observer.profile?.anglesDeg ?? Array<number>(360).fill(observer.dip)
  const line = [...angles, angles[0]].map((height, index) =>
    `${index === 0 ? 'M' : 'L'}${x(index * 360 / angles.length).toFixed(2)},${y(height).toFixed(2)}`).join(' ')
  return <svg className="skyline" viewBox="0 0 500 160" role="img" aria-labelledby={title}>
    <title id={title}>Sun and Earth position relative to the modeled skyline</title>
    <defs><linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stopColor="#64a49d" stopOpacity=".36" />
      <stop offset="100%" stopColor="#294750" stopOpacity=".16" />
    </linearGradient></defs>
    {scale.ticks.map(tick => <g key={tick}>
      <path d={`M${left} ${y(tick)}H${right}`} className={tick === 0 ? 'sky-zero' : 'sky-grid'} />
      <text x={left - 8} y={y(tick) + 3} textAnchor="end">{tick}°</text>
    </g>)}
    {[0, 90, 180, 270, 360].map((azimuth, index) => <g key={azimuth}>
      <path d={`M${x(azimuth)} ${top}V${bottom}`} className="sky-grid" />
      <text x={x(azimuth)} y={153} textAnchor="middle">{['N', 'E', 'S', 'W', 'N'][index]}</text>
    </g>)}
    <path d={`${line} L${right},${bottom} L${left},${bottom} Z`} fill={`url(#${gradient})`} />
    <path className="terrain-line" d={line} />
    {bodies.map(body => {
      const { azimuth, elevation, clearance } = positions[body]
      if (azimuth === null) return null
      return <g key={body} className={`sky-body tone-${body} ${clearance > 0 ? '' : 'below'}`}>
        <circle cx={x(azimuth)} cy={y(elevation)} r="8" fill="currentColor" opacity=".15" />
        {body === 'sun' ? <circle cx={x(azimuth)} cy={y(elevation)} r="4.5" />
          : <path d={`M${x(azimuth)} ${y(elevation) - 5}l5 5-5 5-5-5Z`} />}
      </g>
    })}
  </svg>
}

function HorizonCard({ id, site, observer, positions, scale, elapsed, result }: {
  id: ScenarioId; site: string; observer: Observer; positions: BodyPositions; scale: SkyScale
  elapsed: number; result: ScenarioResult
}) {
  return <section className="panel horizon-card" aria-label={`Scenario ${id} skyline`}>
    <div className="panel-heading"><div className="card-identity">
      <span className={`scenario-letter mini scenario-${id.toLowerCase()}`}>{id}</span><h3>{site}</h3>
    </div><span className="sky-label"><Icon name="mountain" size={15} /> Local skyline</span></div>
    <Skyline observer={observer} positions={positions} scale={scale} />
    <div className="sky-readouts">{bodies.map(body => {
      const point = positions[body]
      const visible = point.clearance > 0
      const next = result[body].transitions.find(event => event.elapsed > elapsed && event.visible !== visible)
      return <div key={body} className="sky-readout">
        <div className="sky-readout-heading">
          <strong className={`tone-${body}`}><Icon name={body} size={16} />{bodyNames[body]}</strong>
          <span className={`visibility ${visible ? 'visible' : ''}`}>{visible ? 'Visible' : 'Below horizon'}</span>
        </div>
        <dl><div><dt>Azimuth</dt><dd>{point.azimuth === null ? '—' : `${(Math.round(point.azimuth * 10) / 10 % 360).toFixed(1)}°`}</dd></div>
          <div><dt>Elevation</dt><dd>{signed(point.elevation)}°</dd></div>
          <div><dt>Clearance</dt><dd>{signed(point.clearance)}°</dd></div></dl>
        <p>{next ? `${next.visible ? 'Rises' : 'Sets'} in ~${elapsedLabel(next.elapsed - elapsed)}` : 'No change before view ends'}</p>
      </div>
    })}</div>
  </section>
}

function Methods({ model, grid }: { model: Model; grid?: PolarGrid }) {
  const ridgeLayers = model.terrain?.profiles.ridge?.layers
  return <details id="methods" className="panel methods">
    <summary><Icon name="orbit" /> Data and methods <span>Geometric screening</span></summary>
    <div className="methods-copy">
      <p>Sun and Earth positions are geometric disk centers, computed from bundled JPL SPICE vectors in the lunar Mean Earth frame. Azimuth runs clockwise from lunar north. Elevation is measured from the local horizontal plane. Clearance is elevation relative to the modeled skyline.</p>
      <p>Both models place the observer {model.observerHeightM} m above the surface. The LOLA terrain model uses an 80 m regional elevation grid out to 125 km. {ridgeLayers && <>Connecting Ridge uses a {ridgeLayers[0].gridM} m grid for the first {ridgeLayers[0].maxDistanceM / 1000} km. </>}The regional grid can smooth local features such as Athena’s 20 m crater. The smooth-sphere model uses a {model.referenceRadiusKm.toLocaleString('en-US')} km radius.</p>
      {grid && <p>Custom sites at {Math.abs(grid.minSouthLatitude)}°S and farther south use a {grid.gridM} m LOLA overview. The browser traces the skyline out to {grid.reachM / 1000} km. Narrow ridges and craters can fall below the grid resolution.</p>}
      <p>Sun-center visibility is a proxy for lighting opportunity. Earth-center visibility is a proxy for direct-to-Earth access. The screening model uses point targets and ideal illumination geometry. Eclipses, solar array output, ground-station access, and RF link budgets require separate analysis. Five-minute sampling can miss brief grazing windows.</p>
      <ul>{presets.map(site => <li key={site.id}><a href={site.source} target="_blank" rel="noreferrer">{site.name} coordinates <Icon name="external" size={13} /></a></li>)}
        <li><a href="https://pgda.gsfc.nasa.gov/products/90" target="_blank" rel="noreferrer">NASA LOLA south-pole DEM <Icon name="external" size={13} /></a></li>
        {ridgeLayers && <li><a href="https://github.com/Sylesh29/lunar-landing-site-navigator#connecting-ridge-benchmark" target="_blank" rel="noreferrer">Connecting Ridge benchmark and terrain sources <Icon name="external" size={13} /></a></li>}
        <li><a href="https://github.com/Sylesh29/lunar-landing-site-navigator/blob/main/docs/research.md" target="_blank" rel="noreferrer">Research and planning assumptions <Icon name="external" size={13} /></a></li>
        <li><a href="https://naif.jpl.nasa.gov/naif/" target="_blank" rel="noreferrer">NASA/JPL NAIF SPICE <Icon name="external" size={13} /></a></li>
      </ul>
    </div>
  </details>
}

function Planner({ model, ephemeris, demo, grid }: Loaded) {
  const [shared] = useState(() => readComparisonLink(window.location.search, presets.map(site => site.id)))
  const [a, setA] = useState(() => shared?.a ?? draft(demo.site, demo.startA))
  const [b, setB] = useState(() => shared?.b ?? draft(demo.site, demo.startB))
  const [days, setDays] = useState(shared?.days ?? 7)
  const [limitsDraft, setLimits] = useState(shared?.limits ?? initialLimits)
  const [shareText, setShareText] = useState('')
  const [shareStatus, setShareStatus] = useState('')
  const [timelineMode, setTimelineMode] = useState<'geometry' | 'operating'>('geometry')
  const [cursor, setCursor] = useState(0)
  const [notice, setNotice] = useState('')
  const duration = days * DAY_MS
  const elapsed = Math.min(cursor, duration)
  const aSite = useMemo(() => resolveSite(a), [a])
  const bSite = useMemo(() => resolveSite(b), [b])
  const startA = parseLanding(a.date, a.time)
  const startB = parseLanding(b.date, b.time)
  const terrain = useTerrain([aSite, bSite], model, grid, presets)
  const [aProfile, bProfile] = terrain.profiles
  const limits = useMemo(() => parseLimits(limitsDraft), [limitsDraft])

  useEffect(() => {
    setShareText('')
    setShareStatus('')
  }, [a, b, days, limitsDraft])

  const comparison = useMemo(() => {
    if (!aSite || !bSite || startA === null || startB === null || terrain.loading) return null
    const hasTerrain = Boolean(aProfile && bProfile)
    const observers: [Observer, Observer] = [
      makeObserver(aSite, model, hasTerrain ? aProfile : undefined),
      makeObserver(bSite, model, hasTerrain ? bProfile : undefined),
    ]
    const starts: [number, number] = [startA, startB]
    const results: [ScenarioResult, ScenarioResult] = [
      computeScenario(ephemeris, observers[0], startA, duration),
      computeScenario(ephemeris, observers[1], startB, duration),
    ]
    const terrainLabel = (observer: Observer) => {
      const layers = observer.profile?.layers
      if (!observer.profile) return 'Smooth sphere'
      if (layers?.length === 2) return `${layers[0].gridM} m local / ${layers[1].gridM} m regional`
      return `${layers?.[0].gridM ?? model.terrain?.gridM} m regional`
    }
    const [aTerrain, bTerrain] = observers.map(terrainLabel)
    const terrainSummary = aTerrain === bTerrain ? `${aTerrain} for both scenarios` : `A uses ${aTerrain} · B uses ${bTerrain}`
    return { observers, results, starts, hasTerrain, terrainSummary, terrainLabels: [aTerrain, bTerrain] }
  }, [aSite, bSite, aProfile, bProfile, terrain.loading, startA, startB, model, ephemeris, duration])

  const operating = useMemo(() => comparison && limits ? comparison.observers.map((observer, index) =>
    computeScenario(ephemeris, observer, comparison.starts[index], duration, limits)) : null,
  [comparison, ephemeris, duration, limits])
  const assessments = useMemo(() => operating && limits ? operating.map(result =>
    assessWindows(planningWindows(result), duration, limits)) : [], [operating, limits, duration])
  const exposure = useMemo(() => comparison ? comparison.observers.map((observer, index) =>
    horizontalSunHours(ephemeris, observer, comparison.starts[index], comparison.results[index].sun.windows)) : [],
  [comparison, ephemeris])

  function update(set: (value: Draft) => void, value: Draft) {
    set(value)
    setNotice('')
  }

  function delay() {
    if (startB === null) return
    const delayed = new Date(startB + 3 * DAY_MS).toISOString()
    if (delayed.slice(0, 10) > MAX_DATE) {
      setNotice('A 72-hour delay would move Scenario B past the supported range.')
      return
    }
    setB({ ...b, date: delayed.slice(0, 10), time: delayed.slice(11, 16) })
    setNotice('Scenario B delayed by 72 hours.')
  }

  function pickSite(index: number, site: Coordinates) {
    const set = index === 0 ? setA : setB
    set(previous => ({ ...previous, site: 'custom', lat: String(site.lat), lon: String(site.lon) }))
  }

  async function copyComparison() {
    const url = comparisonLink(window.location.href, { a, b, days, limits: limitsDraft })
    try {
      await navigator.clipboard.writeText(url)
      setShareStatus('Comparison link copied.')
    } catch {
      setShareText(url)
      setShareStatus('The comparison link is ready to copy.')
    }
  }

  function exportWindows() {
    if (!comparison || !operating || !limits || !aSite || !bSite) return
    const csv = windowCsv(days, limits, [aSite, bSite].map((site, index) => ({
      ...site, start: comparison.starts[index], terrain: comparison.terrainLabels[index],
    })), comparison.results, operating)
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'lunar-visibility-windows.csv'
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const positions = comparison?.observers.map((observer, index) => ({
    sun: positionAt(ephemeris, observer, 'sun', comparison.starts[index] + elapsed),
    earth: positionAt(ephemeris, observer, 'earth', comparison.starts[index] + elapsed),
  }))
  const scale = comparison && positions ? commonSkyScale(positions, comparison.observers) : null
  return <>
    <section aria-labelledby="scenarios-title" className="scenario-section">
      <div className="section-heading">
        <div><h2 id="scenarios-title">Landing scenarios</h2><p>UTC planning dates from 2026 through 2030</p></div>
        <div className="scenario-actions">
          <button type="button" className="button subtle" onClick={() => {
            setB({ ...a })
            setNotice('Scenario A copied to Scenario B.')
          }}><Icon name="copy" size={16} />Copy A to B</button>
          <button type="button" className="button accent" onClick={delay} disabled={startB === null}>
            <Icon name="clock" size={16} />Delay B by 72 hours
          </button>
        </div>
      </div>
      <p className={notice.startsWith('A 72-hour') ? 'action-notice' : 'sr-only'} role="status">{notice}</p>
      <div className="scenario-grid">
        <ScenarioEditor id="A" value={a} onChange={value => update(setA, value)} />
        <ScenarioEditor id="B" value={b} onChange={value => update(setB, value)} />
      </div>
      {grid && <PolarMap grid={grid} sites={[aSite, bSite]} onPick={pickSite} />}
    </section>
    <section aria-labelledby="results-title" className="results-section">
      <div className="section-heading">
        <div><h2 id="results-title">Conditions after landing</h2>
          <p>Geometric screening for lighting and direct-to-Earth visibility</p></div>
        <div className="segmented" role="group" aria-label="Time after landing">
          {[7, 30].map(value => <button key={value} type="button" aria-pressed={value === days}
            onClick={() => { setDays(value); setCursor(Math.min(cursor, value * DAY_MS)) }}>{value} days</button>)}
        </div>
      </div>
      {comparison ? <>
        <div className={`model-banner ${comparison.hasTerrain ? '' : 'sphere'}`}>
          <Icon name="mountain" size={17} />
          <span>{comparison.hasTerrain ? <><strong>LOLA terrain</strong> · {comparison.terrainSummary}</>
            : <><strong>Smooth sphere</strong> · {terrain.failed ? 'The custom skyline could not be calculated' : 'Terrain coverage is unavailable for one or both scenarios'}</>}</span>
          {terrain.failed && <button type="button" className="button subtle" onClick={terrain.retry}>Retry terrain</button>}
        </div>
        <Totals results={comparison.results} days={days} />
        <PlanningPanel
          limits={limits} draft={limitsDraft} onChange={setLimits} assessment={assessments} exposure={exposure}
          searchKey={JSON.stringify([comparison.starts[1], bSite?.lat, bSite?.lon, duration, limits, comparison.terrainSummary])}
          onSearch={range => nearbyDates(ephemeris, comparison.observers[1], comparison.starts[1], duration, limits!, range)}
          onPickDate={utc => {
            const selected = new Date(utc).toISOString()
            setB(previous => ({ ...previous, date: selected.slice(0, 10), time: selected.slice(11, 16) }))
          }}
          formatUtc={formatUtc}
        />
        <div className="export-actions">
          <button type="button" className="button subtle" onClick={copyComparison} disabled={!limits}>
            <Icon name="copy" size={15} />Copy comparison link
          </button>
          <button type="button" className="button subtle" onClick={exportWindows} disabled={!limits}>Download windows CSV</button>
          <p role="status">{shareStatus}</p>
          {shareText && <input className="share-field" aria-label="Comparison link" readOnly value={shareText}
            onFocus={event => event.currentTarget.select()} />}
        </div>
        <Timeline results={comparison.results} starts={comparison.starts} elapsed={elapsed} duration={duration}
          onSeek={setCursor} operating={operating} mode={timelineMode} onMode={setTimelineMode} />
        {positions && scale && aSite && bSite && <div className="sky-grid-layout">
          <HorizonCard id="A" site={aSite.name} observer={comparison.observers[0]} positions={positions[0]}
            scale={scale} elapsed={elapsed} result={comparison.results[0]} />
          <HorizonCard id="B" site={bSite.name} observer={comparison.observers[1]} positions={positions[1]}
            scale={scale} elapsed={elapsed} result={comparison.results[1]} />
        </div>}
      </> : <p className="panel loading" role="status">{terrain.loading
        ? 'Calculating the custom site skyline from LOLA terrain…'
        : 'Enter valid sites and UTC landing times for both scenarios to compare visibility.'}</p>}
    </section>
    <Methods model={model} grid={grid} />
  </>
}

function Shell({ children }: { children: ReactNode }) {
  return <>
    <header className="site-header">
      <div className="header-content">
        <div className="wordmark"><span className="logo-mark"><Icon name="orbit" size={24} /></span>Lunar Navigator</div>
        <a href="https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/" target="_blank" rel="noreferrer">
          NASA Space Apps 2026 <Icon name="external" size={14} />
        </a>
      </div>
    </header>
    <main className="layout">
      <section className="hero" aria-labelledby="page-title">
        <div>
          <p className="hero-label"><span /> Lunar south pole</p>
          <h1 id="page-title">Lunar Landing Site Navigator</h1>
          <p className="hero-description">Compare sunlight and Earth visibility when your landing site or schedule changes.</p>
        </div>
        <div className="hero-art" aria-hidden="true" />
      </section>
      {children}
    </main>
  </>
}

export function App() {
  const [loaded, setLoaded] = useState<Loaded>()
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const abort = new AbortController()
    loadData(abort.signal).then(setLoaded).catch(() => {
      if (!abort.signal.aborted) setError(true)
    })
    return () => abort.abort()
  }, [attempt])
  return <Shell>{loaded ? <Planner {...loaded} /> : error
    ? <div className="panel loading" role="alert"><p>The bundled science data could not be loaded.</p>
      <button className="button accent" onClick={() => { setError(false); setAttempt(value => value + 1) }}>Try again</button></div>
    : <p className="panel loading" role="status">Loading lunar ephemeris and horizon data…</p>}
  </Shell>
}
