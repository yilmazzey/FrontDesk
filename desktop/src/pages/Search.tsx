import { useMemo, useState } from 'react'
import { isDesktopApp, loadMicrosoftSources } from '../services/microsoft'
import {
  searchMicrosoftSources,
  type MicrosoftSourceFilter,
} from '../services/microsoftSearch'

const filters: Array<{ value: MicrosoftSourceFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'onenote', label: 'Notes' },
  { value: 'email', label: 'Mail' },
  { value: 'calendar', label: 'Calendar' },
]

function messageOf(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason)
}

export default function Search() {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<MicrosoftSourceFilter>('all')
  const [sources, setSources] = useState<Awaited<ReturnType<typeof loadMicrosoftSources>>>(null)
  const [busy, setBusy] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState('')
  const desktopApp = isDesktopApp()
  const results = useMemo(
    () => (query.trim() && sources ? searchMicrosoftSources(query, sources, filter) : []),
    [filter, query, sources],
  )

  const loadSources = async (refresh = false) => {
    setBusy(true)
    setError('')
    try {
      const loaded = await loadMicrosoftSources(refresh)
      if (!loaded) {
        setError('Connect your Microsoft account in Settings to search Microsoft data.')
        setSearched(false)
        return
      }
      setSources(loaded)
      setSearched(true)
    } catch (reason) {
      setError(messageOf(reason))
      setSearched(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page page--flush">
      <header className="pageHead pageHead--tight">
        <div>
          <p className="eyebrow">Microsoft index</p>
          <h1 className="pageTitle">
            Find the <em>right source.</em>
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
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !sources) void loadSources()
          }}
          placeholder="Search Microsoft mail, calendar and OneNote…"
          aria-label="Search Microsoft sources"
          autoFocus
        />
        {!sources ? (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={!desktopApp || !query.trim() || busy}
            onClick={() => void loadSources()}
          >
            {busy ? 'Loading…' : 'Search'}
          </button>
        ) : null}
      </div>

      <div className="filterRow" aria-label="Microsoft source filters">
        {filters.map((item) => (
          <button
            key={item.value}
            type="button"
            className={`filter${filter === item.value ? ' is-on' : ''}`}
            onClick={() => setFilter(item.value)}
          >
            {item.label}
          </button>
        ))}
        <span className="filterRow__meta">
          {sources
            ? `${results.length} ${results.length === 1 ? 'result' : 'results'} · ${sources.length} Microsoft sources loaded`
            : 'Microsoft data only · memory cache'}
        </span>
        {sources ? (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={busy}
            onClick={() => void loadSources(true)}
          >
            {busy ? 'Refreshing…' : 'Refresh'}
          </button>
        ) : null}
      </div>

      {!desktopApp ? (
        <p className="panel__note">Open FrontDesk in the Tauri desktop app to search Microsoft data.</p>
      ) : null}
      {error ? <p className="connectionError" role="alert">{error}</p> : null}

      {searched && results.length ? (
        <ul className="results">
          {results.map((hit) => (
            <li key={hit.source.id} className="result">
              <div className="result__head">
                <h2 className="result__title">{hit.source.title}</h2>
                <span className="tag">{hit.source.kind}</span>
              </div>
              <p className="result__body">{hit.excerpt}</p>
              <div className="result__foot">
                {hit.source.detail ?? 'Microsoft'}
                {hit.source.date ? ` · ${hit.source.date}` : ''}
                <span className="result__cite">[{hit.citation}] Microsoft source</span>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {searched && !results.length ? (
        <div className="empty">
          <p className="empty__title">Nothing in Microsoft data matches that.</p>
          <p>Try a different word or switch the source filter.</p>
        </div>
      ) : null}
    </div>
  )
}
