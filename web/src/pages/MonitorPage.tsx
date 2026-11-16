import { Link } from 'react-router-dom'
import { site } from '../config'
import { ThemeToggle } from '../components/Chrome'

const permissions = [
  ['Local notes + OCR', 'Runs on this machine'],
  ['Microsoft mail', 'Requested when you connect'],
  ['Microsoft calendar', 'Requested when you connect'],
  ['Local AI model', 'Downloads on first run'],
] as const

const configure = [
  ['Workspace', '~/Documents/FrontDesk'],
  ['Local model', 'Not installed'],
  ['Appearance', 'Follows the system'],
] as const

export default function MonitorPage() {
  return (
    <main className="monitorPage">
      <header className="monitorPage__bar">
        <Link to="/" className="monitorPage__back">
          <span aria-hidden="true">←</span> Back to the desk
        </Link>

        <div className="monitorPage__brand">
          <span className="monitorPage__dot" aria-hidden="true" />
          <span className="monitorPage__word">{site.wordmark}</span>
          <span className="monitorPage__div" aria-hidden="true" />
          <span className="monitorPage__sub">monitor</span>
        </div>

        <ThemeToggle />
      </header>

      <div className="monitorPage__main">
        <p className="monitorPage__eyebrow">
          <span className="monitorPage__eyebrowDot" aria-hidden="true" />
          You opened the monitor
        </p>

        <h1 className="monitorPage__title">
          Open the desk
          <br />
          <em>on your desktop.</em>
        </h1>

        <p className="monitorPage__lede">
          The browser is the shop window. Notes, OCR, the local model and your Microsoft account
          all live in the desktop app — this page is where you sign in, decide what it may touch,
          and install it.
        </p>

        <div className="monitorPage__actions">
          <a
            className="btn btn--primary"
            href={site.downloadHref}
            target="_blank"
            rel="noreferrer"
          >
            Download / Open Desktop App
            <svg viewBox="0 0 24 24" className="icon-arrow" aria-hidden="true">
              <path d="M12 4.5v10M7.8 10.3 12 14.5l4.2-4.2M5 19.5h14" />
            </svg>
          </a>

          <Link className="btn btn--ghost" to="/">
            Back to the desk
          </Link>
        </div>

        <p className="monitorPage__notice">
          Installers are built for macOS, Windows and Linux from the release pipeline. The download
          page picks the right one for this machine.
        </p>

        <section className="monitorSteps" aria-label="Set up the desktop app">
          <article className="monitorStep">
            <span className="monitorStep__n">01</span>
            <h2 className="monitorStep__title">Sign in</h2>
            <p className="monitorStep__body">
              One account for the desktop app. Nothing is uploaded to a server; signing in simply
              unlocks the workspace on this machine.
            </p>

            <div className="monitorSignin">
              <button type="button" className="btn btn--ghost btn--block btn--sm" disabled>
                Continue with Microsoft
              </button>
              <button type="button" className="btn btn--ghost btn--block btn--sm" disabled>
                Continue with email
              </button>
              <span className="monitorPill">Not wired up yet</span>
            </div>
          </article>

          <article className="monitorStep">
            <span className="monitorStep__n">02</span>
            <h2 className="monitorStep__title">Permissions</h2>
            <p className="monitorStep__body">
              Every capability is separate and can be revoked. The app asks for the minimum first
              and explains the rest before it touches anything.
            </p>

            <ul className="monitorList">
              {permissions.map(([label, note]) => (
                <li key={label}>
                  <span>{label}</span>
                  <em>{note}</em>
                </li>
              ))}
            </ul>
          </article>

          <article className="monitorStep">
            <span className="monitorStep__n">03</span>
            <h2 className="monitorStep__title">Configure</h2>
            <p className="monitorStep__body">
              Pick where notes live and which local model to use. Defaults are sensible; you can
              change them later in Settings.
            </p>

            <ul className="monitorList">
              {configure.map(([label, value]) => (
                <li key={label}>
                  <span>{label}</span>
                  <em>{value}</em>
                </li>
              ))}
            </ul>

            <a
              className="monitorStep__link"
              href={site.downloadHref}
              target="_blank"
              rel="noreferrer"
            >
              Download the desktop package <span aria-hidden="true">→</span>
            </a>
          </article>
        </section>

        <footer className="monitorPage__foot">
          <span>© {new Date().getFullYear()} {site.name}</span>
          <span className="monitorPage__footDiv" aria-hidden="true" />
          <span>{site.hackathon}</span>
          <span className="monitorPage__footDiv" aria-hidden="true" />
          <span>Local-first · Microsoft Graph later</span>
          <span className="monitorPage__footDiv" aria-hidden="true" />
          <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>
        </footer>
      </div>
    </main>
  )
}
