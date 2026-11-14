import { useEffect, useMemo, useRef, useState } from 'react'
import {
  candidateSummary, FOOTPRINT_DAYS, footprintCsv, HEIGHTS, samplePosition, SURFACES,
} from './footprint.ts'
import type { Candidate, FootprintRequest, FootprintResult, FootprintSettings, Height } from './footprint.ts'
import { CONSTRAINTS } from './planning.ts'
import type { OperatingLimits } from './planning.ts'
import { DAY_MS } from './science.ts'
import type { Ephemeris } from './science.ts'
import { downloadCsv } from './download.ts'
import { ShareNotice } from './ShareNotice.tsx'
import type { ShareNoticeValue } from './ShareNotice.tsx'

const hours = (value: number) => `${value > 0 && value < 0.05 ? '<0.1' : value.toFixed(1)} h`
const margin = (value: number) => `${value < 0 ? '−' : '+'}${hours(Math.abs(value))}`
function openMissionLimits() {
  const panel = document.getElementById('mission-limits')
  if (panel instanceof HTMLDetailsElement) panel.open = true
}

type Props = {
  supported: boolean
  startB: number
  settings: FootprintSettings
  onSettings: (value: FootprintSettings) => void
  ephemeris: Ephemeris
  referenceRadiusKm: number
  duration: number
  limits: OperatingLimits | null
  onApply: (utc: number) => void
  onCopy: () => void
  share?: ShareNoticeValue
  formatUtc: (utc: number) => string
}

