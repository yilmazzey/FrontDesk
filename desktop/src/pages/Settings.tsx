import { useState } from 'react'

const switches = [
  ['Local notes + OCR', 'Read and index documents on this machine', true],
  ['Send anonymous diagnostics', 'Never includes note content or file names', false],
  ['Start FrontDesk at login', 'Keep the desk ready in the background', true],
] as const

export default function Settings() {
  const [toggles, setToggles] = useState(() => switches.map(([, , on]) => on))

  return (
    <div className="page page--flush">
      <header className="pageHead pageHead--tight">
        <div>
          <p className="eyebrow">Preferences</p>
          <h1 className="pageTitle">
            Yours to <em>configure.</em>
          </h1>
        </div>
      </header>

      <div className="settingsGrid">
        <section className="panel" aria-labelledby="connections">
          <header className="panel__head">
            <h2 id="connections" className="panel__title">
              Connections
            </h2>
            <span className="panel__meta">Optional</span>
          </header>

          <div className="connectRow">
            <span className="connectRow__mark" aria-hidden="true">
              M
            </span>
            <span className="connectRow__body">
              <strong>Microsoft account</strong>
              <em>Mail and calendar · not connected</em>
            </span>
            <button type="button" className="btn btn--ghost btn--sm" disabled>
              Connect
            </button>
          </div>

          <div className="connectRow">
            <span className="connectRow__mark" aria-hidden="true">
              AI
            </span>
            <span className="connectRow__body">
              <strong>Local model</strong>
              <em>Runs offline · not installed</em>
            </span>
            <button type="button" className="btn btn--ghost btn--sm" disabled>
              Download
            </button>
          </div>

          <p className="panel__note">
            Each connection has its own permission. Revoke one without touching the others.
          </p>
        </section>

        <section className="panel" aria-labelledby="behaviour">
          <header className="panel__head">
            <h2 id="behaviour" className="panel__title">
              Behaviour
            </h2>
            <span className="panel__meta">This device</span>
          </header>

          <ul className="switchList">
            {switches.map(([label, note], i) => (
              <li key={label}>
                <span className="switchList__body">
                  <strong>{label}</strong>
                  <em>{note}</em>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={toggles[i]}
                  aria-label={label}
                  className={`tinySwitch${toggles[i] ? ' is-on' : ''}`}
                  onClick={() =>
                    setToggles((all) => all.map((on, index) => (index === i ? !on : on)))
                  }
                >
                  <span className="tinySwitch__knob" />
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel" aria-labelledby="storage">
          <header className="panel__head">
            <h2 id="storage" className="panel__title">
              Storage
            </h2>
            <span className="panel__meta">Local-first</span>
          </header>

          <dl className="kv">
            <div>
              <dt>Workspace</dt>
              <dd>~/Documents/FrontDesk</dd>
            </div>
            <div>
              <dt>Notes</dt>
              <dd>128 files · 4.2 MB</dd>
            </div>
            <div>
              <dt>Scans and OCR text</dt>
              <dd>36 files · 18.6 MB</dd>
            </div>
            <div>
              <dt>Backups</dt>
              <dd>Off — connect a folder to enable</dd>
            </div>
          </dl>
        </section>

        <section className="panel panel--inset" aria-labelledby="about">
          <header className="panel__head">
            <h2 id="about" className="panel__title">
              About
            </h2>
            <span className="panel__meta">v0.1.0 skeleton</span>
          </header>

          <p className="panel__note">
            FrontDesk is built for the Pfizer &amp; Newpage Solutions Hackathon Challenge. This is
            the desktop shell skeleton: notes, permissions and the local model are placeholders so
            the structure can be filled in next. Your files stay where they are.
          </p>

          <p className="panel__note">
            Onboarding lives on the web: run <code>npm run dev:web</code> and open{' '}
            <code>/monitor</code>.
          </p>
        </section>
      </div>
    </div>
  )
}
