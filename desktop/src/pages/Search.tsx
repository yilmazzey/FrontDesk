import { useMemo, useState } from 'react'
import { notes } from '../data'

export default function Search() {
  const [query, setQuery] = useState('')

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return notes
    return notes.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.body.toLowerCase().includes(q) ||
        n.tag.toLowerCase().includes(q),
    )
  }, [query])

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
          onChange={(e) => setQuery(e.target.value)}
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
          {results.length} {results.length === 1 ? 'result' : 'results'} · searched on this machine
        </span>
      </div>

      {results.length ? (
        <ul className="results">
          {results.map((n) => (
            <li key={n.id} className="result">
              <div className="result__head">
                <h2 className="result__title">{n.title}</h2>
                <span className="tag">{n.tag}</span>
              </div>
              <p className="result__body">{n.body}</p>
              <div className="result__foot">
                <span>{n.updated}</span>
                <span className="result__div" aria-hidden="true" />
                <span>{n.source ?? 'Note'}</span>
                <span className="result__cite">Cited, not guessed</span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty">
          <p className="empty__title">Nothing on the desk matches that.</p>
          <p>The local index only searches what you actually have. Try a broader word.</p>
        </div>
      )}
    </div>
  )
}
