import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/ipc'
import { useSaved } from '../state/saved'

function when(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

const LABEL: Record<string, string> = {
  briefing: 'Briefing',
  roadmap: 'Roadmap',
  todo: 'Todo',
  decision: 'Decision',
  reference: 'Reference',
}

export default function Saved() {
  const { items } = useSaved()

  const cards = useMemo(
    () =>
      items.map((item) => (
        <article key={item.id} className="panel savedCard">
          <div className="savedCard__head">
            <span className="tag">{LABEL[item.classification] ?? 'Reference'}</span>
            <span className="savedCard__meta">{when(item.savedAt)}</span>
          </div>
          <h3>{item.title}</h3>
          <p>{item.body.replace(/\s+/g, ' ').slice(0, 180)}</p>
          <div className="savedCard__foot">
            <span>{item.sources.length} sources</span>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => void api.openSaved(item.path)}>
              Open file
            </button>
          </div>
        </article>
      )),
    [items],
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
            Answers you saved this session, grouped by what they are for. The Markdown files live in
            your folder; FrontDesk keeps no copy.
          </p>
        </div>
      </header>

      {cards.length ? (
        <div className="savedGrid">{cards}</div>
      ) : (
        <div className="empty">
          <p className="empty__title">Nothing saved yet.</p>
          <p>
            Ask something, then choose <strong>Save answer</strong>. Pick a folder and a
            classification — Briefing, Roadmap, Todo, Decision or Reference.
          </p>
          <Link className="btn btn--ghost btn--sm" to="/">
            Back to the desk
          </Link>
        </div>
      )}
    </div>
  )
}
