import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/ipc'
import type { SourceRef } from '../types/source'

type Props = {
  sources: SourceRef[]
  loading: boolean
  calendarConnected: boolean
  onAsk: (question: string) => void
}

type Person = {
  name: string
  next: SourceRef
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

function nextLabel(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Upcoming'
  return date.toLocaleString(undefined, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function TeamPanel({ sources, loading, calendarConnected, onAsk }: Props) {
  const [selfName, setSelfName] = useState<string | null>(null)

  useEffect(() => {
    if (!calendarConnected) {
      setSelfName(null)
      return
    }
    let active = true
    api
      .getMicrosoftProfile()
      .then((profile) => {
        if (active) setSelfName(profile?.displayName ?? null)
      })
      .catch(() => {
        if (active) setSelfName(null)
      })
    return () => {
      active = false
    }
  }, [calendarConnected])

  const people = useMemo(() => {
    const now = Date.now()
    const byName = new Map<string, Person>()
    const self = selfName?.trim().toLocaleLowerCase()

    for (const source of sources) {
      if (source.kind !== 'calendar') continue
      const start = new Date(source.modified)
      if (Number.isNaN(start.getTime()) || start.getTime() < now) continue

      for (const raw of source.people ?? []) {
        const name = raw.trim()
        if (!name) continue
        const key = name.toLocaleLowerCase()
        if (self && key === self) continue
        const existing = byName.get(key)
        if (!existing || new Date(existing.next.modified) > start) {
          byName.set(key, { name, next: source })
        }
      }
    }

    return [...byName.values()].sort(
      (left, right) =>
        new Date(left.next.modified).getTime() - new Date(right.next.modified).getTime(),
    )
  }, [selfName, sources])

  return (
    <section className="panel panel--team" aria-labelledby="team">
      <header className="panel__head">
        <h2 id="team" className="panel__title">
          Team
        </h2>
        <span className="panel__meta">Live attendees · not stored</span>
      </header>

      {people.length ? (
        <ul className="teamList">
          {people.slice(0, 6).map((person) => (
            <li key={person.name} className="teamList__row">
              <span className="teamList__avatar" aria-hidden="true">
                {initials(person.name)}
              </span>
              <span className="teamList__body">
                <strong>{person.name}</strong>
                <em>
                  {person.next.title} · {nextLabel(person.next.modified)}
                </em>
              </span>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() =>
                  onAsk(`What do I need to know before my next meeting with ${person.name}?`)
                }
              >
                Ask
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="panel__note">
          {loading
            ? 'Reading your live calendar…'
            : calendarConnected
              ? 'No attendees in the upcoming calendar window.'
              : 'Connect Microsoft Calendar in Settings to see the people in your next meetings.'}
        </p>
      )}

      <p className="panel__note panel__note--quiet">
        Names come from live calendar attendees. FrontDesk does not save them.
      </p>
    </section>
  )
}
