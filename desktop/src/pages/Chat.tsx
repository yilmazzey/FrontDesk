import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { api } from '../lib/ipc'
import { useAccess } from '../state/access'
import type { Answer } from '../types/source'

function when(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function basisLabel(answer: Answer): string {
  if (answer.basis === 'model') return 'General knowledge · not from your files'
  if (answer.basis === 'mixed') return 'Your files + general knowledge'
  if (answer.basis === 'sources') return 'From your sources'
  return ''
}

export default function Chat() {
  const location = useLocation()
  const { info, selectMode } = useAccess()
  const initial = (location.state as { question?: string } | null)?.question ?? ''
  const [question, setQuestion] = useState(initial)
  const [answer, setAnswer] = useState<Answer | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const autoAsked = useRef(false)
  const mode = info?.answerMode ?? 'chat'

  const ask = useCallback(async (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return
    setBusy(true)
    setError(null)
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
    if (initial && !autoAsked.current) {
      autoAsked.current = true
      void ask(initial)
    }
  }, [ask, initial])

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
    <div className="page">
      <header className="pageHead">
        <div>
          <p className="eyebrow">Ask the desk</p>
          <h1 className="pageTitle">
            Answers with <em>receipts.</em>
          </h1>
          <p className="pageLede">
            {mode === 'chat'
              ? 'Chat with your local model. It can use its own general knowledge, and cites your files whenever it uses them.'
              : 'Answers only from the sources you allowed. Every claim is cited, and missing evidence is refused.'}
          </p>
        </div>
      </header>

      <div className="modeRow" role="group" aria-label="Answer mode">
        <button
          type="button"
          className={`modeChip${mode === 'chat' ? ' is-on' : ''}`}
          onClick={() => void selectMode('chat')}
        >
          Chat
        </button>
        <button
          type="button"
          className={`modeChip${mode === 'grounded' ? ' is-on' : ''}`}
          onClick={() => void selectMode('grounded')}
        >
          Sources only
        </button>
        <span className="modeHint">
          {mode === 'chat'
            ? 'General advice is labeled when it does not come from your files.'
            : 'No citation, no answer.'}
        </span>
      </div>

      <form className="chatForm" onSubmit={onSubmit}>
        <label className="srOnly" htmlFor="chatQuestion">
          Ask a question
        </label>
        <input
          id="chatQuestion"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={
            mode === 'chat'
              ? 'What does my article say about attention? Or: how should I structure a summary?'
              : 'What did I write about the retention window?'
          }
          autoFocus
        />
        <button type="submit" className="btn btn--primary" disabled={busy || !question.trim()}>
          {busy ? 'Reading…' : 'Ask'}
        </button>
      </form>

      {error ? <p className="notice notice--bad">{error}</p> : null}
      {busy ? <p className="notice">Reading the allowed sources on this machine…</p> : null}

      {answer ? (
        <section className={`answer answer--${answer.status}`} aria-live="polite">
          <div className="answer__head">
            <span className={`answer__status answer__status--${answer.status}`}>
              {answer.status === 'answered'
                ? 'Answered'
                : answer.status === 'needs_clarification'
                  ? 'Needs one clarification'
                  : answer.status === 'error'
                    ? 'Something went wrong'
                    : 'Not in your sources'}
            </span>
            <span className="answer__model">
              {basisLabel(answer) ? `${basisLabel(answer)} · ` : ''}
              {answer.model}
            </span>
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
            <div className="citations">
              <p className="citations__label">Sources</p>
              {answer.citations.map((citation, index) => (
                <article key={`${citation.id}-${index}`} className="citation">
                  <header className="citation__head">
                    <span className="citation__n">[{index + 1}]</span>
                    <strong>{citation.title}</strong>
                    <span className="tag">{citation.sourceType}</span>
                  </header>
                  <p className="citation__meta">
                    {citation.location} · as of {when(citation.timestamp)}
                  </p>
                  <blockquote className="citation__excerpt">{citation.excerpt}</blockquote>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => void openOriginal(citation.sourceId)}
                  >
                    Open original ↗
                  </button>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
