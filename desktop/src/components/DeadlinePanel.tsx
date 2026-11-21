import { useEffect, useMemo, useState } from 'react'
import Counter from './Counter'
import DeadlineDialog from './DeadlineDialog'
import { useDeadlines } from '../state/deadlines'

const RollingCounter = Counter as any

function formatDue(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function remaining(dueAt: string, now: number) {
  const due = Date.parse(dueAt)
  const diff = due - now
  const overdue = diff < 0
  const totalMinutes = Math.floor(Math.abs(diff) / 60_000)
  return {
    overdue,
    days: Math.floor(totalMinutes / 1440),
    hours: Math.floor((totalMinutes % 1440) / 60),
    minutes: totalMinutes % 60,
  }
}

export default function DeadlinePanel() {
  const { deadlines, add, remove } = useDeadlines()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(timer)
  }, [])

  const sorted = useMemo(
    () => [...deadlines].sort((left, right) => Date.parse(left.dueAt) - Date.parse(right.dueAt)),
    [deadlines],
  )

  return (
    <section className="panel deadlinesPanel" aria-labelledby="deadlines">
      <header className="panel__head">
        <h2 id="deadlines" className="panel__title">
          Deadlines
        </h2>
        <span className="panel__meta">
          {sorted.length ? `${sorted.length} coming up` : 'Nothing scheduled'}
        </span>
        <button
          type="button"
          className="btn btn--ghost btn--sm deadlinesAdd"
          onClick={() => setDialogOpen(true)}
        >
          Add deadline
        </button>
      </header>

      {sorted.length ? (
        <div className="deadlineGrid">
          {sorted.map((deadline) => {
            const left = remaining(deadline.dueAt, now)
            return (
              <article
                key={deadline.id}
                className={`deadlineCard${left.overdue ? ' is-overdue' : ''}`}
              >
                <div className="deadlineCard__head">
                  <span className={`tag${left.overdue ? ' tag--bad' : ''}`}>
                    {left.overdue ? 'Overdue' : 'Upcoming'}
                  </span>
                  <button
                    type="button"
                    className="deadlineCard__remove"
                    onClick={() => remove(deadline.id)}
                    aria-label={`Remove ${deadline.title}`}
                    title="Remove deadline"
                  >
                    ×
                  </button>
                </div>
                <h3>{deadline.title}</h3>
                <p className="deadlineCard__due">{formatDue(deadline.dueAt)}</p>
                <div
                  className="deadlineCountdown"
                  aria-label={`${left.days} days, ${left.hours} hours and ${left.minutes} minutes ${
                    left.overdue ? 'overdue' : 'left'
                  }`}
                >
                  <span className="deadlineUnit">
                    <RollingCounter
                      className="deadlineCounter"
                      value={left.days}
                      fontSize={28}
                      fontWeight="400"
                      direction={left.overdue ? 'up' : 'down'}
                      intro={false}
                      duration={0.45}
                      bounce={0.12}
                      gap={1}
                    />
                    <span>days</span>
                  </span>
                  <span className="deadlineUnit">
                    <RollingCounter
                      className="deadlineCounter"
                      value={left.hours}
                      fontSize={28}
                      fontWeight="400"
                      direction={left.overdue ? 'up' : 'down'}
                      intro={false}
                      duration={0.45}
                      bounce={0.12}
                      gap={1}
                    />
                    <span>hrs</span>
                  </span>
                  <span className="deadlineUnit">
                    <RollingCounter
                      className="deadlineCounter"
                      value={left.minutes}
                      fontSize={28}
                      fontWeight="400"
                      direction={left.overdue ? 'up' : 'down'}
                      intro={false}
                      duration={0.45}
                      bounce={0.12}
                      gap={1}
                    />
                    <span>min</span>
                  </span>
                </div>
                {deadline.source ? <p className="deadlineCard__source">{deadline.source}</p> : null}
              </article>
            )
          })}
        </div>
      ) : (
        <p className="panel__note">
          Add a deadline to keep a live countdown on the dashboard. Deadlines are local to this
          machine.
        </p>
      )}

      <DeadlineDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={(input) => {
          add(input)
          setDialogOpen(false)
        }}
      />
    </section>
  )
}
