import { useEffect, useState } from 'react'
import RuntimePanel from '../components/RuntimePanel'
import { api } from '../lib/ipc'
import { useAccess } from '../state/access'
import type { DeviceCodePrompt, IndexStatus, MicrosoftProfile } from '../types/source'

const switches = [
  ['Local notes + OCR', 'Read and index documents on this machine', true],
  ['Send anonymous diagnostics', 'Never includes note content or file names', false],
  ['Start FrontDesk at login', 'Keep the desk ready in the background', true],
] as const

function bytes(value: number): string {
  if (value > 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`
  if (value > 1024 ** 2) return `${(value / 1024 ** 2).toFixed(0)} MB`
  return `${Math.max(1, Math.round(value / 1024))} KB`
}

export default function Settings() {
  const { info, models, sources, refresh, selectModel, selectMode, warmModel } = useAccess()
  const [toggles, setToggles] = useState(() => switches.map(([, , on]) => on))
  const [notice, setNotice] = useState<string | null>(null)
  const [microsoftProfile, setMicrosoftProfile] = useState<MicrosoftProfile | null>(null)
  const [deviceCode, setDeviceCode] = useState<DeviceCodePrompt | null>(null)
  const [microsoftBusy, setMicrosoftBusy] = useState(false)
  const [indexStatus, setIndexStatus] = useState<IndexStatus | null>(null)
  const [indexBusy, setIndexBusy] = useState(false)
  const [indexNotice, setIndexNotice] = useState<string | null>(null)

  const selected = info?.selectedModel ?? 'extractive'

  useEffect(() => {
    let active = true
    api
      .indexStatus()
      .then((status) => {
        if (active) setIndexStatus(status)
      })
      .catch(() => {
        if (active) setIndexStatus(null)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    api.getMicrosoftProfile()
      .then((profile) => {
        if (active) setMicrosoftProfile(profile)
      })
      .catch((cause) => {
        if (active) setNotice(cause instanceof Error ? cause.message : String(cause))
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!deviceCode) return
    let active = true
    let timer: ReturnType<typeof setTimeout>

    const poll = async () => {
      try {
        const result = await api.pollMicrosoftSignIn()
        if (!active) return
        if (result.status === 'connected') {
          await api.grantMicrosoftSources()
          await refresh()
          setMicrosoftProfile(await api.getMicrosoftProfile())
          setDeviceCode(null)
          setMicrosoftBusy(false)
          setNotice('Microsoft account connected. Mail, calendar and OneNote are available.')
          return
        }
        timer = setTimeout(poll, Math.max(1, result.intervalSeconds) * 1000)
      } catch (cause) {
        if (!active) return
        setDeviceCode(null)
        setMicrosoftBusy(false)
        setNotice(cause instanceof Error ? cause.message : String(cause))
        try {
          await api.cancelMicrosoftSignIn()
        } catch (cancelCause) {
          setNotice(
            `${cause instanceof Error ? cause.message : String(cause)} Sign-in cleanup failed: ${
              cancelCause instanceof Error ? cancelCause.message : String(cancelCause)
            }`,
          )
        }
      }
    }

    timer = setTimeout(poll, Math.max(1, deviceCode.intervalSeconds) * 1000)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [deviceCode, refresh])

  async function connectMicrosoft() {
    const clientId = import.meta.env.VITE_MICROSOFT_CLIENT_ID?.trim()
    if (!clientId) {
      setNotice('Set VITE_MICROSOFT_CLIENT_ID in desktop/.env.local, then restart the app.')
      return
    }
    setMicrosoftBusy(true)
    setNotice(null)
    try {
      setDeviceCode(await api.beginMicrosoftSignIn(clientId))
    } catch (cause) {
      setMicrosoftBusy(false)
      setNotice(cause instanceof Error ? cause.message : String(cause))
    }
  }

  async function disconnectMicrosoft() {
    setMicrosoftBusy(true)
    setNotice(null)
    try {
      await api.disconnectMicrosoft()
      setMicrosoftProfile(null)
      await refresh()
      setNotice('Microsoft account disconnected and its source grants were revoked.')
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setMicrosoftBusy(false)
    }
  }

  async function cancelMicrosoftSignIn() {
    try {
      await api.cancelMicrosoftSignIn()
      setDeviceCode(null)
      setMicrosoftBusy(false)
      setNotice('Microsoft sign-in cancelled.')
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause))
    }
  }

  async function buildIndex() {
    setIndexBusy(true)
    setIndexNotice('Building the local semantic index. The first run downloads the embedding model once.')
    try {
      setIndexStatus(await api.buildIndex())
      setIndexNotice('Semantic index updated. No note text was stored.')
    } catch (cause) {
      setIndexNotice(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setIndexBusy(false)
    }
  }

  async function clearIndex() {
    setIndexBusy(true)
    setIndexNotice(null)
    try {
      setIndexStatus(await api.clearIndex())
      setIndexNotice('Semantic index cleared. Your notes were not touched.')
    } catch (cause) {
      setIndexNotice(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setIndexBusy(false)
    }
  }

  async function loadModel() {
    if (selected === 'extractive') {
      setNotice('The extractive adapter needs no download.')
      return
    }
    setNotice('Importing the GGUF into the local runtime…')
    try {
      setNotice(await warmModel(selected))
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <div className="page page--flush">
      <header className="pageHead pageHead--tight">
        <div>
          <p className="eyebrow">Preferences</p>
          <h1 className="pageTitle">
            Yours to <em>configure.</em>
          </h1>
        </div>
      </header>

      {notice ? <p className="notice">{notice}</p> : null}

      <div className="settingsGrid">
        <section className="panel" aria-labelledby="connections">
          <header className="panel__head">
            <h2 id="connections" className="panel__title">
              Connections
            </h2>
            <span className="panel__meta">Optional</span>
          </header>

          <div className="connectRow">
            <span className="connectRow__mark" aria-hidden="true">
              M
            </span>
            <span className="connectRow__body">
              <strong>Microsoft account</strong>
              <em>
                {microsoftProfile
                  ? `Connected as ${
                      microsoftProfile.displayName ||
                      microsoftProfile.mail ||
                      microsoftProfile.userPrincipalName ||
                      'Microsoft account'
                    }`
                  : 'Read-only access to mail, calendar and OneNote'}
              </em>
            </span>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={microsoftBusy}
              onClick={() =>
                void (microsoftProfile ? disconnectMicrosoft() : connectMicrosoft())
              }
            >
              {microsoftBusy ? 'Connecting…' : microsoftProfile ? 'Disconnect' : 'Connect'}
            </button>
          </div>
          {deviceCode ? (
            <p className="panel__note">
              {deviceCode.message}{' '}
              <a href={deviceCode.verificationUri} target="_blank" rel="noreferrer">
                Open Microsoft sign-in
              </a>
              . Code: <strong>{deviceCode.userCode}</strong>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => void cancelMicrosoftSignIn()}
              >
                Cancel
              </button>
            </p>
          ) : null}

          <div className="connectRow">
            <span className="connectRow__mark" aria-hidden="true">
              AI
            </span>
            <span className="connectRow__body">
              <strong>Local model</strong>
              <em>{selected === 'extractive' ? 'Extractive adapter · no model' : selected}</em>
            </span>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={selected === 'extractive'}
              onClick={() => void loadModel()}
            >
              Load
            </button>
          </div>

          <p className="panel__note">
            Each connection has its own permission. Revoke one without touching the others.
          </p>
        </section>

        <section className="panel" aria-labelledby="models">
          <header className="panel__head">
            <h2 id="models" className="panel__title">
              Models
            </h2>
            <span className="panel__meta">GGUF folder</span>
          </header>

          <label className="fieldLabel" htmlFor="settingsMode">
            Answer style
          </label>
          <select
            id="settingsMode"
            className="select"
            value={info?.answerMode ?? 'chat'}
            onChange={(event) =>
              void selectMode(event.target.value === 'grounded' ? 'grounded' : 'chat')
            }
          >
            <option value="chat">Assistant — answer freely, cite files when used</option>
            <option value="grounded">Strict citations — refuse when not in files</option>
          </select>

          <p className="panel__note">
            Assistant is the default. Strict citations is the same assistant with the general
            knowledge door closed: every claim must point at your files.
          </p>

          <label className="fieldLabel" htmlFor="settingsModel">
            Answer adapter
          </label>
          <select
            id="settingsModel"
            className="select"
            value={selected}
            onChange={(event) =>
              void selectModel(event.target.value === 'extractive' ? null : event.target.value)
            }
          >
            <option value="extractive">Extractive — instant, citation-bound</option>
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name} · {bytes(model.sizeBytes)}
              </option>
            ))}
          </select>

          <p className="panel__note monoWrap">{info?.modelsDir ?? '—'}</p>

          <p className="panel__note">
            Add or remove a <code>.gguf</code> file in this folder to plug a model in or out. The
            model stays a file on this machine; the adapter can change without touching the UI.
          </p>
        </section>

        <RuntimePanel />

        <section className="panel" aria-labelledby="semantic-index">
          <header className="panel__head">
            <h2 id="semantic-index" className="panel__title">
              Semantic index
            </h2>
            <span className="panel__meta">Metadata + vectors only</span>
          </header>

          <p className="panel__note">
            Local keyword and embedding candidate selection. The index stores source metadata and
            derived vectors only: no note text, excerpts, questions or answers.
          </p>

          <dl className="kv kv--tight">
            <div>
              <dt>Sources indexed</dt>
              <dd>
                {indexStatus
                  ? `${indexStatus.indexedSources} / ${indexStatus.sources}`
                  : 'Desktop app only'}
              </dd>
            </div>
            <div>
              <dt>Chunks</dt>
              <dd>{indexStatus?.chunks ?? 0}</dd>
            </div>
            <div>
              <dt>Embedding model</dt>
              <dd className="monoWrap">{indexStatus?.model ?? 'all-MiniLM-L6-v2'}</dd>
            </div>
          </dl>

          {indexNotice ? <p className="panel__note">{indexNotice}</p> : null}

          <div className="modelActions">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={indexBusy || !indexStatus}
              onClick={() => void buildIndex()}
            >
              {indexBusy ? 'Building…' : 'Build / rebuild index'}
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={indexBusy || !indexStatus || !indexStatus.chunks}
              onClick={() => void clearIndex()}
            >
              Clear index
            </button>
          </div>
        </section>

        <section className="panel" aria-labelledby="behaviour">
          <header className="panel__head">
            <h2 id="behaviour" className="panel__title">
              Behaviour
            </h2>
            <span className="panel__meta">This device</span>
          </header>

          <ul className="switchList">
            {switches.map(([label, note], i) => (
              <li key={label}>
                <span className="switchList__body">
                  <strong>{label}</strong>
                  <em>{note}</em>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={toggles[i]}
                  aria-label={label}
                  className={`tinySwitch${toggles[i] ? ' is-on' : ''}`}
                  onClick={() =>
                    setToggles((all) => all.map((on, index) => (index === i ? !on : on)))
                  }
                >
                  <span className="tinySwitch__knob" />
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel" aria-labelledby="storage">
          <header className="panel__head">
            <h2 id="storage" className="panel__title">
              Storage
            </h2>
            <span className="panel__meta">Local-first</span>
          </header>

          <dl className="kv">
            <div>
              <dt>Sources in scope</dt>
              <dd>{sources.length} items</dd>
            </div>
            <div>
              <dt>App data</dt>
              <dd className="monoWrap">{info?.dataDir ?? '—'}</dd>
            </div>
            <div>
              <dt>Notes stored by FrontDesk</dt>
              <dd>0 — originals stay where they are</dd>
            </div>
            <div>
              <dt>Model files</dt>
              <dd>{models.length} GGUF</dd>
            </div>
          </dl>

          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => void api.clearAudit()}
          >
            Clear activity log
          </button>
        </section>

        <section className="panel panel--inset" aria-labelledby="about">
          <header className="panel__head">
            <h2 id="about" className="panel__title">
              About
            </h2>
            <span className="panel__meta">v0.2.0 local core</span>
          </header>

          <p className="panel__note">
            FrontDesk is built for the Pfizer &amp; Newpage Solutions Hackathon Challenge. The
            desktop app reads granted sources on demand, keeps excerpts in memory, and ties every
            answer to a source. Your files stay where they are.
          </p>

          <p className="panel__note">
            Onboarding lives on the web: run <code>npm run dev:web</code> and open{' '}
            <code>/monitor</code>.
          </p>
        </section>
      </div>
    </div>
  )
}
