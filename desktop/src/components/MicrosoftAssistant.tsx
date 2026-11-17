import { useState } from 'react'
import {
  answerWithLocalModel,
  isDesktopApp,
  loadMicrosoftSources,
  type AnswerSource,
} from '../services/microsoft'
import { searchMicrosoftSources, type MicrosoftSearchHit } from '../services/microsoftSearch'

const model = import.meta.env.VITE_OLLAMA_MODEL?.trim() || 'qwen2.5:3b'

function messageOf(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason)
}

function sourceKindLabel(kind: MicrosoftSearchHit['source']['kind']) {
  if (kind === 'email') return 'Email'
  if (kind === 'calendar') return 'Calendar'
  return 'OneNote'
}

export function MicrosoftAssistant() {
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [sourceCount, setSourceCount] = useState(0)
  const [hits, setHits] = useState<MicrosoftSearchHit[]>([])
  const [answer, setAnswer] = useState('')
  const [searchError, setSearchError] = useState('')
  const [answerError, setAnswerError] = useState('')
  const desktopApp = isDesktopApp()

  const ask = async (refresh = false) => {
    const trimmedQuestion = question.trim()
    if (!trimmedQuestion) return

    setBusy(true)
    setSearchError('')
    setAnswerError('')
    setAnswer('')
    try {
      const sources = await loadMicrosoftSources(refresh)
      if (!sources) {
        setSearchError('Connect your Microsoft account in Settings before asking a question.')
        setHasSearched(false)
        return
      }

      const results = searchMicrosoftSources(trimmedQuestion, sources)
      setHits(results)
      setSourceCount(sources.length)
      setHasSearched(true)
      if (!results.length) return

      const answerSources: AnswerSource[] = results.slice(0, 8).map((hit) => ({
        citation: hit.citation,
        kind: hit.source.kind,
        title: hit.source.title,
        date: hit.source.date,
        excerpt: hit.excerpt,
      }))
      try {
        const response = await answerWithLocalModel(trimmedQuestion, answerSources, model)
        setAnswer(response)
      } catch (reason) {
        setAnswerError(messageOf(reason))
      }
    } catch (reason) {
      setSearchError(messageOf(reason))
      setHasSearched(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="ask" aria-label="Ask Microsoft data">
      <label className="ask__label" htmlFor="microsoft-question">
        Ask Microsoft data
      </label>
      <div className="ask__row">
        <input
          id="microsoft-question"
          className="ask__input"
          placeholder="What did we decide about the pricing change?"
          value={question}
          onChange={(event) => {
            setQuestion(event.target.value)
            setHasSearched(false)
            setHits([])
            setAnswer('')
            setSearchError('')
            setAnswerError('')
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void ask()
          }}
        />
        <button
          type="button"
          className="btn btn--ghost"
          disabled={!desktopApp || !question.trim() || busy}
          onClick={() => void ask()}
        >
          {busy ? 'Searching…' : 'Ask'}
        </button>
      </div>
      <p className="ask__hint">
        Searches connected Microsoft email, calendar and OneNote data. Relevant excerpts go to
        the local {model} model; no local files or cloud AI are used.
      </p>
      {!desktopApp ? (
        <p className="panel__note">Open FrontDesk in the Tauri desktop app to use Microsoft data.</p>
      ) : null}
      {searchError ? <p className="connectionError" role="alert">{searchError}</p> : null}
      {hasSearched ? (
        <div className="assistantResponse" aria-live="polite">
          <div className="noteSearch__summary">
            <span>
              Searched {sourceCount} Microsoft source{sourceCount === 1 ? '' : 's'} · {hits.length}{' '}
              match{hits.length === 1 ? '' : 'es'}
            </span>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={busy}
              onClick={() => void ask(true)}
            >
              Refresh data
            </button>
          </div>
          {answer ? <p className="assistantResponse__answer">{answer}</p> : null}
          {answerError ? <p className="connectionError" role="alert">{answerError}</p> : null}
          {!hits.length ? (
            <p className="panel__note">No matching Microsoft sources were found for that query.</p>
          ) : null}
          {hits.length ? (
            <ol className="noteSearchResults">
              {hits.slice(0, 8).map((hit) => (
                <li className="noteSearchResult" key={hit.source.id}>
                  <strong>
                    [{hit.citation}] {hit.source.title}
                  </strong>
                  <span className="noteSearchResult__meta">
                    {sourceKindLabel(hit.source.kind)}
                    {hit.source.detail ? ` · ${hit.source.detail}` : ''}
                    {hit.source.date ? ` · ${hit.source.date}` : ''}
                  </span>
                  <p>{hit.excerpt}</p>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
