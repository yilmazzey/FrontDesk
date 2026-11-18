import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import SaveAnswerDialog from './SaveAnswerDialog'
import { when } from '../lib/format'
import { api } from '../lib/ipc'
import { useAccess } from '../state/access'
import type { Answer, ChatTurn, Citation } from '../types/source'

const defaultSuggestions = [
  'Prep me for my next 1:1',
  'What did I commit to last week?',
  'Who haven’t I spoken to in a month?',
]

type Turn = {
  id: string
  question: string
  answer: Answer | null
  error: string | null
  busy: boolean
}

function basisLabel(answer: Answer): string {
  if (answer.basis === 'model') return 'General knowledge'
  if (answer.basis === 'mixed') return 'Your files + general knowledge'
  if (answer.basis === 'sources') return 'From your files'
  if (answer.basis === 'web') return 'From the web'
  if (answer.basis === 'files_web') return 'Your files + web'
  if (answer.basis === 'web_mixed') return 'Web + general knowledge'
  if (answer.basis === 'clock') return 'Local clock'
  return ''
}

function typeLabel(value: string): string {
  if (value === 'calendar') return 'Meeting'
  if (value === 'file') return 'Note'
  if (value === 'ocr') return 'Scan'
  if (value === 'mail') return 'Mail'
  if (value === 'onenote') return 'OneNote'
  if (value === 'web') return 'Web'
  return value
}

type AnswerViewProps = {
  turn: Turn
  onAsk: (question: string) => void
  onOpen: (citation: Citation) => void
  onSave: (turn: Turn) => void
}

