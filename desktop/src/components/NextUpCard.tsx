import { Link } from 'react-router-dom'
import type { ManagerSnapshot, PersonPulse } from '../types/source'

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

function startLabel(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Upcoming'
  return date.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function lastMetLabel(person: PersonPulse) {
  if (!person.lastMet) return 'No previous 1:1'
  const date = new Date(person.lastMet)
  if (Number.isNaN(date.getTime())) return 'No previous 1:1'
  const days = Math.round((Date.now() - date.getTime()) / 86_400_000)
  if (days <= 0) return 'Met today'
  if (days === 1) return 'Met yesterday'
  if (days < 14) return `Met ${days} days ago`
  return `Last met ${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
}

function noteDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export default function NextUpCard({ snapshot, loading, calendarConnected, onAsk }: Props) {
  const next = snapshot?.nextUp ?? null
  const start = next ? new Date(next.source.modified) : null
  const title = next?.source.title ?? ''
  const people = next?.people ?? []

  return (
    <section className="panel nextUp" aria-labelledby="next-up">
      <header className="nextUp__head">
        <div>
          <p className="sectionLabel">Next up</p>
          <h2 id="next-up" className="nextUp__title">
            {next ? title : loading ? 'Reading your calendar…' : 'Nothing on deck.'}
          </h2>
          {start ? (
            <p className="nextUp__when">
              {startLabel(next!.source.modified)}
              {people.length ? ` · ${people.length} ${people.length === 1 ? 'person' : 'people'}` : ''}
            </p>
          ) : null}
        </div>
        {next ? (
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => onAsk(`Prep me for ${title}`)}
          >
            Prep
          </button>
        ) : null}
      </header>

      {next ? (
        <>
          {people.length ? (
            <div className="prepPeople">
              {people.map((person) => (
                <article className="prepPerson" key={person.name}>
                  <div className="prepPerson__head">
                    <span className="prepPerson__avatar" aria-hidden="true">
                      {initials(person.name)}
                    </span>
                    <span className="prepPerson__who">
                      <strong>{person.name}</strong>
                      <em>{lastMetLabel(person)}</em>
                    </span>
                    {person.due ? <span className="prepPerson__due">Due</span> : null}
                  </div>
                  {person.note ? (
                    <>
                      <p className="prepPerson__note">“{person.note.excerpt}”</p>
                      <p className="prepPerson__source">
                        {person.note.title} · {noteDate(person.note.timestamp)}
                      </p>
                    </>
                  ) : (
                    <p className="prepPerson__note prepPerson__note--empty">
                      No note on this person yet.
                    </p>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <p className="panel__note">
              Attendee names appear here when Microsoft Calendar is connected and the event has
              invitees.
            </p>
          )}

          <div className="nextUp__actions">
            <p className="sectionLabel">Open actions from your last notes</p>
            {next.actions.length ? (
              <ul className="loopList">
                {next.actions.map((action) => (
                  <li className="loopRow" key={action.id}>
                    <span className={`loopRow__mark loopRow__mark--${action.direction}`} />
                    <span className="loopRow__text">{action.text}</span>
                    {action.person ? <span className="tag">{action.person}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="panel__note">
                No open actions linked to these people. Prep will still pull their last notes.
              </p>
            )}
          </div>
        </>
      ) : (
        <div className="nextUp__empty">
          <p className="panel__note">
            {loading
              ? 'Checking the live calendar for the next meeting…'
              : calendarConnected
                ? 'No upcoming events in the calendar window.'
                : 'Connect Microsoft Calendar to see your next meeting, attendees and prep notes.'}
          </p>
          {!loading && !calendarConnected ? (
            <Link className="btn btn--ghost btn--sm" to="/settings">
              Connect calendar
            </Link>
          ) : null}
        </div>
      )}
    </section>
  )
}
