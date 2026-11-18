import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import SaveAnswerDialog from './SaveAnswerDialog'
import { api } from '../lib/ipc'
import type { Answer } from '../types/source'

const defaultSuggestions = [
  'Prep me for my next 1:1',
  'What did I commit to last week?',
  'Who haven’t I spoken to in a month?',
]

function when(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function basisLabel(answer: Answer): string {
  if (answer.basis === 'model') return 'General knowledge'
  if (answer.basis === 'mixed') return 'Your files + general knowledge'
  if (answer.basis === 'sources') return 'From your files'
  return ''
}

type Props = {
  focusSignal?: number
  prompt?: { value: string; id: number }
  suggestions?: string[]
}

export default function AskBar({
  focusSignal = 0,
  prompt,
  suggestions = defaultSuggestions,
}: Props) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<Answer | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveOpen, setSaveOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!focusSignal) return
    inputRef.current?.focus()
    inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focusSignal])

  const ask = useCallback(async (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return
    setBusy(true)
    setError(null)
    setAnswer(null)
    setQuestion(trimmed)
    try {
      setAnswer(await api.ask(trimmed))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    if (!prompt) return
    setQuestion(prompt.value)
    void ask(prompt.value)
  }, [ask, prompt])

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    void ask(question)
  }

  async function openOriginal(sourceId: string) {
    try {
      await api.openOriginal(sourceId)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <section className="askBar" aria-label="Ask FrontDesk">
      <form className="askBar__form" onSubmit={onSubmit}>
        <label className="srOnly" htmlFor="deskAsk">
          Ask about your sources
        </label>
        <input
          ref={inputRef}
          id="deskAsk"
          className="askBar__input"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask about your meetings, people or commitments…"
          autoComplete="off"
        />
        <button
          type="submit"
          className="askBar__submit"
          disabled={busy || !question.trim()}
          aria-label="Ask"
        >
          {busy ? '…' : 'ASK'}
        </button>
      </form>

      <div className="askBar__suggestions" aria-label="Example questions">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className="chatSuggestion"
            onClick={() => void ask(suggestion)}
            disabled={busy}
          >
            {suggestion}
          </button>
        ))}
      </div>

      {error ? <p className="notice notice--bad">{error}</p> : null}
      {busy ? <p className="notice">Reading the allowed sources and thinking on this machine…</p> : null}

      {answer ? (
        <section className={`answer answer--${answer.status}`} aria-live="polite">
          <div className="answer__head">
            {answer.status === 'answered' ? (
              <span className={`basis basis--${answer.basis}`}>{basisLabel(answer)}</span>
            ) : (
              <span className={`answer__status answer__status--${answer.status}`}>
                {answer.status === 'needs_clarification'
                  ? 'Needs one clarification'
                  : answer.status === 'error'
                    ? 'Something went wrong'
                    : 'Not in your allowed sources'}
              </span>
            )}
            <span className="answer__model">{answer.model}</span>
          </div>

          <p className="answer__text">{answer.text}</p>

          {answer.clarification ? (
            <div className="clarify">
              <p>{answer.clarification.question}</p>
              <div className="clarify__options">
                {answer.clarification.options.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => void ask(`${question} — ${option}`)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {answer.citations.length ? (
            <div className="sourceList">
              <p className="sourceList__label">Sources</p>
              <ul>
                {answer.citations.map((citation, index) => (
                  <li key={`${citation.id}-${index}`} className="sourceItem">
                    <span className="sourceItem__n">[{index + 1}]</span>
                    <div className="sourceItem__body">
                      <div className="sourceItem__head">
                        <strong>{citation.title}</strong>
                        <span className="tag">{citation.sourceType}</span>
                      </div>
                      <p className="sourceItem__meta">
                        {citation.location} · as of {when(citation.timestamp)}
                      </p>
                      <details className="sourceItem__more">
                        <summary>Excerpt</summary>
                        <blockquote>{citation.excerpt}</blockquote>
                      </details>
                    </div>
                    <button
                      type="button"
                      className="sourceItem__open"
                      onClick={() => void openOriginal(citation.sourceId)}
                    >
                      Open ↗
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="modelActions">
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSaveOpen(true)}>
              Save answer
            </button>
          </div>
        </section>
      ) : null}

      {answer ? (
        <SaveAnswerDialog
          open={saveOpen}
          title={question}
          body={answer.text}
          sources={answer.citations.map((citation) => citation.title)}
          onClose={() => setSaveOpen(false)}
        />
      ) : null}
    </section>
  )
}
