import type { ManagerSnapshot } from '../types/source'

type Props = {
  snapshot: ManagerSnapshot | null
  loading: boolean
  calendarConnected: boolean
  onAsk: (question: string) => void
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

function lastMetLabel(value: string | null) {
  if (!value) return 'No 1:1 yet'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No 1:1 yet'
  const days = Math.round((Date.now() - date.getTime()) / 86_400_000)
  if (days <= 0) return 'Met today'
  if (days === 1) return 'Met yesterday'
  if (days < 30) return `Last met ${days} days ago`
  return `Last met ${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
}

export default function PeoplePanel({
  snapshot,
  loading,
  calendarConnected,
  onAsk,
}: Props) {
  const people = snapshot?.people ?? []
  const due = people.filter((person) => person.due).length

  return (
    <section className="panel peoplePanel" aria-labelledby="people">
      <header className="panel__head">
        <h2 id="people" className="panel__title">
          People
        </h2>
        <span className="panel__meta">
          {loading
            ? 'Reading attendees…'
            : due
              ? `${due} due for a catch-up`
              : 'Everyone is fresh'}
        </span>
      </header>

      {people.length ? (
        <div className="peopleChips">
          {people.slice(0, 10).map((person) => (
            <button
              type="button"
              className={`personChip${person.due ? ' is-due' : ''}`}
              key={person.name}
              onClick={() => onAsk(`Catch me up on ${person.name}`)}
            >
              <span className="personChip__avatar" aria-hidden="true">
                {initials(person.name)}
              </span>
              <span className="personChip__body">
                <strong>{person.name}</strong>
                <em>{lastMetLabel(person.lastMet)}</em>
              </span>
              {person.due ? <span className="personChip__due">Due</span> : null}
            </button>
          ))}
        </div>
      ) : (
        <p className="panel__note">
          {loading
            ? 'Reading your live calendar…'
            : calendarConnected
              ? 'No attendees in the current calendar window.'
              : 'Connect Microsoft Calendar in Settings to see the people you meet with.'}
        </p>
      )}

      <p className="panel__note panel__note--quiet">
        Attendee names are live calendar metadata. FrontDesk does not save them.
      </p>
    </section>
  )
}
