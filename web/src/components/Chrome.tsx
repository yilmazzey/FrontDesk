import { Link } from 'react-router-dom'
import { site } from '../config'
import { useUI, type NotebookSection } from '../store'

const Arrow = () => (
  <svg viewBox="0 0 24 24" className="icon-arrow" aria-hidden="true">
    <path d="M5 12h13M13 6.5l5.5 5.5L13 17.5" />
  </svg>
)

/**
 * A small sun / moon switch. The label stays descriptive rather than cute so
 * it reads the same to a screen reader in either scheme.
 */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const theme = useUI((s) => s.theme)
  const toggleTheme = useUI((s) => s.toggleTheme)
  const light = theme === 'light'

  return (
    <button
      type="button"
      className={`themeToggle${light ? ' is-light' : ''}${className ? ` ${className}` : ''}`}
      role="switch"
      aria-checked={light}
      aria-label="Light mode"
      title={light ? 'Switch to dark mode' : 'Switch to light mode'}
      onClick={toggleTheme}
    >
      <span className="themeToggle__track" aria-hidden="true">
        <span className="themeToggle__knob">
          {light ? (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="4.2" />
              <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4L17 7M7 17l-1.6 1.6" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20.4 14.2A8.4 8.4 0 0 1 9.8 3.6a8.4 8.4 0 1 0 10.6 10.6Z" />
            </svg>
          )}
        </span>
      </span>
      <span className="themeToggle__label">Light</span>
    </button>
  )
}

export function TopBar() {
  const openNotebook = useUI((s) => s.openNotebook)
  const setSection = useUI((s) => s.setSection)
  const enterApp = useUI((s) => s.enterApp)

  const openSection = (section: NotebookSection) => {
    setSection(section)
    openNotebook()
  }

  return (
    <header className="topbar">
      <button type="button" className="wordmark" onClick={() => openSection('anika')}>
        <span className="wordmark__dot" aria-hidden="true" />
        <span className="wordmark__text">{site.wordmark}</span>
      </button>

      <nav className="topbar__nav" aria-label="Sections">
        <Link to="/about">About</Link>
        <button type="button" onClick={() => openSection('privacy')}>
          Privacy
        </button>
      </nav>

      <div className="topbar__actions">
        <span className="topbar__status">
          <span className="topbar__live" aria-hidden="true" />
          Live desk
        </span>
        <ThemeToggle />
        <button type="button" className="btn btn--primary btn--sm" onClick={enterApp}>
          Open the app
          <Arrow />
        </button>
      </div>
    </header>
  )
}

export function Hero() {
  return (
    <section className="hero" aria-label="Introduction">
      <p className="hero__event">
        <span className="hero__eventDot" aria-hidden="true" />
        Pfizer &amp; Newpage Solutions Hackathon Challenge
      </p>

      <h1 className="hero__title">
        Second brain for managers:
        <br />
        <em>A workspace that stays out of the way</em>
      </h1>
    </section>
  )
}

export function ScrollCue() {
  return (
    <div className="scrollCue" aria-hidden="true">
      <span className="scrollCue__label">Scroll to open the page</span>
      <span className="scrollCue__line">
        <span />
      </span>
    </div>
  )
}

export function Hud() {
  const lampOn = useUI((s) => s.lampOn)
  const toggleLamp = useUI((s) => s.toggleLamp)
  const setSection = useUI((s) => s.setSection)
  const openNotebook = useUI((s) => s.openNotebook)

  return (
    <footer className="hud">
      <div className="hud__left">
        <span>© {new Date().getFullYear()} {site.name}</span>
        <span className="hud__dot" aria-hidden="true" />
        <button
          type="button"
          onClick={() => {
            setSection('privacy')
            openNotebook()
          }}
        >
          Privacy
        </button>
        <Link to={site.appHref}>App</Link>
      </div>

      <div className="hud__mid" aria-hidden="true">
        <span className="hud__pulse" />
        The desk is interactive
      </div>

      <button
        type="button"
        className={`switch${lampOn ? ' is-on' : ''}`}
        role="switch"
        aria-checked={lampOn}
        aria-label="Desk light"
        onClick={toggleLamp}
      >
        <span className="switch__track" aria-hidden="true">
          <span className="switch__knob" />
        </span>
        <span className="switch__label">Desk light</span>
        <span className="switch__state">{lampOn ? 'On' : 'Off'}</span>
      </button>

      <p className="sr-only" aria-live="polite">
        Desk light {lampOn ? 'on' : 'off'}
      </p>
    </footer>
  )
}
