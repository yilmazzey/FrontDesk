import { useCallback, useEffect, useRef, useState } from 'react'
import {
  beginMicrosoftSignIn,
  cancelMicrosoftSignIn,
  checkLocalModel,
  disconnectMicrosoft,
  getMicrosoftProfile,
  isDesktopApp,
  pollMicrosoftSignIn,
  type DeviceCodePrompt,
  type MicrosoftProfile,
} from '../services/microsoft'

const switches = [
  ['Local notes + OCR', 'Read and index documents on this machine', true],
  ['Send anonymous diagnostics', 'Never includes note content or file names', false],
  ['Start FrontDesk at login', 'Keep the desk ready in the background', true],
] as const

export default function Settings() {
  const [toggles, setToggles] = useState(() => switches.map(([, , on]) => on))
  const [profile, setProfile] = useState<MicrosoftProfile | null>(null)
  const [connectionChecked, setConnectionChecked] = useState(false)
  const [prompt, setPrompt] = useState<DeviceCodePrompt | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [modelStatus, setModelStatus] = useState<
    'unchecked' | 'checking' | 'ready' | 'missing' | 'offline'
  >('unchecked')
  const [modelError, setModelError] = useState('')
  const pollTimer = useRef<number | undefined>(undefined)
  const clientId = import.meta.env.VITE_MICROSOFT_CLIENT_ID?.trim() ?? ''
  const model = import.meta.env.VITE_OLLAMA_MODEL?.trim() || 'qwen2.5:3b'
  const desktopApp = isDesktopApp()

  const clearPollTimer = () => {
    if (pollTimer.current !== undefined) {
      window.clearTimeout(pollTimer.current)
      pollTimer.current = undefined
    }
  }

  useEffect(() => {
    if (!desktopApp) {
      setConnectionChecked(true)
      return
    }

    getMicrosoftProfile()
      .then(setProfile)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : String(reason)),
      )
      .finally(() => setConnectionChecked(true))

    return clearPollTimer
  }, [desktopApp])

  const pollForSignIn = useCallback(async () => {
    try {
      const result = await pollMicrosoftSignIn()
      if (result.status === 'connected') {
        const signedInProfile = await getMicrosoftProfile()
        setProfile(signedInProfile)
        setPrompt(null)
        setBusy(false)
        return
      }

      pollTimer.current = window.setTimeout(
        () => void pollForSignIn(),
        result.intervalSeconds * 1000,
      )
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      setPrompt(null)
      setBusy(false)
    }
  }, [])

  const connect = async () => {
    setError('')
    setBusy(true)
    try {
      const nextPrompt = await beginMicrosoftSignIn(clientId)
      setPrompt(nextPrompt)
      pollTimer.current = window.setTimeout(
        () => void pollForSignIn(),
        nextPrompt.intervalSeconds * 1000,
      )
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      setBusy(false)
    }
  }

  const cancel = async () => {
    clearPollTimer()
    setPrompt(null)
    setBusy(false)
    try {
      await cancelMicrosoftSignIn()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  const disconnect = async () => {
    setError('')
    try {
      await disconnectMicrosoft()
      setProfile(null)
      setPrompt(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  const checkModel = async () => {
    setModelStatus('checking')
    setModelError('')
    try {
      const installed = await checkLocalModel(model)
      setModelStatus(installed ? 'ready' : 'missing')
    } catch (reason) {
      setModelError(reason instanceof Error ? reason.message : String(reason))
      setModelStatus('offline')
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
                {profile
                  ? `Connected · ${profile.mail ?? profile.userPrincipalName ?? profile.displayName}`
                  : connectionChecked
                    ? desktopApp
                      ? 'Mail, calendar and OneNote · not connected'
                      : 'Connect from the Tauri desktop app'
                    : 'Checking connection…'}
              </em>
            </span>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={!desktopApp || !clientId || busy || !connectionChecked}
              onClick={profile ? () => void disconnect() : () => void connect()}
            >
              {profile ? 'Disconnect' : busy ? 'Waiting…' : 'Connect'}
            </button>
          </div>

          {!clientId && desktopApp ? (
            <p className="panel__note">
              Set <code>VITE_MICROSOFT_CLIENT_ID</code> in <code>desktop/.env.local</code> to enable
              sign-in.
            </p>
          ) : null}
          {prompt ? (
            <div className="authPrompt">
              <p>{prompt.message}</p>
              <p>
                Open this URL in your browser and enter the code:
              </p>
              <code>{prompt.verificationUri}</code>
              <strong className="authPrompt__code">{prompt.userCode}</strong>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => void cancel()}>
                Cancel sign-in
              </button>
            </div>
          ) : null}
          {error ? <p className="connectionError" role="alert">{error}</p> : null}

          <div className="connectRow">
            <span className="connectRow__mark" aria-hidden="true">
              AI
            </span>
            <span className="connectRow__body">
              <strong>Ollama local model</strong>
              <em>
                {modelStatus === 'ready'
                  ? `${model} is ready · local only`
                  : modelStatus === 'missing'
                    ? `${model} is not installed`
                    : modelStatus === 'offline'
                      ? 'Ollama is not running'
                      : 'Local answers · Microsoft excerpts stay on this device'}
              </em>
            </span>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={!desktopApp || modelStatus === 'checking'}
              onClick={() => void checkModel()}
            >
              {modelStatus === 'checking' ? 'Checking…' : 'Check model'}
            </button>
          </div>
          {modelStatus === 'missing' ? (
            <p className="panel__note">
              Install Ollama, then run <code>ollama pull {model}</code> and check again.
            </p>
          ) : null}
          {modelError ? <p className="connectionError" role="alert">{modelError}</p> : null}

          <p className="panel__note">
            Each connection has its own permission. Revoke one without touching the others.
          </p>
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
              <dt>Workspace</dt>
              <dd>~/Documents/FrontDesk</dd>
            </div>
            <div>
              <dt>Notes</dt>
              <dd>128 files · 4.2 MB</dd>
            </div>
            <div>
              <dt>Scans and OCR text</dt>
              <dd>36 files · 18.6 MB</dd>
            </div>
            <div>
              <dt>Backups</dt>
              <dd>Off — connect a folder to enable</dd>
            </div>
          </dl>
        </section>

        <section className="panel panel--inset" aria-labelledby="about">
          <header className="panel__head">
            <h2 id="about" className="panel__title">
              About
            </h2>
            <span className="panel__meta">v0.1.0 skeleton</span>
          </header>

          <p className="panel__note">
            FrontDesk is built for the Pfizer &amp; Newpage Solutions Hackathon Challenge. This is
            the desktop shell: notes and OCR are placeholders. Microsoft data search and local-model
            answers run on this device. Your local files are not included in Microsoft search.
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
