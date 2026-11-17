import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/ipc'
import type { Answer } from '../types/source'
import PromptInput from './ui/PromptInput'

type Props = {
  open: boolean
  initialQuestion?: string
  onClose: () => void
}

function when(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString()
}

export default function DashboardAskDock({ open, initialQuestion = '', onClose }: Props) {
  const navigate = useNavigate()
  const [answer, setAnswer] = useState<Answer | null>(null)
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    const onPointerDown = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [open, onClose])

  const ask = useCallback(async (value: string) => {
    setQuestion(value)
    setBusy(true)
    setError(null)
    setAnswer(null)
    try {
      setAnswer(await api.ask(value))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }, [])

  if (!open) return null

  return (
    <div className="askDock" role="dialog" aria-label="Ask FrontDesk">
      <div className="askDock__panel" ref={panelRef}>
        <PromptInput
          initialValue={initialQuestion}
          placeholder="Ask about your notes, mail, calendar or OneNote…"
          onSubmit={(value) => void ask(value)}
          disabled={busy}
          className="promptInput--wide"
        />

        {busy ? <p className="askDock__status">Reading the allowed sources…</p> : null}
        {error ? <p className="askDock__error">{error}</p> : null}

        {answer ? (
          <div className={`askDock__answer askDock__answer--${answer.status}`} aria-live="polite">
            <div className="askDock__answerHead">
              <span>
                {answer.status === 'answered'
                  ? answer.basis === 'sources'
                    ? 'From your sources'
                    : answer.basis === 'mixed'
                      ? 'Your sources + general knowledge'
                      : 'General knowledge'
                  : answer.status === 'needs_clarification'
                    ? 'One clarification needed'
                    : answer.status === 'error'
                      ? 'Something went wrong'
                      : 'Not in your allowed sources'}
              </span>
              <span>{answer.model}</span>
            </div>
            <p className="askDock__answerText">{answer.text}</p>

            {answer.citations.length ? (
              <ul className="askDock__citations">
                {answer.citations.slice(0, 4).map((citation, index) => (
                  <li key={`${citation.id}-${index}`}>
                    <span className="tag">{citation.sourceType}</span>
                    <strong>{citation.title}</strong>
                    <span>
                      {citation.location} · {when(citation.timestamp)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="askDock__actions">
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  onClose()
                  navigate('/chat', { state: { question } })
                }}
              >
                Open full Ask
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
