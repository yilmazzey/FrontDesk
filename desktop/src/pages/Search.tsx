import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccess } from '../state/access'
import type { SourceRef } from '../types/source'

function when(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString()
}

type Filter = 'all' | 'notes' | 'scans' | 'mail'

function category(source: SourceRef): Exclude<Filter, 'all'> {
  if (source.kind === 'mail' || source.kind === 'onenote') return 'mail'
  if (source.kind === 'ocr' || source.location.toLowerCase().endsWith('.pdf')) return 'scans'
  return 'notes'
}

const filters: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'notes', label: 'Notes' },
  { id: 'scans', label: 'Scans' },
  { id: 'mail', label: 'Mail' },
]

export default function Search() {
  const { sources } = useAccess()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  const results = useMemo(() => {
    const cleaned = query.trim().toLowerCase()
    return sources.filter((source) => {
      if (filter !== 'all' && category(source) !== filter) return false
      if (!cleaned) return true
      return (
        source.title.toLowerCase().includes(cleaned) ||
        source.location.toLowerCase().includes(cleaned) ||
        source.kind.toLowerCase().includes(cleaned)
      )
    })
  }, [query, sources, filter])

  return (
    <div className="page page--flush">
      <header className="pageHead pageHead--tight">
        <div>
          <p className="eyebrow">Files on the desk</p>
          <h1 className="pageTitle">
            Browse what you've <em>allowed.</em>
          </h1>
          <p className="pageLede pageLede--tight">
            A plain file browser for the notes, scans and mail you granted. No answers here —{' '}
            <Link to="/chat">ask the assistant</Link> when you want one.
          </p>
        </div>
      </header>

      <div className="searchField">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M11 4.2a6.8 6.8 0 1 0 0 13.6 6.8 6.8 0 0 0 0-13.6ZM16 16l4 4" />
        </svg>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter by name, path or type…"
          aria-label="Filter files"
          autoFocus
        />
        <kbd>⌘K</kbd>
      </div>

      <div className="filterRow" aria-label="Filters">
        {filters.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`filter${filter === item.id ? ' is-on' : ''}`}
            onClick={() => setFilter(item.id)}
            aria-pressed={filter === item.id}
          >
            {item.label}
          </button>
        ))}
        <span className="filterRow__meta">
          {results.length} {results.length === 1 ? 'file' : 'files'} · from your allowed sources
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
                <span className="result__cite">Original stays where it is</span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty">
          <p className="empty__title">Nothing on the desk matches that.</p>
          <p>
            The browser only lists what you allow. <Link to="/access">Grant another source</Link>{' '}
            or try a broader word.
          </p>
        </div>
      )}
    </div>
  )
}
