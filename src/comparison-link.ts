import { parseCoordinates, parseLanding } from './science.ts'
import { parseLimits, LIMIT_FIELDS } from './planning.ts'
import type { LandingDraft, LimitsDraft } from './planning.ts'
import { isFootprintSettings } from './footprint.ts'
import type { FootprintSettings } from './footprint.ts'

export type ComparisonSettings = { a: LandingDraft; b: LandingDraft; days: number; limits: LimitsDraft; footprint?: FootprintSettings }

export function comparisonLink(base: string, settings: ComparisonSettings) {
  const url = new URL(base)
  url.searchParams.set('comparison', JSON.stringify(settings))
  return url.href
}

export function readComparisonLink(search: string, presetIds: string[]): ComparisonSettings | null {
  const value = new URLSearchParams(search).get('comparison')
  if (!value || value.length > 1500) return null
  try {
    const settings = JSON.parse(value) as ComparisonSettings
    const validDraft = (draft: LandingDraft) => (
      draft && typeof draft.date === 'string' && typeof draft.time === 'string' &&
      typeof draft.lat === 'string' && typeof draft.lon === 'string' &&
      parseLanding(draft.date, draft.time) !== null &&
      (presetIds.includes(draft.site) || (draft.site === 'custom' && parseCoordinates(draft.lat, draft.lon)))
    )
    return [7, 30].includes(settings.days) && validDraft(settings.a) && validDraft(settings.b) &&
      (settings.footprint === undefined || isFootprintSettings(settings.footprint)) &&
      Object.keys(LIMIT_FIELDS).every(key => typeof settings.limits[key as keyof LimitsDraft] === 'string') &&
      parseLimits(settings.limits) ? settings : null
  } catch {
    return null
  }
}
