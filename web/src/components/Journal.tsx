import { Link } from 'react-router-dom'
import { site } from '../config'
import { useUI, type NotebookSection } from '../store'
import { Gallery } from './Gallery'
import { ThemeToggle } from './Chrome'

const Arrow = () => (
  <svg viewBox="0 0 24 24" className="icon-arrow" aria-hidden="true">
    <path d="M5 12h13M13 6.5l5.5 5.5L13 17.5" />
  </svg>
)

export function Journal() {
  const setSection = useUI((s) => s.setSection)
  const openNotebook = useUI((s) => s.openNotebook)

  const open = (section: NotebookSection) => {
    setSection(section)
    openNotebook()
  }

  return (
    <div className="journal">
      <header className="journal__bar">
        <button type="button" className="journal__mark" onClick={() => open('about')}>
          <span className="journal__markDot" aria-hidden="true" />
          {site.wordmark}
        </button>

        <nav className="journal__nav" aria-label="Sections">
          <button type="button" onClick={() => open('about')}>
            About
          </button>
          <button type="button" onClick={() => open('pricing')}>
            Pricing
          </button>
          <button type="button" onClick={() => open('privacy')}>
            Privacy
          </button>
          <Link to={site.appHref}>App</Link>
        </nav>

        <div className="journal__barActions">
          <ThemeToggle />
          <Link className="btn btn--ink btn--sm" to={site.appHref}>
            Open the app
            <Arrow />
          </Link>
        </div>
      </header>

      <Gallery />

      <footer className="journal__foot">
        <div className="journal__footLeft">
          <span className="journal__footMark">
            {site.wordmark}<span>.</span>
          </span>
          <span>© {new Date().getFullYear()} {site.name}</span>
        </div>

        <nav className="journal__footNav" aria-label="Footer">
          <button type="button" onClick={() => open('about')}>
            About
          </button>
          <button type="button" onClick={() => open('pricing')}>
            Pricing
          </button>
          <button type="button" onClick={() => open('privacy')}>
            Privacy
          </button>
          <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>
        </nav>

        <button
          type="button"
          className="journal__toTop"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          Back to the desk <span aria-hidden="true">↑</span>
        </button>
      </footer>
    </div>
  )
}
