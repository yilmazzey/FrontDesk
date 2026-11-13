import { useState } from 'react'
import { notes } from '../data'

export default function Notes() {
  const [selected, setSelected] = useState(notes[0].id)
  const note = notes.find((n) => n.id === selected) ?? notes[0]

  return (
    <div className="page page--flush">
      <header className="pageHead pageHead--tight">
        <div>
          <p className="eyebrow">Notebook</p>
          <h1 className="pageTitle">
            Everything you <em>wrote down.</em>
          </h1>
        </div>

        <button type="button" className="btn btn--primary">
          New note
          <span aria-hidden="true">+</span>
        </button>
      </header>

      <div className="notesSplit">
        <section className="notesRail" aria-label="All notes">
          <div className="notesRail__head">
            <span>{notes.length} notes</span>
            <span>Local</span>
          </div>

          <ul>
            {notes.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className={`noteRow noteRow--rail${n.id === selected ? ' is-active' : ''}`}
                  onClick={() => setSelected(n.id)}
                >
                  <span className="noteRow__top">
                    <span className="noteRow__title">{n.title}</span>
                    <span className="noteRow__date">{n.updated}</span>
                  </span>
                  <span className="noteRow__body">{n.body}</span>
                  <span className="tag">{n.tag}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <article className="editor" aria-label={`Note: ${note.title}`}>
          <div className="editor__meta">
            <span className="tag">{note.tag}</span>
            <span>Edited {note.updated.toLowerCase()}</span>
            {note.source ? <span>Source · {note.source}</span> : null}
          </div>

          <h2 className="editor__title">{note.title}</h2>
          <p className="editor__body">{note.body}</p>

          <div className="editor__placeholder" aria-hidden="true">
            <span className="editor__caret" />
          </div>

          <footer className="editor__foot">
            <span>Plain markdown</span>
            <span className="editor__footDiv" aria-hidden="true" />
            <span>Autosaved to this device</span>
            <span className="editor__footNote">Placeholder editor — typing arrives with the real app.</span>
          </footer>
        </article>
      </div>
    </div>
  )
}
