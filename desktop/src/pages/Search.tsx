import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccess } from '../state/access'

function when(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString()
}

export default function Search() {
  const { sources } = useAccess()
  const [query, setQuery] = useState('')

  const results = useMemo(() => {
    const cleaned = query.trim().toLowerCase()
    if (!cleaned) return sources
    return sources.filter(
      (source) =>
        source.title.toLowerCase().includes(cleaned) ||
        source.location.toLowerCase().includes(cleaned) ||
        source.kind.toLowerCase().includes(cleaned),
    )
  }, [query, sources])

  return (
    <div className="page page--flush">
      <header className="pageHead pageHead--tight">
        <div>
          <p className="eyebrow">Local index</p>
          <h1 className="pageTitle">
            Find the <em>right page.</em>
          </h1>
        </div>
      </header>

      <div className="searchField">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M11 4.2a6.8 6.8 0 1 0 0 13.6 6.8 6.8 0 0 0 0-13.6ZM16 16l4 4" />
        </svg>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search notes, scans and mail…"
          aria-label="Search"
          autoFocus
        />
        <kbd>⌘K</kbd>
      </div>

      <div className="filterRow" aria-label="Filters">
        <button type="button" className="filter is-on">
          All
        </button>
        <button type="button" className="filter">
          Notes
        </button>
        <button type="button" className="filter">
          Scans
        </button>
        <button type="button" className="filter">
          Mail
        </button>
        <span className="filterRow__meta">
          {results.length} {results.length === 1 ? 'result' : 'results'} · from your allowed sources
        </span>
      </div>

      {results.length ? (
        <ul className="results">
          {results.map((source) => (
            <li key={source.id} className="result">
              <div className="result__head">
                <h2 className="result__title">{source.title}</h2>
                <span className="tag">{source.kind}</span>
              </div>
              <p className="result__body">{source.location}</p>
              <div className="result__foot">
                <span>As of {when(source.modified)}</span>
                <span className="result__div" aria-hidden="true" />
                <span>Read on demand</span>
                <span className="result__cite">Cited, not guessed</span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty">
          <p className="empty__title">Nothing on the desk matches that.</p>
          <p>
            The index only searches what you allow. <Link to="/access">Grant another source</Link>{' '}
            or try a broader word.
          </p>
        </div>
      )}
    </div>
  )
}
