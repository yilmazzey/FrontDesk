import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import SaveAnswerDialog from './SaveAnswerDialog'
import DeadlineDialog from './DeadlineDialog'
import { useDeadlines } from '../state/deadlines'
import { suggestDeadlineDueAt, suggestDeadlineTitle } from '../lib/deadlineText'
import SlingButton from './SlingButton'
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

function statusLabel(answer: Answer): string {
  if (answer.status === 'needs_clarification') return 'Needs one clarification'
  if (answer.status === 'error') return 'Something went wrong'
  if (answer.status === 'needs_setup') return 'Needs a local model'
  return 'Not in your allowed sources'
}

type AnswerViewProps = {
  turn: Turn
  onAsk: (question: string) => void
  onOpen: (citation: Citation) => void
  onSave: (turn: Turn) => void
  onDeadline: (turn: Turn) => void
}

function AnswerView({ turn, onAsk, onOpen, onSave, onDeadline }: AnswerViewProps) {
  const answer = turn.answer
  if (!answer) return null

  return (
    <section className={`answer answer--${answer.status}`} aria-live="polite">
      <div className="answer__head">
        {answer.status === 'answered' ? (
          <span className={`basis basis--${answer.basis}`}>{basisLabel(answer)}</span>
        ) : (
          <span className={`answer__status answer__status--${answer.status}`}>
            {statusLabel(answer)}
          </span>
        )}
        {answer.basis === 'clock' ? null : (
          <span className="answer__model">{answer.model}</span>
        )}
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
        {answer.status === 'answered' ? (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => onDeadline(turn)}
          >
            Set deadline
          </button>
        ) : null}
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
  const { add: addDeadline } = useDeadlines()
  const [deadlineTurn, setDeadlineTurn] = useState<Turn | null>(null)
  const [question, setQuestion] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [preview, setPreview] = useState<Citation | null>(null)
  const [saveTurn, setSaveTurn] = useState<Turn | null>(null)
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  const messagesRef = useRef<HTMLDivElement | null>(null)
  const turnsRef = useRef<Turn[]>([])
  const busy = turns.some((turn) => turn.busy)

  useEffect(() => {
    turnsRef.current = turns
  }, [turns])

  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => composerRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [open])

  useEffect(() => {
    if (!open) return
    const node = messagesRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [open, turns])

  useEffect(() => {
    if (!open) return
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (deadlineTurn) {
        setDeadlineTurn(null)
        return
      }
      if (saveTurn) {
        setSaveTurn(null)
        return
      }
      if (preview) {
        setPreview(null)
        return
      }
      setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [deadlineTurn, open, preview, saveTurn])

  useEffect(() => {
    if (!focusSignal) return
    setOpen(true)
    inputRef.current?.blur()
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
      setOpen(true)
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

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void ask(question)
    }
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

  function clearConversation() {
    setTurns([])
    turnsRef.current = []
    setPreview(null)
    setNotice(null)
    setSaveTurn(null)
    requestAnimationFrame(() => composerRef.current?.focus())
  }

  const modelLabel = info?.selectedModel
    ? models.find((model) => model.id === info.selectedModel)?.name ?? info.selectedModel
    : 'Extractive'
  const lastTurn = turns[turns.length - 1]

  return (
    <>
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
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            placeholder={
              turns.length
                ? 'Continue the conversation…'
                : 'Ask about your meetings, people or commitments…'
            }
            autoComplete="off"
          />
          <SlingButton
            className="askBar__sling"
            onSend={() => void ask(question)}
            disabled={busy}
            padColor="#ffb45c"
            iconColor="#241d16"
            accentColor="#ffb45c"
            wellColor="var(--surface-strong)"
            bandColor="var(--line-strong)"
            size={54}
            strokeWidth={3}
            armAt={44}
            maxPull={140}
            ariaLabel={busy ? 'Asking…' : 'Ask'}
          />
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
        ) : (
          <div className="askBar__resume">
            <span className="tag">
              {turns.length} {turns.length === 1 ? 'message' : 'messages'}
            </span>
            <span className="askBar__resumeText">{lastTurn?.question}</span>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(true)}>
              Open chat →
            </button>
          </div>
        )}
      </section>

      {open
        ? createPortal(
            <div
              className="chatOverlay"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setOpen(false)
              }}
            >
              <section
                className="chatScreen"
                role="dialog"
                aria-modal="true"
                aria-label="FrontDesk chat"
              >
                <header className="chatScreen__head">
                  <div className="chatScreen__identity">
                    <span className="chatScreen__dot" aria-hidden="true" />
                    <div>
                      <strong>FrontDesk</strong>
                      <span>Ask</span>
                    </div>
                  </div>
                  <div className="chatScreen__controls">
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
                      <button type="button" className="chatGhost" onClick={clearConversation}>
                        Clear
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="chatClose"
                      aria-label="Close chat"
                      onClick={() => setOpen(false)}
                    >
                      ×
                    </button>
                  </div>
                </header>

                <div className="chatScreen__messages" ref={messagesRef}>
                  {turns.length === 0 ? (
                    <div className="chatWelcome">
                      <p className="sectionLabel">Ask FrontDesk</p>
                      <h2>What do you need to know?</h2>
                      <p>
                        Use your files, the local clock, optional web search and the local model.
                        Every claim keeps its source.
                      </p>
                      <div className="chatWelcome__suggestions">
                        {suggestions.map((suggestion) => (
                          <button
                            key={suggestion}
                            type="button"
                            className="chatSuggestion"
                            onClick={() => void ask(suggestion)}
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    turns.map((turn) => (
                      <article className="chatExchange" key={turn.id}>
                        <div className="chatMessage chatMessage--user">
                          <span className="chatMessage__role">You</span>
                          <p className="chatBubble">{turn.question}</p>
                        </div>
                        <div className="chatMessage chatMessage--assistant">
                          <span className="chatAvatar" aria-hidden="true">
                            FD
                          </span>
                          <div className="chatAssistant">
                            <span className="chatMessage__role">FrontDesk</span>
                            {turn.busy ? (
                              <p className="chatThinking">Thinking locally…</p>
                            ) : null}
                            {turn.error ? <p className="chatError">{turn.error}</p> : null}
                            <AnswerView
                              turn={turn}
                              onAsk={(value) => void ask(value)}
                              onOpen={(citation) => void openCitation(citation)}
                              onSave={(selected) => setSaveTurn(selected)}
                              onDeadline={(selected) => setDeadlineTurn(selected)}
                            />
                          </div>
                        </div>
                      </article>
                    ))
                  )}
                </div>

                {preview ? (
                  <section className="sourcePreview chatPreview" aria-label="Source preview">
                    <header className="sourcePreview__head">
                      <div>
                        <p className="sectionLabel">Source preview</p>
                        <h3>{preview.title}</h3>
                      </div>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => setPreview(null)}
                      >
                        Close
                      </button>
                    </header>
                    <p className="sourcePreview__meta">
                      {preview.location} · as of {when(preview.timestamp)}
                    </p>
                    <blockquote>{preview.excerpt}</blockquote>
                  </section>
                ) : null}

                {notice ? <p className="notice notice--bad chatNotice">{notice}</p> : null}

                <div className="chatScreen__composer">
                  <form className="chatComposer" onSubmit={onSubmit}>
                    <textarea
                      ref={composerRef}
                      rows={1}
                      value={question}
                      onChange={(event) => setQuestion(event.target.value)}
                      onKeyDown={onComposerKeyDown}
                      placeholder="Message FrontDesk…"
                      aria-label="Message FrontDesk"
                    />
                    <SlingButton
                      className="chatComposer__sling"
                      onSend={() => void ask(question)}
                      disabled={busy}
                      padColor="#ffb45c"
                      iconColor="#241d16"
                      accentColor="#ffb45c"
                      wellColor="var(--panel-2)"
                      bandColor="var(--line-strong)"
                      size={38}
                      strokeWidth={2.5}
                      armAt={32}
                      maxPull={110}
                      flight={95}
                      particles={10}
                      ariaLabel={busy ? 'Sending…' : 'Send message'}
                    />
                  </form>
                  <p className="chatHint">
                    Enter to send · Shift+Enter for a new line · Esc to close
                  </p>
                </div>
              </section>

              {saveTurn?.answer ? (
                <SaveAnswerDialog
                  open={Boolean(saveTurn)}
                  title={saveTurn.question}
                  body={saveTurn.answer.text}
                  sources={saveTurn.answer.citations.map((citation) => citation.title)}
                  onClose={() => setSaveTurn(null)}
                />
              ) : null}

              {deadlineTurn?.answer ? (
                <DeadlineDialog
                  open={Boolean(deadlineTurn)}
                  initialTitle={suggestDeadlineTitle(deadlineTurn.answer.text)}
                  initialDueAt={suggestDeadlineDueAt(deadlineTurn.answer.text)}
                  source={deadlineTurn.question}
                  onClose={() => setDeadlineTurn(null)}
                  onSave={(input) => {
                    addDeadline(input)
                    setDeadlineTurn(null)
                  }}
                />
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