function AnswerView({ turn, onAsk, onOpen, onSave }: AnswerViewProps) {
  const answer = turn.answer
  if (!answer) return null

  return (
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
                : answer.status === 'needs_setup'
                  ? 'Needs a local model'
                  : 'Not in your allowed sources'}
          </span>
        )}
        <span className="answer__model">{answer.model}</span>
      </div>

      <p className="answer__text">
        {answer.text.split(/(\[\d+\])/g).map((part, index) => {
          const match = /^\[(\d+)\]$/.exec(part)
          if (!match) return part
          const citation = answer.citations[Number(match[1]) - 1]
          if (!citation) return part
          return (
            <button
              key={`${part}-${index}`}
              type="button"
              className="citationMark"
              onClick={() => onOpen(citation)}
            >
              {part}
            </button>
          )
        })}
      </p>

      {answer.clarification ? (
        <div className="clarify">
          <p>{answer.clarification.question}</p>
          <div className="clarify__options">
            {answer.clarification.options.map((option) => (
              <button
                key={option}
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => onAsk(option)}
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
                    <span className="tag">{typeLabel(citation.sourceType)}</span>
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
                  onClick={() => onOpen(citation)}
                >
                  Open ↗
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="modelActions">
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => onSave(turn)}>
          Save answer
        </button>
      </div>
    </section>
  )
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
  const { info, models, selectMode } = useAccess()
  const [question, setQuestion] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [preview, setPreview] = useState<Citation | null>(null)
  const [saveTurn, setSaveTurn] = useState<Turn | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const turnsRef = useRef<Turn[]>([])
  const busy = turns.some((turn) => turn.busy)

  useEffect(() => {
    turnsRef.current = turns
  }, [turns])

  useEffect(() => {
    if (!focusSignal) return
    inputRef.current?.focus()
    inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focusSignal])

  const updateTurn = useCallback((id: string, patch: Partial<Turn>) => {
    setTurns((current) => {
      const next = current.map((turn) => (turn.id === id ? { ...turn, ...patch } : turn))
      turnsRef.current = next
      return next
    })
  }, [])

  const ask = useCallback(
    async (value: string) => {
      const trimmed = value.trim()
      if (!trimmed) return
      const history: ChatTurn[] = turnsRef.current
        .flatMap((turn) =>
          turn.answer
            ? [
                { role: 'user' as const, content: turn.question },
                {
                  role: 'assistant' as const,
                  content: turn.answer.text.replace(/\[\d+\]/g, ''),
                },
              ]
            : [],
        )
        .slice(-6)
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const next = [
        ...turnsRef.current,
        { id, question: trimmed, answer: null, error: null, busy: true },
      ]
      turnsRef.current = next
      setTurns(next)
      setQuestion('')
      setNotice(null)
      setPreview(null)
      try {
        const answer = await api.ask(trimmed, history)
        updateTurn(id, { answer, busy: false })
      } catch (cause) {
        updateTurn(id, {
          error: cause instanceof Error ? cause.message : String(cause),
          busy: false,
        })
      }
    },
    [updateTurn],
  )

  useEffect(() => {
    if (!prompt) return
    void ask(prompt.value)
  }, [ask, prompt])

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    void ask(question)
  }

  async function openCitation(citation: Citation) {
    setNotice(null)
    if (citation.sourceId.startsWith('fixture:')) {
      setPreview(citation)
      return
    }
    if (citation.deepLink) {
      try {
        if (citation.sourceType === 'web') await api.openExternal(citation.deepLink)
        else await api.openUrl(citation.deepLink)
        return
      } catch {
        // Fall back to the source lookup if the deep link is rejected.
      }
    }
    try {
      await api.openOriginal(citation.sourceId)
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const modelLabel = info?.selectedModel
    ? models.find((model) => model.id === info.selectedModel)?.name ?? info.selectedModel
    : 'Extractive'

  return (
    <section className="askBar" aria-label="Ask FrontDesk">
      <div className="askBar__meta" aria-label="Answer settings">
        <span className="tag">{modelLabel}</span>
        <button
          type="button"
          className={`modeChip${info?.answerMode !== 'grounded' ? ' is-on' : ''}`}
          onClick={() => void selectMode('chat')}
        >
          Assistant
        </button>
        <button
          type="button"
          className={`modeChip${info?.answerMode === 'grounded' ? ' is-on' : ''}`}
          onClick={() => void selectMode('grounded')}
        >
          Strict citations
        </button>
        {turns.length ? (
          <button
            type="button"
            className="askBar__clear"
            onClick={() => {
              setTurns([])
              turnsRef.current = []
              setPreview(null)
              setNotice(null)
              setSaveTurn(null)
            }}
          >
            Clear
          </button>
        ) : null}
      </div>

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

      {turns.length === 0 ? (
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
      ) : null}

      {notice ? <p className="notice notice--bad">{notice}</p> : null}

      {turns.length ? (
        <div className="askThread">
          {turns.map((turn) => (
            <article className="askTurn" key={turn.id}>
              <p className="askTurn__question">{turn.question}</p>
              {turn.busy ? (
                <p className="notice">Reading the allowed sources and thinking on this machine…</p>
              ) : null}
              {turn.error ? <p className="notice notice--bad">{turn.error}</p> : null}
              <AnswerView
                turn={turn}
                onAsk={(value) => void ask(value)}
                onOpen={(citation) => void openCitation(citation)}
                onSave={(selected) => setSaveTurn(selected)}
              />
            </article>
          ))}
        </div>
      ) : null}

      {preview ? (
        <section className="sourcePreview" aria-label="Source preview">
          <header className="sourcePreview__head">
            <div>
              <p className="sectionLabel">Source preview</p>
              <h3>{preview.title}</h3>
            </div>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPreview(null)}>
              Close
            </button>
          </header>
          <p className="sourcePreview__meta">
            {preview.location} · as of {when(preview.timestamp)}
          </p>
          <blockquote>{preview.excerpt}</blockquote>
        </section>
      ) : null}

      {saveTurn?.answer ? (
        <SaveAnswerDialog
          open={Boolean(saveTurn)}
          title={saveTurn.question}
          body={saveTurn.answer.text}
          sources={saveTurn.answer.citations.map((citation) => citation.title)}
          onClose={() => setSaveTurn(null)}
        />
      ) : null}
    </section>
  )
}
