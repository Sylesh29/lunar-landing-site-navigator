import { useState } from 'react'
import { LIMIT_FIELDS } from './planning.ts'
import type { assessWindows, LimitsDraft, nearbyDates, OperatingLimits } from './planning.ts'

type Assessment = ReturnType<typeof assessWindows>
type Search = ReturnType<typeof nearbyDates>

export function PlanningPanel({
  limits, draft, onChange, assessment, exposure, searchKey, onSearch, onPickDate, formatUtc,
}: {
  limits: OperatingLimits | null
  draft: LimitsDraft
  onChange: (draft: LimitsDraft) => void
  assessment: Assessment[]
  exposure: number[]
  searchKey: string
  onSearch: () => Search
  onPickDate: (utc: number) => void
  formatUtc: (utc: number) => string
}) {
  const [search, setSearch] = useState<{ key: string; result: Search }>()
  const current = search?.key === searchKey ? search.result : undefined
  return <details className="panel extra-panel">
    <summary>Mission limits and date search</summary>
    <div className="extra-content">
      <p>Screen both landings against editable limits. The starting values illustrate a mission with a four-hour task that needs sunlight and Earth in view.</p>
      <div className="limits-grid">
        {(Object.keys(LIMIT_FIELDS) as (keyof LimitsDraft)[]).map(key => {
          const field = LIMIT_FIELDS[key]
          return <label className="field" key={key}>{field.label}
            <input type="number" step="any" min={field.min} max={field.max} value={draft[key]}
              onChange={event => onChange({ ...draft, [key]: event.target.value })} />
          </label>
        })}
      </div>
      {!limits && <p className="field-error" role="status">Enter a number within the indicated range for each limit.</p>}
      {limits && <div className="planning-comparison">
        {assessment.map((entry, index) => <div className="assessment" key={index}>
          <div className="assessment-heading">
            <h3>Scenario {index === 0 ? 'A' : 'B'}</h3>
            <span className={`visibility ${entry.unmet.length ? '' : 'visible'}`}>
              {entry.unmet.length ? 'Outside limits' : 'Meets limits'}
            </span>
          </div>
          <dl>
            <div><dt>Longest continuous overlap</dt><dd>{entry.longestJoint.toFixed(1)} h</dd></div>
            <div><dt>Longest gap in usable Sun</dt><dd>{entry.sunGap.toFixed(1)} h</dd></div>
            <div><dt>Longest gap in usable Earth view</dt><dd>{entry.earthGap.toFixed(1)} h</dd></div>
            <div><dt>Horizontal solar exposure</dt><dd>{exposure[index].toFixed(2)} sun-hours</dd></div>
          </dl>
          {entry.unmet.length > 0 && <p className="field-error">Limits missed · {entry.unmet.join(', ')}</p>}
        </div>)}
      </div>}
      <p className="planning-note">A sun-hour is one hour of full sunlight at normal incidence. Horizontal exposure uses the Sun’s elevation and modeled terrain shadow. Earth clearance uses the center of Earth.</p>
      <div className="date-search">
        <button className="button accent" type="button" disabled={!limits}
          onClick={() => setSearch({ key: searchKey, result: onSearch() })}>Find nearby dates for B</button>
        <p>Check one landing each day up to 14 days before and after B, at the same UTC time and site.</p>
      </div>
      {current && <div className="search-results">
        <p role="status">{current.matches.length} of {current.evaluated} checked dates meet all limits.</p>
        {current.matches.length > 0 && <ul>
          {current.matches.slice(0, 5).map(match => <li key={match.utc}>
            <div><strong>{formatUtc(match.utc)}</strong>
              <span>{match.day === 0 ? 'Current B' : `${Math.abs(match.day)}d ${match.day < 0 ? 'earlier' : 'later'}`} · {match.longestJoint.toFixed(1)} h continuous overlap</span></div>
            <button className="button subtle" type="button" disabled={match.day === 0}
              aria-label={`Use ${formatUtc(match.utc)} for B`} onClick={() => onPickDate(match.utc)}>Use for B</button>
          </li>)}
        </ul>}
      </div>}
    </div>
  </details>
}