export function FootprintPanel({
  supported, startB, settings, onSettings, ephemeris, referenceRadiusKm, duration, limits,
  onApply, onCopy, share, formatUtc,
}: Props) {
  const [attempt, setAttempt] = useState(0)
  const request = useMemo<FootprintRequest | null>(() =>
    supported && settings.anchor !== undefined && limits
      ? { ephemeris, referenceRadiusKm, start: settings.anchor, duration, limits, settings } : null,
  [supported, settings, limits, ephemeris, referenceRadiusKm, duration])
  const [job, setJob] = useState<{ request: FootprintRequest; attempt: number; result?: FootprintResult; error?: string }>()
  const current = job?.request === request && job.attempt === attempt ? job : undefined
  const result = current?.result
  const pending = Boolean(request && !current)

  useEffect(() => {
    if (!request) return
    const worker = new Worker(new URL('./footprint-worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = ({ data }) => setJob({ request, attempt, ...data })
    worker.onerror = () => setJob({ request, attempt, error: 'Could not start the footprint search. Try again.' })
    const terrainUrl = new URL(`${import.meta.env.BASE_URL}data/ridge-footprint.json`, window.location.href).href
    worker.postMessage({ request, terrainUrl })
    return () => worker.terminate()
  }, [request, attempt])

  return <section className="panel footprint" id="footprint-search" aria-labelledby="footprint-title" tabIndex={-1}>
    <div className="footprint-heading">
      <div>
        <h2 id="footprint-title">Landing footprint search</h2>
        <p>Find a date for Scenario B that meets every mission limit at all 17 sampled positions on both terrain models.</p>
      </div>
      {supported && <span className="terrain-tag">Connecting Ridge · 100 m radius</span>}
    </div>
    {!supported ? <p className="footprint-message">Select the Connecting Ridge reference point for Scenario B to use the high-resolution footprint.
      {' '}<a href="#mission-limits" onClick={openMissionLimits}>Search dates at the selected point</a>.</p> : <>
      <div className="footprint-controls">
        {([
          ['panel', 'Solar panel height'],
          ['antenna', 'Antenna height'],
        ] as const).map(([field, label]) => <label className="field" key={field}>{label}
          <select value={settings[field]} onChange={event => onSettings({ ...settings, [field]: Number(event.target.value) as Height })}>
            {HEIGHTS.map(height => <option key={height} value={height}>{height} m</option>)}
          </select>
        </label>)}
        <button type="button" className="button accent" disabled={!limits} aria-disabled={pending || undefined}
          onClick={() => {
            if (pending) return
            if (settings.anchor === startB) setAttempt(previous => previous + 1)
            else onSettings({ ...settings, anchor: startB })
          }}>{pending ? 'Searching…' : 'Search from B'}</button>
      </div>
      <p className="planning-note">Search from B checks one landing per day for up to {FOOTPRINT_DAYS} days after B, at the same UTC time. Set heights above the local surface.</p>
      {limits && <p className="planning-note footprint-limits">
        {duration / DAY_MS}-day limits · At least {limits.minJointHours} h of continuous overlap, at most {limits.maxLowSunHours} h without usable Sun and {limits.maxEarthGapHours} h without Earth line of sight.
        {Boolean(limits.sunElevationDeg || limits.earthClearanceDeg) && ` Minimum Sun elevation ${limits.sunElevationDeg}° and Earth clearance ${limits.earthClearanceDeg}°.`}
        {' '}<a href="#mission-limits" onClick={openMissionLimits}>Edit mission limits</a>
      </p>}
      {!limits && <p className="field-error" role="status">Enter valid mission limits to search.</p>}
      {pending && <p className="footprint-message" role="status">Checking both terrains across the footprint…</p>}
      {current?.error && <p className="footprint-message field-error" role="alert">{current.error}</p>}
      {result && request && <FootprintResults key={`${request.start}-${attempt}-${settings.panel}-${settings.antenna}-${duration}-${JSON.stringify(limits)}`}
        result={result} request={request} startB={startB} onApply={onApply}
        onCopy={onCopy} share={share} formatUtc={formatUtc} />}
    </>}
  </section>
}

function FootprintResults({ result, request, startB, onApply, onCopy, share, formatUtc }: {
  result: FootprintResult
  request: FootprintRequest
  startB: number
  onApply: Props['onApply']
  onCopy: Props['onCopy']
  share?: ShareNoticeValue
  formatUtc: Props['formatUtc']
}) {
  const { earliest, widest, passes } = candidateSummary(result)
  const activeB = result.candidates.find(candidate => candidate.utc === startB)
  const [selectedUtc, setSelectedUtc] = useState(() =>
    activeB && activeB.binding.hours >= 0 ? activeB.utc : (earliest ?? widest).utc,
  )
  const selected = result.candidates.find(candidate => candidate.utc === selectedUtc) ?? result.candidates[0]
  const [surface, setSurface] = useState(selected.binding.surface)
  const [point, setPoint] = useState(selected.binding.sample)
  const assessment = selected.points[surface][point]
  const shareButton = useRef<HTMLButtonElement>(null)
  const focusShare = useRef(false)
  useEffect(() => {
    if (focusShare.current) {
      focusShare.current = false
      shareButton.current?.focus()
    }
  }, [startB])
  const select = (candidate: Candidate) => {
    setSelectedUtc(candidate.utc)
    setSurface(candidate.binding.surface)
    setPoint(candidate.binding.sample)
  }
  function apply(candidate: Candidate) {
    select(candidate)
    focusShare.current = true
    onApply(candidate.utc)
  }
  return <div className="footprint-results">
    <p className="footprint-search-date">Search started from {formatUtc(request.start)}.</p>
    <div className="footprint-summary">
      <div>
        <p className="footprint-caption" role="status">{passes.length} of {result.candidates.length} dates pass both terrains</p>
        <h3>{earliest ? `Earliest · ${formatUtc(earliest.utc)}` : 'No date passes at every sampled position'}</h3>
        <p>{earliest ? `Worst margin ${margin(earliest.binding.hours)} across both terrains.${activeB && activeB.binding.hours >= 0 ? ' A qualifying date is set for B.' : ''}`
          : `Smallest shortfall · ${formatUtc(widest.utc)} · ${widest.binding.constraint}, ${margin(widest.binding.hours)}.`}</p>
      </div>
      <div className="footprint-result-actions">
        {earliest && earliest.utc !== startB && <button className="button accent" type="button"
          onClick={() => apply(earliest)}>Use earliest date for B</button>}
        {(!earliest || (activeB && activeB.binding.hours >= 0)) && <button ref={shareButton}
          className={earliest ? 'button accent' : 'button subtle'} type="button" onClick={onCopy}>Copy footprint comparison</button>}
        <button className="button subtle" type="button" onClick={() => select(widest)}>
          {earliest ? 'Inspect date with widest margin' : 'Inspect smallest shortfall'}
        </button>
      </div>
    </div>
    <ShareNotice value={share} label="Footprint comparison link" />
    <div className="footprint-inspector">
      <div className="inspect-controls">
        <label className="field">Inspect landing date
          <select value={selected.utc} onChange={event => {
            const match = result.candidates.find(candidate => candidate.utc === Number(event.target.value))
            if (match) select(match)
          }}>
            {result.candidates.map(candidate => <option key={candidate.utc} value={candidate.utc}>
              {formatUtc(candidate.utc)} · {candidate.binding.hours >= 0 ? 'Passes' : 'Outside limits'}
            </option>)}
          </select>
        </label>
        <label className="field">Footprint terrain
          <select value={surface} onChange={event => setSurface(event.target.value === '0' ? 0 : 1)}>
            {SURFACES.map((label, index) => <option key={label} value={index}>{label}</option>)}
          </select>
        </label>
      </div>
      <p className="binding-line">
        <strong>Worst margin across both terrains {margin(selected.binding.hours)}</strong>
        <span>{selected.binding.constraint} · {samplePosition(selected.binding.sample).label} · {SURFACES[selected.binding.surface]}</span>
      </p>
      <div className="footprint-evidence">
        <div className="footprint-chart">
          <div className="footprint-compass"><span aria-hidden="true">N</span>
            <div className="footprint-ring outer" /><div className="footprint-ring inner" />
            {selected.points[surface].map((assessment, index) => {
              const { label, bearing, radius } = samplePosition(index)
              const angle = bearing * Math.PI / 180
              const passed = assessment.unmet.length === 0
              return <button key={index} type="button" aria-pressed={point === index}
                aria-label={`${label} · ${passed ? 'Passes' : assessment.unmet.join(', ') + ' failed'}`}
                className={`footprint-point ${passed ? 'pass' : 'fail'}`}
                style={{ left: `${50 + 0.39 * radius * Math.sin(angle)}%`, top: `${50 - 0.39 * radius * Math.cos(angle)}%` }}
                onClick={() => setPoint(index)}>{passed ? '✓' : '×'}</button>
            })}
          </div>
          <p>{selected.counts[surface]} / 17 sampled positions pass on {SURFACES[surface]}</p>
        </div>
        <div className="footprint-detail" aria-live="polite">
          <div className="footprint-detail-heading"><h4>{samplePosition(point).label}</h4>
            <span className={`visibility ${assessment.unmet.length ? '' : 'visible'}`}>
              {assessment.unmet.length ? 'Outside limits' : 'Meets limits'}
            </span>
          </div>
          <dl>{CONSTRAINTS.map((constraint, index) => <div key={constraint}>
            <dt>{constraint}</dt>
            <dd>{hours([assessment.longestJoint, assessment.sunGap, assessment.earthGap][index])}
              <span className={assessment.margins[constraint] < 0 ? 'field-error' : 'point-margin'}>
                {margin(assessment.margins[constraint])} margin
              </span></dd>
          </div>)}</dl>
          <p className="model-counts">
            LOLA <strong>{selected.counts[0]}/17</strong>
            <span>LROC <strong>{selected.counts[1]}/17</strong></span>
          </p>
          {assessment.unmet.length > 0 && <p className="field-error">Limits missed · {assessment.unmet.join(', ')}</p>}
        </div>
      </div>
      <div className="footprint-result-actions">
        {selected.binding.hours >= 0 && selected.utc !== startB && <button className="button subtle" type="button"
          onClick={() => apply(selected)}>Use inspected date for B</button>}
        <button className="button subtle" type="button"
          onClick={() => downloadCsv('connecting-ridge-footprint.csv', footprintCsv(result, request))}>Download footprint CSV</button>
      </div>
      <p className="planning-note">
        The search checks two sampled rings and the center. Earth visibility means geometric line of sight to Earth’s center. Radio service also depends on ground-station availability and link performance.
        {' '}The LROC model uses image-derived terrain for {Math.round(result.imageRayFraction * 100)}% of local ray samples. Both models use LOLA terrain beyond 5 km.
        {' '}<a href="https://pgda.gsfc.nasa.gov/products/104" target="_blank" rel="noreferrer">Terrain source</a>
      </p>
    </div>
  </div>
}
