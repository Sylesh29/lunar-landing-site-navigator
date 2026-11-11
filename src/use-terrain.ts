import { useEffect, useRef, useState } from 'react'
import { profileFor } from './science.ts'
import type { Coordinates, HorizonProfile, Model, Preset } from './science.ts'
import type { PolarGrid } from './polar.ts'
import type { TerrainReply, TerrainRequest } from './terrain-worker.ts'

type Site = Coordinates | Preset

export function useTerrain(
  sites: [Site | null, Site | null], model: Model, grid: PolarGrid | undefined, presets: Preset[],
) {
  const worker = useRef<Worker | null>(null)
  const sequence = useRef(0)
  const [attempt, setAttempt] = useState(0)
  const [response, setResponse] = useState<{ key: string; profiles?: HorizonProfile[] }>()
  const catalog = sites.map(site => {
    if (!site) return undefined
    const preset = presets.find(entry => entry.lat === site.lat && entry.lon === site.lon)
    return profileFor(model, preset ?? site)
  })
  const available = model.terrain && sites.every((site, index) =>
    site && (catalog[index] || (grid && site.lat <= grid.minSouthLatitude)))
  const missing = available ? sites.flatMap((site, index) => site && !catalog[index] ? [{ lat: site.lat, lon: site.lon }] : []) : []
  const unique = missing.filter((site, index) =>
    missing.findIndex(other => other.lat === site.lat && other.lon === site.lon) === index)
  const query = JSON.stringify(unique)
  const key = unique.length ? `${attempt}:${query}` : ''
  const current = response?.key === key ? response : undefined

  useEffect(() => () => worker.current?.terminate(), [])
  useEffect(() => {
    if (!key || !grid) return
    let dispose = () => {}
    const timer = window.setTimeout(() => {
      try {
        const instance = worker.current ?? new Worker(new URL('./terrain-worker.ts', import.meta.url), { type: 'module' })
        worker.current = instance
        const id = ++sequence.current
        const onMessage = ({ data }: MessageEvent<TerrainReply>) => {
          if (data.id === id) setResponse({ key, profiles: 'profiles' in data ? data.profiles : undefined })
        }
        const onError = () => {
          instance.terminate()
          worker.current = null
          setResponse({ key })
        }
        instance.addEventListener('message', onMessage)
        instance.addEventListener('error', onError)
        dispose = () => {
          instance.removeEventListener('message', onMessage)
          instance.removeEventListener('error', onError)
        }
        instance.postMessage({
          id, grid, sites: JSON.parse(query),
          heightM: model.observerHeightM,
          assetUrl: new URL(`${import.meta.env.BASE_URL}data/${grid.tileDirectory}/`, document.baseURI).href,
        } satisfies TerrainRequest)
      } catch {
        setResponse({ key })
      }
    }, 180)
    return () => {
      window.clearTimeout(timer)
      dispose()
    }
  }, [grid, key, model.observerHeightM, query])

  return {
    profiles: sites.map((site, index) => catalog[index] ??
      current?.profiles?.find(profile => profile.lat === site?.lat && profile.lon === site?.lon)),
    loading: Boolean(key && !current),
    failed: Boolean(key && current && !current.profiles),
    retry: () => setAttempt(previous => previous + 1),
  }
}
