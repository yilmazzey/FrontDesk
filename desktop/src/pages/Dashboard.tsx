import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccess } from '../state/access'

const today = [
  { time: '09:30', title: 'Study sync — protocol review', meta: 'Microsoft Teams' },
  { time: '11:00', title: '1:1 with Ada', meta: 'Calendar' },
  { time: '15:30', title: 'Deep work block', meta: 'Held by FrontDesk' },
]

function when(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString()
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { grants, sources, models, info, loading } = useAccess()
  const [question, setQuestion] = useState('')

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
          <p className="eyebrow">Friday, 13 November</p>
          <h1 className="pageTitle">
            The desk is <em>open.</em>
          </h1>
          <p className="pageLede">
            Notes, mail and the local index are ready. Nothing here has left this machine.
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
          Answers cite the note or message they came from. No citation, no answer.
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
          <span className="stat__label">Requests sent to a server</span>
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
                Today
              </h2>
              <span className="panel__meta">Calendar</span>
            </header>

            <ul className="agenda">
              {today.map((item) => (
                <li key={item.time}>
                  <span className="agenda__time">{item.time}</span>
                  <span className="agenda__body">
                    <strong>{item.title}</strong>
                    <em>{item.meta}</em>
                  </span>
                </li>
              ))}
            </ul>

            <p className="panel__note">
              Microsoft calendar is not connected yet. Connect it in Settings when you are ready.
            </p>
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
