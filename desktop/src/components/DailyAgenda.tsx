import type { SourceRef } from '../types/source'

type Props = {
  sources: SourceRef[]
  loading: boolean
  calendarConnected: boolean
  onAsk: (question: string) => void
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate())
}

function timeLabel(value: Date) {
  return value.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function dayLabel(value: Date, now: Date) {
  const today = startOfDay(now)
  const target = startOfDay(value)
  const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return value.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function DailyAgenda({ sources, loading, calendarConnected, onAsk }: Props) {
  const now = new Date()
  const events = sources
    .filter((source) => source.kind === 'calendar')
    .map((source) => ({ source, start: new Date(source.modified) }))
    .filter(({ start }) => !Number.isNaN(start.getTime()))
    .sort((left, right) => left.start.getTime() - right.start.getTime())

  const today = events.filter(({ start }) => startOfDay(start).getTime() === startOfDay(now).getTime())
  const upcoming = events.filter(({ start }) => start.getTime() >= now.getTime())
  const agenda = (today.length ? today : upcoming).slice(0, 5)

  return (
    <section className="panel panel--agenda" aria-labelledby="daily-agenda">
      <header className="panel__head">
        <h2 id="daily-agenda" className="panel__title">
          Daily agenda
        </h2>
        <span className="panel__meta">Live calendar · not stored</span>
      </header>

      {agenda.length ? (
        <ul className="agendaList">
          {agenda.map(({ source, start }) => (
            <li key={source.id} className="agendaList__row">
              <span className="agendaList__when">
                <strong>{dayLabel(start, now)}</strong>
                <em>{timeLabel(start)}</em>
              </span>
              <span className="agendaList__body">
                <strong>{source.title}</strong>
                <em>{source.people?.length ? `${source.people.length} people` : 'Calendar'}</em>
              </span>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => onAsk(`Brief me for ${source.title}`)}
              >
                Brief
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="panel__note">
          {loading
            ? 'Reading the live calendar…'
            : calendarConnected
              ? 'No events in the current calendar window.'
              : 'Connect Microsoft Calendar in Settings to see your day here.'}
        </p>
      )}
    </section>
  )
}
