import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/ipc'
import { useAccess } from '../state/access'
import type { Excerpt } from '../types/source'

function when(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString()
}

export default function Notes() {
  const { sources, loading } = useAccess()
  const [selected, setSelected] = useState<string | null>(null)
  const [excerpt, setExcerpt] = useState<Excerpt | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!selected && sources.length) setSelected(sources[0].id)
    if (selected && !sources.some((source) => source.id === selected)) {
      setSelected(sources[0]?.id ?? null)
    }
  }, [selected, sources])

  useEffect(() => {
    if (!selected) {
      setExcerpt(null)
      return
    }
    let cancelled = false
    setError(null)
    setExcerpt(null)
    api
      .readSource(selected)
      .then((next) => {
        if (!cancelled) setExcerpt(next)
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
      })
    return () => {
      cancelled = true
    }
  }, [selected])

  const note = sources.find((source) => source.id === selected)

  return (
    <div className="page page--flush">
      <header className="pageHead pageHead--tight">
        <div>
          <p className="eyebrow">Notebook</p>
          <h1 className="pageTitle">
            Everything you <em>wrote down.</em>
          </h1>
          <p className="pageLede">
            Read from the original, on demand. FrontDesk does not keep a second copy of your notes.
          </p>
        </div>

        <button
          type="button"
          className="btn btn--primary"
          disabled
          title="FrontDesk reads notes where they live. Authoring stays in your own tool."
        >
          New note
          <span aria-hidden="true">+</span>
        </button>
      </header>

      {!loading && !sources.length ? (
        <div className="empty">
          <p className="empty__title">Nothing is in scope yet.</p>
          <p>
            Grant a folder on the <Link to="/access">Access page</Link> and its notes will appear
            here.
          </p>
        </div>
      ) : (
        <div className="notesSplit">
          <section className="notesRail" aria-label="All notes">
            <div className="notesRail__head">
              <span>
                {sources.length} {sources.length === 1 ? 'note' : 'notes'}
              </span>
              <span>Read-only</span>
            </div>

            <ul>
              {sources.map((source) => (
                <li key={source.id}>
                  <button
                    type="button"
                    className={`noteRow noteRow--rail${source.id === selected ? ' is-active' : ''}`}
                    onClick={() => setSelected(source.id)}
                  >
                    <span className="noteRow__top">
                      <span className="noteRow__title">{source.title}</span>
                      <span className="noteRow__date">{when(source.modified)}</span>
                    </span>
                    <span className="noteRow__body">{source.location}</span>
                    <span className="tag">{source.kind}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <article className="editor" aria-label={note ? `Note: ${note.title}` : 'Note'}>
            {error ? <p className="notice notice--bad">{error}</p> : null}
            {note ? (
              <>
                <div className="editor__meta">
                  <span className="tag">{note.kind}</span>
                  <span>As of {when(note.modified)}</span>
                  <span>Source · {note.location}</span>
                </div>

                <h2 className="editor__title">{note.title}</h2>
                <p className="editor__body editor__body--read">{excerpt?.text ?? 'Reading…'}</p>

                <footer className="editor__foot">
                  <span>Read on demand</span>
                  <span className="editor__footDiv" aria-hidden="true" />
                  <span>Nothing stored</span>
                  <span className="editor__footNote">
                    Authoring stays in OneNote, your folder, or wherever the original lives.
                  </span>
                </footer>
              </>
            ) : (
              <p className="panel__note">Select a note to read it.</p>
            )}
          </article>
        </div>
      )}
    </div>
  )
}
