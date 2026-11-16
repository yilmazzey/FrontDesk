import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccess } from '../state/access'

function when(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString()
}

function time(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { grants, sources, models, info, loading } = useAccess()
  const [question, setQuestion] = useState('')
  const now = new Date()
  const calendarEvents = sources
    .filter((source) => source.kind === 'calendar')
    .filter((source) => !Number.isNaN(new Date(source.modified).getTime()))
    .sort((a, b) => a.modified.localeCompare(b.modified))
  const todayEvents = calendarEvents.filter(
    (source) => new Date(source.modified).toDateString() === now.toDateString(),
  )
  const upcomingEvents = calendarEvents.filter((source) => new Date(source.modified) >= now)
  const agenda = todayEvents.length ? todayEvents.slice(0, 4) : upcomingEvents.slice(0, 4)
  const hasCalendarGrant = grants.some((grant) => grant.kind === 'calendar')

  function onAsk(event: FormEvent) {
    event.preventDefault()
    if (!question.trim()) return
    navigate('/chat', { state: { question: question.trim() } })
  }

  const adapter = info?.selectedModel
    ? models.find((model) => model.id === info.selectedModel)?.name ?? info.selectedModel
    : 'Extractive (no model)'

  return (
    <div className="page">
      <header className="pageHead">
        <div>
          <p className="eyebrow">
            {now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <h1 className="pageTitle">
            The desk is <em>open.</em>
          </h1>
          <p className="pageLede">
            Local files stay here; connected Microsoft sources are read from your account on demand.
          </p>
          <p className="eventTag">Pfizer &amp; Newpage Solutions Hackathon Challenge</p>
        </div>

        <button type="button" className="btn btn--primary" onClick={() => navigate('/access')}>
          Manage access
          <span aria-hidden="true">→</span>
        </button>
      </header>

      <form className="ask" aria-label="Ask the desk" onSubmit={onAsk}>
        <label className="ask__label" htmlFor="ask">
          Ask the desk
        </label>
        <div className="ask__row">
          <input
            id="ask"
            className="ask__input"
            placeholder="What did I write about the OCR pipeline?"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
          />
          <button type="submit" className="btn btn--ghost" disabled={!question.trim()}>
            Ask
          </button>
        </div>
        <p className="ask__hint">
          Answers cite your sources when relevant; general knowledge is labeled.
        </p>
      </form>

      <section className="statRow" aria-label="This week">
        <article className="stat">
          <span className="stat__value">{loading ? '—' : sources.length}</span>
          <span className="stat__label">Sources in scope</span>
        </article>
        <article className="stat">
          <span className="stat__value">{grants.length}</span>
          <span className="stat__label">Active grants</span>
        </article>
        <article className="stat">
          <span className="stat__value">0</span>
          <span className="stat__label">AI requests to the cloud</span>
        </article>
      </section>

      <div className="columnPair">
        <section className="panel" aria-labelledby="recent">
          <header className="panel__head">
            <h2 id="recent" className="panel__title">
              In scope
            </h2>
            <span className="panel__meta">Live from the source</span>
          </header>

          {sources.length ? (
            <ul className="noteList">
              {sources.slice(0, 4).map((source) => (
                <li key={source.id}>
                  <button
                    type="button"
                    className="noteRow"
                    onClick={() => navigate('/notes')}
                  >
                    <span className="noteRow__top">
                      <span className="noteRow__title">{source.title}</span>
                      <span className="noteRow__date">{when(source.modified)}</span>
                    </span>
                    <span className="noteRow__body">{source.location}</span>
                    <span className="tag">{source.kind}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="panel__note">
              Nothing is allowed yet. Open <strong>Manage access</strong> to grant a folder.
            </p>
          )}
        </section>

        <div className="stack">
          <section className="panel" aria-labelledby="today">
            <header className="panel__head">
              <h2 id="today" className="panel__title">
                {todayEvents.length ? 'Today' : 'Upcoming'}
              </h2>
              <span className="panel__meta">Calendar</span>
            </header>

            {agenda.length ? (
              <ul className="agenda">
                {agenda.map((item) => (
                  <li key={item.id}>
                    <span className="agenda__time">{time(item.modified)}</span>
                    <span className="agenda__body">
                      <strong>{item.title}</strong>
                      <em>Microsoft Calendar</em>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="panel__note">
                {hasCalendarGrant
                  ? 'No events were found in the current calendar window.'
                  : 'Connect a Microsoft account in Settings to see calendar events here.'}
              </p>
            )}
          </section>

          <section className="panel panel--inset" aria-labelledby="permissions">
            <header className="panel__head">
              <h2 id="permissions" className="panel__title">
                Permissions
              </h2>
              <span className="panel__meta">Revocable</span>
            </header>

            <ul className="checkList">
              {grants.map((grant) => (
                <li key={grant.id} className="is-on">
                  {grant.title}
                </li>
              ))}
              {!grants.length ? <li>No sources granted</li> : null}
            </ul>

            <p className="panel__note">Model · {adapter}</p>
          </section>
        </div>
      </div>
    </div>
  )
}
