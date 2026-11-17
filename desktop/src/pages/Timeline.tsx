import { useMemo, useState } from 'react'
import { api } from '../lib/ipc'
import {
  category,
  dayKey,
  dayLabel,
  linkMeeting,
  sourceDate,
  timeLabel,
  type TimelineFilter,
} from '../lib/timeline'
import { useAccess } from '../state/access'
import type { SourceRef } from '../types/source'

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

export default function Timeline() {
  const { sources, loading } = useAccess()
  const [filter, setFilter] = useState<TimelineFilter>('all')
  const [notice, setNotice] = useState<string | null>(null)

  const meetings = useMemo(
    () => sources.filter((source) => source.kind === 'calendar'),
    [sources],
  )

  const groups = useMemo<DayGroup[]>(() => {
    const byDay = new Map<string, DayGroup>()

    for (const source of sources) {
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
  }, [filter, sources])

  async function open(source: SourceRef) {
    setNotice(null)
    try {
      await api.openOriginal(source.id)
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause))
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
            Meetings, notes, mail and scans grouped by the day they happened. This view is built
            from your live sources in memory — no timeline copy is stored.
          </p>
        </div>
      </header>

      <div className="filterRow" aria-label="Timeline filters">
        {filters.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`filter${filter === item.id ? ' is-on' : ''}`}
            onClick={() => setFilter(item.id)}
            aria-pressed={filter === item.id}
          >
            {item.label}
          </button>
        ))}
        <span className="filterRow__meta">
          {loading ? 'Reading sources…' : `${groups.length} days · in memory`}
        </span>
      </div>

      {notice ? <p className="notice notice--bad">{notice}</p> : null}

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
                          <span className="tag">{category(source)}</span>
                        </span>
                        <span className="timelineItem__meta">
                          {source.people?.length
                            ? `${source.people.slice(0, 3).join(', ')}${
                                source.people.length > 3 ? ` +${source.people.length - 3}` : ''
                              }`
                            : source.location}
                        </span>
                        {link ? (
                          <span className="timelineItem__link">
                            Likely linked to <strong>{link.meeting.title}</strong> · {link.reason}
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
          <p className="empty__title">Nothing on the timeline yet.</p>
          <p>
            Grant a folder in <strong>Access</strong>, or connect Microsoft 365 in{' '}
            <strong>Settings</strong> to see the day-by-day timeline.
          </p>
        </div>
      )}
    </div>
  )
}
