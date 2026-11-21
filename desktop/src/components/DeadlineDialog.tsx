import { useEffect, useState } from 'react'
import { defaultDueAt } from '../lib/deadlineText'

type Props = {
  open: boolean
  initialTitle?: string
  initialDueAt?: string
  source?: string
  onClose: () => void
  onSave: (input: { title: string; dueAt: string; source?: string }) => void
}

function localParts(iso: string) {
  const date = new Date(iso)
  const safe = Number.isNaN(date.getTime()) ? new Date(defaultDueAt()) : date
  const pad = (value: number) => String(value).padStart(2, '0')
  return {
    date: `${safe.getFullYear()}-${pad(safe.getMonth() + 1)}-${pad(safe.getDate())}`,
    time: `${pad(safe.getHours())}:${pad(safe.getMinutes())}`,
  }
}

export default function DeadlineDialog({
  open,
  initialTitle = '',
  initialDueAt,
  source,
  onClose,
  onSave,
}: Props) {
  const [title, setTitle] = useState(initialTitle)
  const [date, setDate] = useState(() => localParts(initialDueAt ?? defaultDueAt()).date)
  const [time, setTime] = useState(() => localParts(initialDueAt ?? defaultDueAt()).time)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const due = localParts(initialDueAt ?? defaultDueAt())
    setTitle(initialTitle)
    setDate(due.date)
    setTime(due.time)
    setError(null)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [initialDueAt, initialTitle, onClose, open])

  if (!open) return null

  function save() {
    const due = new Date(`${date}T${time}:00`)
    if (Number.isNaN(due.getTime())) {
      setError('Choose a valid date and time.')
      return
    }
    onSave({
      title: title.trim() || 'Untitled deadline',
      dueAt: due.toISOString(),
      source,
    })
  }

  return (
    <div
      className="saveDialog"
      role="dialog"
      aria-modal="true"
      aria-label="Set a deadline"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="saveDialog__panel deadlineDialog" onMouseDown={(event) => event.stopPropagation()}>
        <header className="saveDialog__head">
          <div>
            <p className="eyebrow">Deadline</p>
            <h2>Give the next step a date.</h2>
          </div>
          <button type="button" className="saveDialog__close" onClick={onClose}>
            Esc
          </button>
        </header>

        <label className="fieldLabel" htmlFor="deadlineTitle">
          What needs to happen
        </label>
        <input
          id="deadlineTitle"
          className="deadlineInput"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Follow up with Marcus about the vendor shortlist"
          autoFocus
        />

        <div className="deadlineFields">
          <label>
            <span className="fieldLabel">Due date</span>
            <input
              type="date"
              className="deadlineInput"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <label>
            <span className="fieldLabel">Time</span>
            <input
              type="time"
              className="deadlineInput"
              value={time}
              onChange={(event) => setTime(event.target.value)}
            />
          </label>
        </div>

        {source ? (
          <p className="panel__note deadlineSource">
            From the answer: “{source.replace(/\s+/g, ' ').slice(0, 180)}
            {source.length > 180 ? '…' : ''}”
          </p>
        ) : null}

        {error ? <p className="notice notice--bad">{error}</p> : null}

        <div className="saveDialog__actions">
          <button type="button" className="btn btn--primary btn--sm" onClick={save}>
            Set deadline
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
