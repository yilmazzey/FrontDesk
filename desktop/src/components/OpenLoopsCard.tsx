import { Link } from 'react-router-dom'
import type { ManagerSnapshot, OpenLoop } from '../types/source'
import { loopKey, useDismissedLoops } from '../state/dismissedLoops'

type Props = {
  snapshot: ManagerSnapshot | null
  loading: boolean
  onAsk: (question: string) => void
}

function sourceDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

function Group({
  label,
  items,
  empty,
}: {
  label: string
  items: OpenLoop[]
  empty: string
}) {
  return (
    <div className="loopGroup">
      <p className="sectionLabel">
        {label} <span>{items.length}</span>
      </p>
      {items.length ? (
        <ul className="loopList">
          {items.map((loop) => (
            <li className="loopRow" key={loop.id}>
              <span className={`loopRow__mark loopRow__mark--${loop.direction}`} />
              <span className="loopRow__body">
                <span className="loopRow__text">{loop.text}</span>
                <span className="loopRow__meta">
                  {loop.person ? `${loop.person} · ` : ''}
                  {loop.sourceTitle} · {sourceDate(loop.timestamp)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="panel__note">{empty}</p>
      )}
    </div>
  )
}

export default function OpenLoopsCard({ snapshot, loading, onAsk }: Props) {
  const { dismissed, count: hiddenCount } = useDismissedLoops()
  const loops = (snapshot?.openLoops ?? []).filter((loop) => !dismissed.has(loopKey(loop)))
  const mine = loops.filter((loop) => loop.direction === 'mine')
  const waiting = loops.filter((loop) => loop.direction === 'waiting')

  return (
    <section className="panel openLoops" aria-labelledby="open-loops">
      <header className="panel__head">
        <h2 id="open-loops" className="panel__title">
          Open loops
        </h2>
        <span className="panel__meta">
          {loading ? 'Reading recent notes…' : `${loops.length} found`}
        </span>
        <Link
          to="/loops"
          className="panel__arrow"
          aria-label="Open the full open loops page"
          title="Open all open loops"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
      </header>

      {loading && !snapshot ? (
        <p className="panel__note">Reading recent notes for commitments and blockers…</p>
      ) : (
        <>
          <Group
            label="I owe"
            items={mine}
            empty="Nothing you promised is still open in recent notes."
          />
          <Group
            label="Waiting on"
            items={waiting}
            empty="Nothing is blocking you right now."
          />
        </>
      )}

      <div className="openLoops__foot">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => onAsk('What did I commit to last week?')}
        >
          Review commitments
        </button>
        {hiddenCount > 0 ? (
          <p className="panel__note openLoops__hidden">
            {hiddenCount} hidden. <Link to="/loops">Restore on Open loops</Link>
          </p>
        ) : null}
      </div>
    </section>
  )
}
