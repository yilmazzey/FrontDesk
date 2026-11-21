import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { api, inTauri } from '../lib/ipc'
import { useSaved } from '../state/saved'
import type {
  MeetingProgress,
  MeetingRecord,
  MeetingStatus,
  MeetingSummary,
  RuntimeProgress,
} from '../types/source'

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const rest = total % 60
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function NotesView({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  let bullets: string[] = []
  const flush = () => {
    if (!bullets.length) return
    const items = bullets
    bullets = []
    blocks.push(
      <ul key={`list-${blocks.length}`}>
        {items.map((item, index) => (
          <li key={`${index}-${item.slice(0, 12)}`}>{item}</li>
        ))}
      </ul>,
    )
  }
  for (const [index, raw] of text.split('\n').entries()) {
    const line = raw.replace(/\*\*/g, '').trimEnd()
    if (line.startsWith('## ')) {
      flush()
      blocks.push(<h3 key={`h-${index}`}>{line.slice(3)}</h3>)
    } else if (line.startsWith('### ')) {
      flush()
      blocks.push(<h4 key={`h4-${index}`}>{line.slice(4)}</h4>)
    } else if (line.startsWith('# ')) {
      flush()
      blocks.push(<h3 key={`h1-${index}`}>{line.slice(2)}</h3>)
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      bullets.push(line.slice(2))
    } else if (!line.trim()) {
      flush()
    } else {
      flush()
      blocks.push(<p key={`p-${index}`}>{line}</p>)
    }
  }
  flush()
  return <div className="meetingNote">{blocks}</div>
}

function statusLabel(status: string): string {
  if (status === 'recording') return 'Recording'
  if (status === 'recorded') return 'Ready to transcribe'
  if (status === 'transcribing') return 'Transcribing'
  if (status === 'summarizing') return 'Writing notes'
  if (status === 'ready') return 'Notes ready'
  if (status === 'error') return 'Needs attention'
  return status
}

export default function Meetings() {
  const { refresh: refreshSaved } = useSaved()
  const [status, setStatus] = useState<MeetingStatus | null>(null)
  const [meetings, setMeetings] = useState<MeetingSummary[]>([])
  const [selected, setSelected] = useState<MeetingRecord | null>(null)
  const [tab, setTab] = useState<'notes' | 'transcript'>('notes')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<MeetingProgress | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [installing, setInstalling] = useState(false)
  const [notesModelBusy, setNotesModelBusy] = useState(false)
  const [notesModelProgress, setNotesModelProgress] = useState<RuntimeProgress | null>(null)
  const [notesModelNotice, setNotesModelNotice] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const [nextStatus, nextMeetings] = await Promise.all([
      api.meetingStatus(),
      api.meetingList(),
    ])
    setStatus(nextStatus)
    setMeetings(nextMeetings)
    return nextStatus
  }, [])

  const openMeeting = useCallback(async (id: string) => {
    try {
      const record = await api.meetingGet(id)
      setSelected(record)
      setTab('notes')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  useEffect(() => {
    void refresh().catch((cause) => {
      setError(cause instanceof Error ? cause.message : String(cause))
    })
  }, [refresh])

  useEffect(() => {
    if (!status?.recording || !status.startedAt) {
      setElapsed(0)
      return
    }
    const started = Date.parse(status.startedAt)
    const tick = () => setElapsed(Math.max(0, (Date.now() - started) / 1000))
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [status?.recording, status?.startedAt])

  useEffect(() => {
    if (!status?.recording && !status?.processingId) return
    const timer = window.setInterval(() => {
      void refresh()
    }, 2000)
    return () => window.clearInterval(timer)
  }, [status?.recording, status?.processingId, refresh])

  useEffect(() => {
    if (!inTauri()) return
    let stop: (() => void) | undefined
    let cancelled = false
    void api
      .onRuntimeProgress((next) => {
        if (next.kind !== 'model') return
        setNotesModelProgress(next)
        if (next.phase === 'done') {
          setNotesModelBusy(false)
          void refresh()
        }
      })
      .then((unlisten) => {
        if (cancelled) unlisten()
        else stop = unlisten
      })
    return () => {
      cancelled = true
      stop?.()
    }
  }, [refresh])

  useEffect(() => {
    if (!inTauri()) return
    let disposed = false
    let unlisten: (() => void) | undefined
    void import('@tauri-apps/api/event').then(async ({ listen }) => {
      const off = await listen<MeetingProgress>('meeting-progress', (event) => {
        const payload = event.payload
        setProgress(payload)
        if (payload.kind === 'done') {
          setProgress(null)
          void refresh()
          void refreshSaved()
          void openMeeting(payload.id)
        } else if (payload.kind === 'error') {
          setError(payload.message)
          void refresh()
        } else if (payload.kind === 'model' && payload.phase === 'ready') {
          setInstalling(false)
          void refresh()
        }
      })
      if (disposed) off()
      else unlisten = off
    })
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [openMeeting, refresh, refreshSaved])

  async function installModel() {
    setInstalling(true)
    setError(null)
    try {
      await api.meetingInstallModel()
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setInstalling(false)
    }
  }

  async function downloadNotesModel() {
    setNotesModelBusy(true)
    setNotesModelNotice(null)
    setNotesModelProgress({
      kind: 'model',
      phase: 'download',
      message: 'Starting the Phi-4 Mini download…',
      downloaded: 0,
      total: 0,
    })
    try {
      await api.downloadModel()
      setNotesModelNotice('Phi-4 Mini is installed and ready for notes.')
      await refresh()
    } catch (cause) {
      setNotesModelNotice(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setNotesModelBusy(false)
    }
  }

  async function start() {
    setBusy(true)
    setError(null)
    setProgress(null)
    try {
      await api.meetingStart()
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  async function stop() {
    setBusy(true)
    setError(null)
    try {
      const stopped = await api.meetingStop()
      setProgress({
        id: stopped.id,
        kind: 'transcribe',
        phase: 'starting',
        percent: 35,
        message: 'Preparing the recording for Whisper',
      })
      await api.meetingProcess(stopped.id)
      await refresh()
      await openMeeting(stopped.id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      await refresh().catch(() => undefined)
    } finally {
      setBusy(false)
    }
  }

  async function retry() {
    if (!selected) return
    setBusy(true)
    setError(null)
    try {
      await api.meetingProcess(selected.id)
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  async function regenerateNotes() {
    if (!selected) return
    setBusy(true)
    setError(null)
    try {
      await api.meetingRegenerateNotes(selected.id)
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this meeting and its transcript? The Markdown copy in Saved is kept.')) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.meetingDelete(id)
      if (selected?.id === id) setSelected(null)
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const recording = Boolean(status?.recording)
  const processing = Boolean(status?.processingId)
  const canRecord =
    Boolean(status?.modelInstalled) && Boolean(status?.micAvailable) && !recording && !processing
  const progressPercent = progress?.percent ?? 0

  return (
    <div className="page meetingsPage">
      <header className="pageHead pageHead--dashboard">
        <div>
          <p className="eyebrow">Meetings</p>
          <h1 className="pageTitle">
            Listen once, keep the <em className="pageTitle__hand">decisions.</em>
          </h1>
          <p className="pageLede">
            FrontDesk records your microphone locally, transcribes with Whisper on this computer, and
            writes notes with the local model. Nothing is uploaded. Audio is deleted after a
            successful transcription.
          </p>
        </div>
      </header>

      {!inTauri() ? (
        <p className="notice notice--bad">
          Meeting recording runs in the desktop app. This browser preview shows the page only.
        </p>
      ) : null}

      {status && !status.modelInstalled ? (
        <section className="panel meetingSetup">
          <div>
            <p className="sectionLabel">Local transcription</p>
            <h3>Whisper base, on this computer</h3>
            <p>
              One-time download of {status.modelSizeMb} MB. The same model installs on macOS, Windows and Linux; Whisper runs locally. No account, no cloud, no meeting bot.
            </p>
          </div>
          <div className="meetingSetup__actions">
            <button
              type="button"
              className="btn btn--primary"
              disabled={installing}
              onClick={() => void installModel()}
            >
              {installing ? 'Installing…' : 'Install model'}
            </button>
            {progress?.kind === 'model' ? (
              <div className="meetingProgress">
                <div className="meetingProgress__bar">
                  <span style={{ width: `${progress.percent ?? 0}%` }} />
                </div>
                <p>
                  {progress.message}
                  {progress.percent != null ? ` · ${progress.percent}%` : ''}
                </p>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {status && !status.llmAvailable && inTauri() ? (
        <section className="panel meetingSetup meetingModelSetup">
          <div>
            <p className="sectionLabel">Notes model</p>
            <h3>Phi-4 Mini for written notes</h3>
            <p>
              The transcript is still saved without it. Download the 2.3 GB local model once to
              get summaries, decisions and action items on this computer.
            </p>
            {notesModelNotice ? <p className="meetingHint">{notesModelNotice}</p> : null}
          </div>
          <div className="meetingSetup__actions">
            <button
              type="button"
              className="btn btn--primary"
              disabled={notesModelBusy}
              onClick={() => void downloadNotesModel()}
            >
              {notesModelBusy ? 'Downloading…' : 'Download notes model'}
            </button>
            {notesModelBusy && notesModelProgress ? (
              <div className="meetingProgress">
                <div className="meetingProgress__bar">
                  <span
                    style={{
                      width: `${
                        notesModelProgress.total > 0
                          ? Math.min(
                              100,
                              Math.round(
                                (notesModelProgress.downloaded / notesModelProgress.total) * 100,
                              ),
                            )
                          : 0
                      }%`,
                    }}
                  />
                </div>
                <p>
                  {notesModelProgress.message}
                  {notesModelProgress.total > 0
                    ? ` · ${Math.round(notesModelProgress.downloaded / 1048576)} / ${Math.round(
                        notesModelProgress.total / 1048576,
                      )} MB`
                    : ''}
                </p>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className={`panel meetingRecorder${recording ? ' is-recording' : ''}`}>
        <div className="meetingRecorder__main">
          <button
            type="button"
            className={`meetingRecord${recording ? ' is-live' : ''}`}
            disabled={busy || (!recording && !canRecord)}
            onClick={() => void (recording ? stop() : start())}
            aria-label={recording ? 'Stop recording' : 'Start recording'}
            title={recording ? 'Stop recording' : 'Start recording'}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {recording ? (
                <rect x="7" y="7" width="10" height="10" rx="1.5" />
              ) : (
                <>
                  <rect x="9" y="3" width="6" height="11" rx="3" />
                  <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6" />
                </>
              )}
            </svg>
          </button>
          <div className="meetingRecorder__copy">
            <p className="sectionLabel">{recording ? 'Recording now' : 'Meeting recorder'}</p>
            <h2>
              {recording ? formatDuration(elapsed) : processing ? 'Working…' : 'Record a meeting'}
            </h2>
            <p>
              {recording
                ? 'Speak normally. Stop when the meeting ends and FrontDesk will transcribe it.'
                : processing
                  ? progress?.message || 'Transcribing and writing notes on this computer.'
                  : status && !status.micAvailable
                    ? 'No microphone was found. Connect one and reopen this page.'
                    : status && !status.modelInstalled
                      ? 'Install the transcription model above to begin.'
                      : 'Microphone only. In a headphone meeting this captures your side; the other participants are not recorded.'}
            </p>
            {status && !status.recording ? (
              <p className="meetingHint">
                The first recording asks your system for microphone access. If it is denied,
                enable FrontDesk in your system's microphone privacy settings.
              </p>
            ) : null}
            {status && !status.llmAvailable ? (
              <p className="meetingHint">
                No local model is installed. The transcript will still be saved. Download the
                notes model above, or add a GGUF in Settings, to generate written notes.
              </p>
            ) : null}
          </div>
        </div>
        <div className="meetingRecorder__actions">
          {recording ? (
            <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void stop()}>
              {busy ? 'Stopping…' : 'Stop & transcribe'}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy || !canRecord}
              onClick={() => void start()}
            >
              Start recording
            </button>
          )}
        </div>
      </section>

      {progress && progress.kind !== 'done' && progress.kind !== 'model' ? (
        <div className="meetingProgress meetingProgress--wide">
          <div className="meetingProgress__bar">
            <span style={{ width: `${progressPercent}%` }} />
          </div>
          <p>
            {progress.message}
            {progress.percent != null ? ` · ${progress.percent}%` : ''}
          </p>
        </div>
      ) : null}

      {error ? <p className="notice notice--bad">{error}</p> : null}

      {selected ? (
        <section className="panel meetingDetail">
          <header className="meetingDetail__head">
            <div>
              <div className="meetingDetail__meta">
                <span className={`tag${selected.status === 'error' ? ' tag--bad' : ''}`}>
                  {statusLabel(selected.status)}
                </span>
                <span>{formatDate(selected.startedAt)}</span>
                <span>{formatDuration(selected.durationSec)}</span>
              </div>
              <h2>{selected.title}</h2>
            </div>
            <div className="meetingDetail__actions">
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSelected(null)}>
                Close
              </button>
              {selected.savedPath ? (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => void api.openSaved(selected.savedPath ?? '')}
                >
                  Open Markdown
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => void api.meetingReveal(selected.id)}
              >
                Reveal folder
              </button>
              {selected.status === 'error' ||
              ((selected.status === 'transcribing' || selected.status === 'summarizing') &&
                !status?.processingId) ? (
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => void retry()}>
                  {selected.status === 'error' ? 'Retry' : 'Resume'}
                </button>
              ) : null}
              {selected.transcript && !status?.processingId ? (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => void regenerateNotes()}
                >
                  Regenerate notes
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => void remove(selected.id)}
              >
                Delete
              </button>
            </div>
          </header>

          {selected.error ? <p className="notice notice--bad">{selected.error}</p> : null}

          <div className="meetingTabs" role="tablist" aria-label="Meeting content">
            <button
              type="button"
              className={`filter${tab === 'notes' ? ' is-on' : ''}`}
              onClick={() => setTab('notes')}
            >
              Notes
            </button>
            <button
              type="button"
              className={`filter${tab === 'transcript' ? ' is-on' : ''}`}
              onClick={() => setTab('transcript')}
            >
              Transcript
            </button>
            <span className="meetingTabs__meta">
              {selected.model ? `Notes by ${selected.model}` : 'Whisper base'}
            </span>
          </div>

          {tab === 'notes' ? (
            <div className="meetingText meetingText--notes">
              <NotesView text={selected.notes || 'Notes are still being prepared.'} />
            </div>
          ) : (
            <pre className="meetingText">
              {selected.transcript || 'The transcript is still being prepared.'}
            </pre>
          )}
        </section>
      ) : null}

      <section className="meetingList" aria-label="Recorded meetings">
        {meetings.length ? (
          meetings.map((meeting) => (
            <article
              key={meeting.id}
              className="panel meetingCard"
              role="button"
              tabIndex={0}
              onClick={() => void openMeeting(meeting.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  void openMeeting(meeting.id)
                }
              }}
            >
              <div className="meetingCard__head">
                <span className={`tag${meeting.status === 'error' ? ' tag--bad' : ''}`}>
                  {statusLabel(meeting.status)}
                </span>
                <span>{formatDate(meeting.startedAt)}</span>
              </div>
              <h3>{meeting.title}</h3>
              <p>{meeting.excerpt || 'Preparing the transcript…'}</p>
              <div className="meetingCard__foot">
                <span>{formatDuration(meeting.durationSec)}</span>
                <span>{meeting.savedPath ? 'Saved as Markdown' : 'On this device'}</span>
              </div>
            </article>
          ))
        ) : (
          <div className="empty">
            <p className="empty__title">No meetings recorded yet.</p>
            <p>
              Start with the record button. FrontDesk keeps the transcript and notes here; the
              audio is removed once the transcription finishes.
            </p>
          </div>
        )}
      </section>
    </div>
  )
}
