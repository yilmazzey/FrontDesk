import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/ipc'
import { useAccess } from '../state/access'
import type { OpenLoop } from '../types/source'

type Filter = 'all' | 'mine' | 'waiting'

function sourceDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

function directionLabel(direction: OpenLoop['direction']) {
  return direction === 'mine' ? 'I owe' : 'Waiting on'
}

function LoopGroup({
  label,
  items,
  empty,
  onAsk,
  onOpen,
  onPerson,
}: {
  label: string
  items: OpenLoop[]
  empty: string
  onAsk: (question: string) => void
  onOpen: (loop: OpenLoop) => void
  onPerson: (person: string) => void
}) {
  return (
    <section className="loopsGroup">
      <header className="loopsGroup__head">
        <h2>{label}</h2>
        <span>{items.length}</span>
      </header>
      {items.length ? (
        <ul className="loopPageList">
          {items.map((loop) => (
            <li className="loopPageRow" key={loop.id}>
              <span className={`loopPageRow__mark is-${loop.direction}`} aria-hidden="true" />
              <div className="loopPageRow__body">
                <p className="loopPageRow__text">{loop.text}</p>
                <div className="loopPageRow__meta">
                  <span className={`loopBadge is-${loop.direction}`}>
                    {directionLabel(loop.direction)}
                  </span>
                  {loop.person ? (
                    <button
                      type="button"
                      className="loopPerson"
                      onClick={() => onPerson(loop.person ?? '')}
                      title={`Filter by ${loop.person}`}
                    >
                      {loop.person}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="loopSource"
                    onClick={() => onOpen(loop)}
                    title="Open the source"
                  >
                    {loop.sourceTitle}
                    {loop.timestamp ? ` · ${sourceDate(loop.timestamp)}` : ''}
                  </button>
                </div>
              </div>
              <div className="loopPageRow__actions">
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() =>
                    onAsk(
                      loop.person
                        ? `What do I owe ${loop.person}, and what is still open?`
                        : `Catch me up on: ${loop.text}`,
                    )
                  }
                >
                  Ask
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="loopsEmpty">{empty}</p>
      )}
    </section>
  )
}

export default function OpenLoops() {
  const {
    snapshot,
    snapshotLoading: loading,
    snapshotError: error,
    resync,
  } = useAccess()
  const navigate = useNavigate()
  const [notice, setNotice] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [person, setPerson] = useState<string | null>(null)

  const loops = snapshot?.openLoops ?? []

  const people = useMemo(() => {
    const counts = new Map<string, number>()
    for (const loop of loops) {
      if (!loop.person) continue
      counts.set(loop.person, (counts.get(loop.person) ?? 0) + 1)
    }
    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 10)
  }, [loops])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return loops
      .filter((loop) => filter === 'all' || loop.direction === filter)
      .filter((loop) => !person || loop.person === person)
      .filter((loop) => {
        if (!needle) return true
        return `${loop.text} ${loop.person ?? ''} ${loop.sourceTitle}`
          .toLowerCase()
          .includes(needle)
      })
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
  }, [loops, filter, person, query])

  const mine = filtered.filter((loop) => loop.direction === 'mine')
  const waiting = filtered.filter((loop) => loop.direction === 'waiting')
  const mineTotal = loops.filter((loop) => loop.direction === 'mine').length
  const waitingTotal = loops.filter((loop) => loop.direction === 'waiting').length

  const ask = (question: string) => {
    navigate('/', { state: { focusAsk: true, question, at: Date.now() } })
  }

  const openSource = async (loop: OpenLoop) => {
    if (!loop.sourceId) return
    try {
      setNotice(null)
      await api.openOriginal(loop.sourceId)
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <div className="loopsPage">
      <header className="loopsHeader">
        <div>
          <p className="eyebrow">Commitments</p>
          <h1 className="pageTitle">Open loops</h1>
          <p className="loopsHeader__lede">
            Everything you promised and everything you are waiting on, pulled from
            recent mail, notes and meetings. Each row links back to its source.
          </p>
        </div>
        <div className="loopsHeader__actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => void resync()}
            disabled={loading}
          >
            {loading ? 'Reading…' : 'Refresh'}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => ask('What did I commit to last week?')}
          >
            Review commitments
          </button>
        </div>
      </header>

      {error ? (
        <section className="panel loopsEmptyPanel">
          <h2>Could not read your open loops</h2>
          <p>{error}</p>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void resync()}
          >
            Try again
          </button>
        </section>
      ) : loading && !snapshot ? (
        <section className="panel loopsEmptyPanel">
          <span className="loopsSpinner" aria-hidden="true" />
          <h2>Reading recent notes and mail…</h2>
          <p>Only the commitments you can still act on are kept.</p>
        </section>
      ) : (
        <>
          {notice ? (
            <div className="peopleNotice" role="status">
              <span>{notice}</span>
              <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">
                ×
              </button>
            </div>
          ) : null}

          <div className="loopsStats">
            <span>
              <strong>{loops.length}</strong> open
            </span>
            <span>
              <strong>{mineTotal}</strong> I owe
            </span>
            <span>
              <strong>{waitingTotal}</strong> waiting on
            </span>
            <span>
              <strong>{people.length}</strong> people
            </span>
            <span>
              Scanned <strong>{snapshot?.scannedSources ?? 0}</strong> sources
            </span>
          </div>

          <div className="loopsToolbar">
            <label className="loopsSearch">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M11 4.2a6.8 6.8 0 1 0 0 13.6 6.8 6.8 0 0 0 0-13.6ZM16 16l4 4" />
              </svg>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a commitment, person or source"
                aria-label="Find an open loop"
              />
            </label>
            <div className="loopsFilters" role="group" aria-label="Loop direction">
              {(
                [
                  ['all', 'All', loops.length],
                  ['mine', 'I owe', mineTotal],
                  ['waiting', 'Waiting on', waitingTotal],
                ] as const
              ).map(([key, label, count]) => (
                <button
                  key={key}
                  type="button"
                  className={`loopsFilter${filter === key ? ' is-on' : ''}`}
                  onClick={() => setFilter(key)}
                  aria-pressed={filter === key}
                >
                  {label}
                  <em>{count}</em>
                </button>
              ))}
            </div>
          </div>

          {people.length ? (
            <div className="loopsPeople" aria-label="Filter by person">
              <span className="loopsPeople__label">People</span>
              {person ? (
                <button
                  type="button"
                  className="loopPersonChip is-on"
                  onClick={() => setPerson(null)}
                  title="Clear person filter"
                >
                  {person} ×
                </button>
              ) : null}
              {people
                .filter(([name]) => name !== person)
                .map(([name, count]) => (
                  <button
                    key={name}
                    type="button"
                    className="loopPersonChip"
                    onClick={() => setPerson(name)}
                  >
                    {name}
                    <em>{count}</em>
                  </button>
                ))}
            </div>
          ) : null}

          {filtered.length ? (
            <div className="loopsGroups">
              {filter !== 'waiting' ? (
                <LoopGroup
                  label="I owe"
                  items={mine}
                  empty={
                    person
                      ? `Nothing open with ${person} that you owe.`
                      : 'Nothing you promised is still open in recent notes.'
                  }
                  onAsk={ask}
                  onOpen={openSource}
                  onPerson={setPerson}
                />
              ) : null}
              {filter !== 'mine' ? (
                <LoopGroup
                  label="Waiting on"
                  items={waiting}
                  empty={
                    person
                      ? `Nothing is blocking you on ${person}.`
                      : 'Nothing is blocking you right now.'
                  }
                  onAsk={ask}
                  onOpen={openSource}
                  onPerson={setPerson}
                />
              ) : null}
            </div>
          ) : (
            <section className="panel loopsEmptyPanel">
              <h2>No matching open loops</h2>
              <p>
                {query || person || filter !== 'all'
                  ? 'Clear the search or filters to see everything again.'
                  : 'Nothing is open in the current window. New commitments will appear as sources change.'}
              </p>
              {query || person || filter !== 'all' ? (
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => {
                    setQuery('')
                    setPerson(null)
                    setFilter('all')
                  }}
                >
                  Clear filters
                </button>
              ) : null}
            </section>
          )}
        </>
      )}
    </div>
  )
}
