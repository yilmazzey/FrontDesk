import { useEffect, useMemo } from 'react'
import { api } from '../lib/ipc'
import { useAccess } from '../state/access'

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
}

function dayLabel(value: Date) {
  const now = new Date()
  const diff = Math.round((startOfDay(value) - startOfDay(now)) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return value.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

function timeLabel(value: Date) {
  return value.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function cleanTitle(value: string) {
  return value.split(' — ')[0]?.trim() || value
}

export default function TrayPopover() {
  const { sources, grants, loading } = useAccess()
  const calendarConnected = grants.some((grant) => grant.kind === 'calendar')

  useEffect(() => {
    const theme = localStorage.getItem('frontdesk.theme') || 'dark'
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') void api.hideTrayPopover()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const upcoming = useMemo(() => {
    const now = Date.now() - 30 * 60_000
    return sources
      .filter((source) => source.kind === 'calendar')
      .map((source) => ({ source, start: new Date(source.modified) }))
      .filter(({ start }) => !Number.isNaN(start.getTime()) && start.getTime() >= now)
      .sort((left, right) => left.start.getTime() - right.start.getTime())
      .slice(0, 3)
  }, [sources])

  return (
    <main className="trayPage">
      <section className="trayPanel" aria-label="FrontDesk next up">
        <span className="trayArrow" aria-hidden="true" />

        <header className="trayPanel__head">
          <div className="trayBrand">
            <span className="trayBrand__dot" aria-hidden="true" />
            <strong>FrontDesk</strong>
            <span>next up</span>
          </div>
          <button
            type="button"
            className="trayClose"
            aria-label="Close FrontDesk popover"
            onClick={() => void api.hideTrayPopover()}
          >
            ×
          </button>
        </header>

        <button type="button" className="trayAsk" onClick={() => void api.openAsk(null)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M11 4.2a6.8 6.8 0 1 0 0 13.6 6.8 6.8 0 0 0 0-13.6ZM16 16l4 4" />
          </svg>
          <span>Ask FrontDesk…</span>
          <kbd>⌘J</kbd>
        </button>

        <div className="traySectionLabel">
          <span>Next up</span>
          <em>{upcoming.length ? `${upcoming.length} scheduled` : 'Live calendar'}</em>
        </div>

        <div className="trayEvents">
          {upcoming.length ? (
            upcoming.map(({ source, start }) => (
              <button
                type="button"
                className="trayEvent"
                key={source.id}
                onClick={() => void api.openAsk(`Prep me for ${cleanTitle(source.title)}`)}
              >
                <span className="trayEvent__time">
                  <strong>{timeLabel(start)}</strong>
                  <em>{dayLabel(start)}</em>
                </span>
                <span className="trayEvent__bar" aria-hidden="true" />
                <span className="trayEvent__body">
                  <strong>{source.title}</strong>
                  <em>
                    {source.people?.length
                      ? source.people.slice(0, 3).join(', ')
                      : source.location}
                  </em>
                </span>
              </button>
            ))
          ) : (
            <p className="trayEmpty">
              {loading
                ? 'Reading the live calendar…'
                : calendarConnected
                  ? 'No upcoming events in the calendar window.'
                  : 'Connect Microsoft Calendar in Settings to see your next three items.'}
            </p>
          )}
        </div>

        <footer className="trayPanel__foot">
          <span>{calendarConnected ? 'Live calendar · not stored' : 'Calendar not connected'}</span>
          <button type="button" onClick={() => void api.openAsk(null)}>
            Open app →
          </button>
        </footer>
      </section>
    </main>
  )
}
