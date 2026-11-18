import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { whenDate } from '../lib/format'
import { api } from '../lib/ipc'
import { category, categoryLabel, type TimelineFilter } from '../lib/timeline'
import { useAccess } from '../state/access'
import type { SearchHit, SourceRef } from '../types/source'

const filters: Array<{ id: TimelineFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'meetings', label: 'Meetings' },
  { id: 'notes', label: 'Notes' },
  { id: 'scans', label: 'Scans' },
  { id: 'mail', label: 'Mail' },
  { id: 'onenote', label: 'OneNote' },
]

function keepFilter(hit: SearchHit, filter: TimelineFilter) {
  return filter === 'all' || category(hit.source) === filter
}

export default function Search() {
  const { sources } = useAccess()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<TimelineFilter>('all')
  const [results, setResults] = useState<SearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [openError, setOpenError] = useState<string | null>(null)

  const candidates = useMemo(
    () => sources.filter((source) => filter === 'all' || category(source) === filter),
    [filter, sources],
  )

  useEffect(() => {
    let active = true
    const timer = setTimeout(async () => {
      setSearchError(null)
      if (!query.trim()) {
        setResults(candidates.map((source) => ({ source, excerpt: '' })))
        setSearching(false)
        return
      }

      setSearching(true)
      try {
        const found = await api.searchSources(query.trim())
        if (active) {
          setResults(found.filter((hit) => keepFilter(hit, filter)))
        }
      } catch (cause) {
        if (active) {
          setResults([])
          setSearchError(cause instanceof Error ? cause.message : String(cause))
        }
      } finally {
        if (active) setSearching(false)
      }
    }, 250)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [candidates, filter, query])

  async function open(source: SourceRef) {
    setOpenError(null)
    try {
      await api.openOriginal(source.id)
    } catch (cause) {
      setOpenError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <div className="page page--flush">
      <header className="pageHead pageHead--tight">
        <div>
          <p className="eyebrow">Files on the desk</p>
          <h1 className="pageTitle">
            Browse what you've <em>allowed.</em>
          </h1>
          <p className="pageLede pageLede--tight">
            Search the contents of notes, scans, mail, calendar and OneNote. No answers here —{' '}
            <Link to="/" state={{ focusAsk: true }}>ask the assistant</Link> when you want one.
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
          placeholder="Search names and source contents…"
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
          {searching ? 'Searching source contents…' : `${results.length} matching sources`}
        </span>
      </div>

      {searchError ? <p className="notice notice--bad">{searchError}</p> : null}
      {openError ? <p className="notice notice--bad">{openError}</p> : null}

      {searchError ? null : results.length ? (
        <ul className="results">
          {results.map((hit) => {
            const people = hit.source.people?.filter(Boolean) ?? []
            return (
              <li key={hit.source.id}>
                <button
                  type="button"
                  className="result result--button"
                  onClick={() => void open(hit.source)}
                  aria-label={`Open ${hit.source.title}`}
                >
                  <span className="result__head">
                    <span className="result__title">{hit.source.title}</span>
                    <span className="tag">{categoryLabel(hit.source)}</span>
                  </span>
                  {hit.excerpt ? <span className="result__body">{hit.excerpt}</span> : null}
                  <span className="result__foot">
                    <span>{people.length ? people.slice(0, 3).join(', ') : categoryLabel(hit.source)}</span>
                    <span className="result__div" aria-hidden="true" />
                    <span>{whenDate(hit.source.modified)}</span>
                    <span className="result__go">Open ↗</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="empty">
          <p className="empty__title">Nothing on the desk matches that.</p>
          <p>
            The browser only lists what you allow. <Link to="/settings">Grant another source</Link>{' '}
            or try a broader word.
          </p>
        </div>
      )}
    </div>
  )
}
