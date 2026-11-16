import { useEffect, useState } from 'react'
import { MicrosoftAssistant } from '../components/MicrosoftAssistant'
import {
  getMicrosoftDashboardData,
  isDesktopApp,
  type MicrosoftDashboardData,
} from '../services/microsoft'

export default function Dashboard() {
  const [microsoftData, setMicrosoftData] = useState<MicrosoftDashboardData | null>(null)
  const [microsoftStatus, setMicrosoftStatus] = useState<
    'loading' | 'connected' | 'disconnected' | 'browser' | 'error'
  >('loading')
  const [microsoftError, setMicrosoftError] = useState('')

  useEffect(() => {
    if (!isDesktopApp()) {
      setMicrosoftStatus('browser')
      return
    }

    const start = new Date()
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000)
    getMicrosoftDashboardData(start.toISOString(), end.toISOString())
      .then((data) => {
        setMicrosoftData(data)
        setMicrosoftStatus(data ? 'connected' : 'disconnected')
      })
      .catch((reason: unknown) => {
        setMicrosoftError(reason instanceof Error ? reason.message : String(reason))
        setMicrosoftStatus('error')
      })
  }, [])

  return (
    <div className="page">
      <header className="pageHead">
        <div>
          <p className="eyebrow">Friday, 13 November</p>
          <h1 className="pageTitle">
            The desk is <em>open.</em>
          </h1>
          <p className="pageLede">
            Search connected Microsoft data and get cited answers from a model running on this device.
          </p>
          <p className="eventTag">Pfizer &amp; Newpage Solutions Hackathon Challenge</p>
        </div>

        <button type="button" className="btn btn--primary">
          New note
          <span aria-hidden="true">+</span>
        </button>
      </header>

      <MicrosoftAssistant />

      <section className="statRow" aria-label="This week">
        <article className="stat">
          <span className="stat__value">{microsoftData?.pages.length ?? '—'}</span>
          <span className="stat__label">OneNote pages · recent</span>
        </article>
        <article className="stat">
          <span className="stat__value">{microsoftData?.events.length ?? '—'}</span>
          <span className="stat__label">Calendar events · 7 days</span>
        </article>
        <article className="stat">
          <span className="stat__value">{microsoftData?.messages.length ?? '—'}</span>
          <span className="stat__label">Inbox messages · recent</span>
        </article>
      </section>

      <div className="columnPair">
        <section className="panel" aria-labelledby="recent">
          <header className="panel__head">
            <h2 id="recent" className="panel__title">
              Microsoft OneNote
            </h2>
            <span className="panel__meta">Recent pages</span>
          </header>

          <ul className="noteList">
            {microsoftData?.pages.map((page) => (
              <li key={page.id}>
                <div className="noteRow">
                  <span className="noteRow__top">
                    <span className="noteRow__title">{page.title || 'Untitled page'}</span>
                  </span>
                  <span className="tag">Microsoft OneNote</span>
                </div>
              </li>
            ))}
          </ul>
          {microsoftStatus === 'loading' ? <p className="panel__note">Loading Microsoft data…</p> : null}
          {microsoftStatus === 'disconnected' ? (
            <p className="panel__note">Connect your Microsoft account in Settings to load OneNote pages.</p>
          ) : null}
          {microsoftData?.pages.length === 0 ? (
            <p className="panel__note">No Microsoft OneNote pages were returned.</p>
          ) : null}
        </section>

        <div className="stack">
          <section className="panel" aria-labelledby="today">
            <header className="panel__head">
              <h2 id="today" className="panel__title">
                Today
              </h2>
              <span className="panel__meta">Next 7 days</span>
            </header>

            <ul className="agenda">
              {microsoftData?.events.map((event) => {
                const startTime = event.start?.dateTime
                const time = startTime
                  ? new Date(startTime).toLocaleTimeString([], {
                      hour: 'numeric',
                      minute: '2-digit',
                    })
                  : '—'
                return (
                  <li key={event.id}>
                    <span className="agenda__time">{time}</span>
                    <span className="agenda__body">
                      <strong>{event.subject || 'Untitled event'}</strong>
                      <em>{event.start?.timeZone ?? 'Microsoft Calendar'}</em>
                    </span>
                  </li>
                )
              })}
            </ul>

            {microsoftStatus === 'loading' ? <p className="panel__note">Loading Microsoft data…</p> : null}
            {microsoftStatus === 'disconnected' ? (
              <p className="panel__note">Connect your Microsoft account in Settings to load calendar, inbox and OneNote.</p>
            ) : null}
            {microsoftStatus === 'browser' ? (
              <p className="panel__note">Open FrontDesk in the Tauri desktop app to connect Microsoft.</p>
            ) : null}
            {microsoftStatus === 'connected' && !microsoftData?.events.length ? (
              <p className="panel__note">No upcoming events in the next seven days.</p>
            ) : null}
            {microsoftStatus === 'error' ? (
              <p className="connectionError" role="alert">{microsoftError}</p>
            ) : null}
          </section>

          {microsoftData ? (
            <section className="panel" aria-labelledby="inbox">
              <header className="panel__head">
                <h2 id="inbox" className="panel__title">
                  Inbox
                </h2>
                <span className="panel__meta">{microsoftData.messages.length} recent</span>
              </header>
              <ul className="agenda">
                {microsoftData.messages.map((message) => (
                  <li key={message.id}>
                    <span className="agenda__time">Mail</span>
                    <span className="agenda__body">
                      <strong>{message.subject || 'No subject'}</strong>
                      <em>
                        {message.from?.emailAddress?.name ??
                          message.from?.emailAddress?.address ??
                          'Unknown sender'}
                      </em>
                    </span>
                  </li>
                ))}
              </ul>
              {!microsoftData.messages.length ? (
                <p className="panel__note">No messages were returned from the inbox.</p>
              ) : null}
            </section>
          ) : null}

          <section className="panel panel--inset" aria-labelledby="permissions">
            <header className="panel__head">
              <h2 id="permissions" className="panel__title">
                Permissions
              </h2>
              <span className="panel__meta">On this machine</span>
            </header>

            <ul className="checkList">
              <li>Local notes + OCR</li>
              <li className={microsoftData ? 'is-on' : ''}>Microsoft mail</li>
              <li className={microsoftData ? 'is-on' : ''}>Microsoft calendar</li>
              <li className={microsoftData ? 'is-on' : ''}>Microsoft OneNote</li>
              <li className="is-on">Local AI model</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
