import { useEffect, useRef } from 'react'

export type ShareNoticeValue = { message: string; url?: string }

export function ShareNotice({ value, label }: { value?: ShareNoticeValue; label: string }) {
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (value?.url) {
      field.current?.focus()
      field.current?.select()
    }
  }, [value])

  if (!value) return null
  return <div className="share-notice">
    <p role="status">{value.message}</p>
    {value.url && <input className="share-field" aria-label={label} readOnly value={value.url}
      ref={field} onFocus={event => event.currentTarget.select()} />}
  </div>
}
