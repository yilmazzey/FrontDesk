import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation } from 'react-router-dom'
import AskStageRail, { useAskStages } from '../components/AskStageRail'
import SaveAnswerDialog from '../components/SaveAnswerDialog'
import { api } from '../lib/ipc'
import { useAccess } from '../state/access'
import type { Answer } from '../types/source'

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

const suggestions = [
  'Summarise what my files say about attention.',
  'How should I structure a literature summary?',
  'What is a good weekly review ritual?',
]

export default function Chat() {
  const location = useLocation()
  const { info } = useAccess()
  const initial = (location.state as { question?: string } | null)?.question ?? ''
  const [question, setQuestion] = useState(initial)
  const [answer, setAnswer] = useState<Answer | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveOpen, setSaveOpen] = useState(false)
  const { active, done, start, finish } = useAskStages()
  const autoAsked = useRef(false)
  const mode = info?.answerMode ?? 'chat'

  const ask = useCallback(async (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return
    start()
    setBusy(true)
    setError(null)
    setQuestion(trimmed)
    try {
      setAnswer(await api.ask(trimmed))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      finish()
      setBusy(false)
    }
  }, [finish, start])

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
          <p className="eyebrow">Assistant</p>
          <h1 className="pageTitle">
            Ask. It <em>answers.</em>
          </h1>
          <p className="pageLede">
            {mode === 'grounded'
              ? 'Strict mode is on: every claim is cited to your allowed sources, or the answer is refused.'
              : 'One assistant for your sources and everything else. It cites your files and connected Microsoft data when it uses them, and labels general knowledge.'}
          </p>
        </div>
      </header>

      <form className="chatForm" onSubmit={onSubmit}>
        <label className="srOnly" htmlFor="chatQuestion">
          Ask a question
        </label>
        <input
          id="chatQuestion"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask about your files, mail, calendar or notes…"
          autoFocus
        />
        <button type="submit" className="btn btn--primary" disabled={busy || !question.trim()}>
          {busy ? 'Thinking…' : 'Ask'}
        </button>
      </form>

      <div className="chatSuggestions" aria-label="Example questions">
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
      {busy ? (
        <div className="askProgress">
          <AskStageRail active={active} done={done} />
          <p className="notice">Reading the allowed sources and thinking on this machine…</p>
        </div>
      ) : null}

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
    </div>
  )
}
