import { notes } from '../data'

const today = [
  { time: '09:30', title: 'Study sync — protocol review', meta: 'Microsoft Teams' },
  { time: '11:00', title: '1:1 with Ada', meta: 'Calendar' },
  { time: '15:30', title: 'Deep work block', meta: 'Held by FrontDesk' },
]

export default function Dashboard() {
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

        <button type="button" className="btn btn--primary">
          New note
          <span aria-hidden="true">+</span>
        </button>
      </header>

      <section className="ask" aria-label="Ask the desk">
        <label className="ask__label" htmlFor="ask">
          Ask the desk
        </label>
        <div className="ask__row">
          <input
            id="ask"
            className="ask__input"
            placeholder="What did I write about the OCR pipeline?"
            readOnly
          />
          <button type="button" className="btn btn--ghost" disabled>
            Ask
          </button>
        </div>
        <p className="ask__hint">
          Answers cite the note or message they came from. No citation, no answer.
        </p>
      </section>

      <section className="statRow" aria-label="This week">
        <article className="stat">
          <span className="stat__value">128</span>
          <span className="stat__label">Notes on this device</span>
        </article>
        <article className="stat">
          <span className="stat__value">14</span>
          <span className="stat__label">Pages read by OCR</span>
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
              Recent notes
            </h2>
            <span className="panel__meta">All local</span>
          </header>

          <ul className="noteList">
            {notes.slice(0, 4).map((note) => (
              <li key={note.id}>
                <button type="button" className="noteRow">
                  <span className="noteRow__top">
                    <span className="noteRow__title">{note.title}</span>
                    <span className="noteRow__date">{note.updated}</span>
                  </span>
                  <span className="noteRow__body">{note.body}</span>
                  <span className="tag">{note.tag}</span>
                </button>
              </li>
            ))}
          </ul>
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
              <span className="panel__meta">On this machine</span>
            </header>

            <ul className="checkList">
              <li className="is-on">Local notes + OCR</li>
              <li>Microsoft mail</li>
              <li>Microsoft calendar</li>
              <li>Local AI model</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
