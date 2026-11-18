import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import PathLink from '../components/PathLink'
import { api, inTauri } from '../lib/ipc'
import { useAccess } from '../state/access'
import { useSaved } from '../state/saved'
import type { SavedClassification } from '../types/source'

function when(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

const LABEL: Record<SavedClassification, string> = {
  briefing: 'Briefing',
  roadmap: 'Roadmap',
  todo: 'Todo',
  decision: 'Decision',
  reference: 'Reference',
}

const filters: Array<{ id: 'all' | SavedClassification; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'briefing', label: 'Briefing' },
  { id: 'roadmap', label: 'Roadmap' },
  { id: 'todo', label: 'Todo' },
  { id: 'decision', label: 'Decision' },
  { id: 'reference', label: 'Reference' },
]

export default function Saved() {
  const { items, loading, refresh } = useSaved()
  const { info, refresh: refreshAccess } = useAccess()
  const [filter, setFilter] = useState<'all' | SavedClassification>('all')
  const [error, setError] = useState<string | null>(null)
  const [choosing, setChoosing] = useState(false)

  async function chooseFolder() {
    if (!inTauri()) {
      setError('The folder picker needs the desktop app.')
      return
    }
    setChoosing(true)
    setError(null)
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const picked = await open({ directory: true, multiple: false })
      if (typeof picked === 'string') {
        await api.setSavedFolder(picked)
        await Promise.all([refresh(), refreshAccess()])
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setChoosing(false)
    }
  }

  const visible = useMemo(
    () => (filter === 'all' ? items : items.filter((item) => item.classification === filter)),
    [filter, items],
  )

  const cards = useMemo(
    () =>
      visible.map((item) => (
        <article key={item.id} className="panel savedCard">
          <div className="savedCard__head">
            <span className="tag">{LABEL[item.classification]}</span>
            <span className="savedCard__meta">{when(item.savedAt)}</span>
          </div>
          <h3>{item.title}</h3>
          <p>{item.body.replace(/\s+/g, ' ').slice(0, 180)}</p>
          <div className="savedCard__foot">
            <span>{item.sources.length} sources</span>
            <span className="savedCard__actions">
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  setError(null)
                  void api.openSaved(item.path).catch((cause) => {
                    setError(cause instanceof Error ? cause.message : String(cause))
                  })
                }}
              >
                Open file
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  setError(null)
                  void api.revealPath(item.path).catch((cause) => {
                    setError(cause instanceof Error ? cause.message : String(cause))
                  })
                }}
              >
                Reveal in Finder
              </button>
            </span>
          </div>
        </article>
      )),
    [visible],
  )

  return (
    <div className="page">
      <header className="pageHead pageHead--dashboard">
        <div>
          <p className="eyebrow">Saved</p>
          <h1 className="pageTitle">
            Kept where <em>you chose.</em>
          </h1>
          <p className="pageLede">
            Answers rehydrated from the Markdown files in your folder. Filter by what they are for;
            FrontDesk keeps no copy of its own.
          </p>
          {info?.savedFolder ? (
            <p className="panel__note">
              Reading from <PathLink path={info.savedFolder}>{info.savedFolder}</PathLink>
            </p>
          ) : null}
        </div>
      </header>

      <div className="modelActions savedFolderActions">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          disabled={choosing}
          onClick={() => void chooseFolder()}
        >
          {choosing
            ? 'Choosing…'
            : info?.savedFolder
              ? 'Change saved folder'
              : 'Choose saved folder'}
        </button>
      </div>

      <div className="filterRow" aria-label="Saved answer filters">
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
          {loading ? 'Reading your saved folder…' : `${visible.length} saved`}
        </span>
      </div>

      {error ? <p className="notice notice--bad">{error}</p> : null}

      {cards.length ? (
        <div className="savedGrid">{cards}</div>
      ) : (
        <div className="empty">
          <p className="empty__title">
            {loading
              ? 'Reading your saved folder…'
              : items.length
                ? 'Nothing in this category yet.'
                : 'Nothing saved yet.'}
          </p>
          <p>
            {items.length
              ? 'Choose another category or save a new answer.'
              : 'Ask something, then choose Save answer. Pick a classification — Briefing, Roadmap, Todo, Decision or Reference.'}
          </p>
          <Link className="btn btn--ghost btn--sm" to="/">
            Back to the desk
          </Link>
        </div>
      )}
    </div>
  )
}
