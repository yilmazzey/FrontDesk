import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../lib/ipc'
import {
  category,
  categoryLabel,
  dayKey,
  dayLabel,
  linkMeeting,
  sourceDate,
  timeLabel,
  type TimelineFilter,
} from '../lib/timeline'
import { useAccess } from '../state/access'
import type { SearchHit, SourceRef } from '../types/source'

const filters: Array<{ id: TimelineFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'meetings', label: 'Meetings' },
  { id: 'notes', label: 'Notes' },
  { id: 'scans', label: 'Scans' },
  { id: 'mail', label: 'Mail' },
  { id: 'onenote', label: 'OneNote' },
]

type DayGroup = {
  key: string
  date: Date
  items: SourceRef[]
}

function isPath(value: string) {
  return value.startsWith('/') || value.startsWith('~')
}

export default function Timeline() {
  const { sources, loading } = useAccess()
  const [params, setParams] = useSearchParams()
  const rawFilter = params.get('filter')
  const storedFilter = localStorage.getItem('frontdesk.timeline.filter')
  const filter: TimelineFilter = filters.some((item) => item.id === rawFilter)
    ? (rawFilter as TimelineFilter)
    : filters.some((item) => item.id === storedFilter)
      ? (storedFilter as TimelineFilter)
      : 'all'
  const query = params.get('q') ?? ''
  const [hits, setHits] = useState<SearchHit[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [openErrors, setOpenErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (rawFilter || !storedFilter || storedFilter === 'all' || !filters.some((item) => item.id === storedFilter)) {
      return
    }
    const next = new URLSearchParams(params)
    next.set('filter', storedFilter)
    setParams(next, { replace: true })
  }, [params, rawFilter, setParams, storedFilter])

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setHits(null)
      setSearching(false)
      setSearchError(null)
      return
    }
    let active = true
    setSearching(true)
    setSearchError(null)
    const timer = setTimeout(() => {
      api
        .searchSources(trimmed)
        .then((found) => {
          if (active) setHits(found)
        })
        .catch((cause) => {
          if (active) {
            setHits(null)
            setSearchError(cause instanceof Error ? cause.message : String(cause))
          }
        })
        .finally(() => {
          if (active) setSearching(false)
        })
    }, 280)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [query])

  const meetings = useMemo(
    () => sources.filter((source) => source.kind === 'calendar'),
    [sources],
  )

  const visibleSources = useMemo(
    () => (query.trim() && hits ? hits.map((hit) => hit.source) : sources),
    [hits, query, sources],
  )

  const groups = useMemo<DayGroup[]>(() => {
    const byDay = new Map<string, DayGroup>()

    for (const source of visibleSources) {
      if (filter !== 'all' && category(source) !== filter) continue
      const date = sourceDate(source)
      if (!date) continue
      const key = dayKey(date)
      const group = byDay.get(key)
      if (group) {
        group.items.push(source)
      } else {
        byDay.set(key, { key, date, items: [source] })
      }
    }

    return [...byDay.values()]
      .map((group) => ({
        ...group,
        items: group.items.sort(
          (left, right) => (sourceDate(right)?.getTime() ?? 0) - (sourceDate(left)?.getTime() ?? 0),
        ),
      }))
      .sort((left, right) => right.date.getTime() - left.date.getTime())
  }, [filter, visibleSources])

  async function open(source: SourceRef) {
    setOpenErrors((current) => {
      const next = { ...current }
      delete next[source.id]
      return next
    })
    try {
      await api.openOriginal(source.id)
    } catch (cause) {
      setOpenErrors((current) => ({
        ...current,
        [source.id]: cause instanceof Error ? cause.message : String(cause),
      }))
    }
  }

  return (
    <div className="page page--flush">
      <header className="pageHead pageHead--tight">
        <div>
          <p className="eyebrow">Timeline</p>
          <h1 className="pageTitle">
            Everything you <em>already know.</em>
          </h1>
          <p className="pageLede pageLede--tight">
            Meetings, notes, mail and scans grouped by the day they happened. Search the contents
            here, or use the full Search view for a deeper pass. Nothing is copied.
          </p>
        </div>
      </header>

      <div className="searchField timelineSearch">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M11 4.2a6.8 6.8 0 1 0 0 13.6 6.8 6.8 0 0 0 0-13.6ZM16 16l4 4" />
        </svg>
        <input
          value={query}
          onChange={(event) => updateParam('q', event.target.value)}
          placeholder="Search notes, people, mail and meetings…"
          aria-label="Search the timeline"
        />
        {query ? (
          <button
            type="button"
            className="searchField__clear"
            onClick={() => updateParam('q', '')}
          >
            Clear
          </button>
        ) : (
          <kbd>⌘K</kbd>
        )}
      </div>

      {searchError ? <p className="notice notice--bad">{searchError}</p> : null}

      <div className="filterRow" aria-label="Timeline filters">
        {filters.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`filter${filter === item.id ? ' is-on' : ''}`}
            onClick={() => {
              localStorage.setItem('frontdesk.timeline.filter', item.id)
              updateParam('filter', item.id === 'all' ? '' : item.id)
            }}
            aria-pressed={filter === item.id}
          >
            {item.label}
          </button>
        ))}
        <span className="filterRow__meta">
          {searching
            ? 'Searching source contents…'
            : `${groups.length} ${groups.length === 1 ? 'day' : 'days'} · in memory`}
        </span>
      </div>

      {groups.length ? (
        <div className="timelineDays">
          {groups.map((group) => (
            <section key={group.key} className="timelineDay" aria-label={dayLabel(group.date)}>
              <header className="timelineDay__head">
                <h2>{dayLabel(group.date)}</h2>
                <span>
                  {group.items.length} {group.items.length === 1 ? 'source' : 'sources'}
                </span>
              </header>

              <ul className="timelineList">
                {group.items.map((source) => {
                  const date = sourceDate(source)
                  const link = linkMeeting(source, meetings)
                  return (
                    <li key={source.id} className="timelineItem">
                      <span className="timelineItem__time">{date ? timeLabel(date) : '—'}</span>
                      <span className="timelineItem__body">
                        <span className="timelineItem__top">
                          <strong>{source.title}</strong>
                          <span className="tag">{categoryLabel(source)}</span>
                        </span>
                        <span className="timelineItem__meta">
                          {source.people?.length ? (
                            `${source.people.slice(0, 3).join(', ')}${
                              source.people.length > 3 ? ` +${source.people.length - 3}` : ''
                            }`
                          ) : isPath(source.location) ? (
                            <button
                              type="button"
                              className="pathLink"
                              onClick={() => void open(source)}
                            >
                              {source.location}
                            </button>
                          ) : (
                            source.location
                          )}
                        </span>
                        {link ? (
                          <span className="timelineItem__link">
                            Likely linked to <strong>{link.meeting.title}</strong> · {link.reason}
                          </span>
                        ) : null}
                        {openErrors[source.id] ? (
                          <span className="timelineItem__error">
                            Could not open: {openErrors[source.id]}
                          </span>
                        ) : null}
                      </span>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => void open(source)}
                      >
                        Open
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <div className="empty">
          <p className="empty__title">
            {query ? 'Nothing matches that search.' : 'Nothing on the timeline yet.'}
          </p>
          <p>
            {query
              ? 'Try a broader word, or clear the search to see everything in scope.'
              : 'Grant a folder or connect Microsoft 365 in Settings to see the day-by-day timeline.'}
          </p>
        </div>
      )}

      {loading ? <p className="panel__note">Reading granted sources…</p> : null}
    </div>
  )
}
