import { useEffect, useState } from 'react'
import PathLink from '../components/PathLink'
import RuntimePanel from '../components/RuntimePanel'
import { bytes } from '../lib/format'
import { api, inTauri } from '../lib/ipc'
import { useAccess } from '../state/access'
import type {
  AuditEntry,
  DeviceCodePrompt,
  IndexStatus,
  MicrosoftDiagnostics,
  MicrosoftProfile,
  RuntimeProgress,
} from '../types/source'

export default function Settings() {
  const { info, models, sources, grants, refresh, grantFolder, grantFixture, revoke, selectModel, selectMode, warmModel } = useAccess()
  const [notice, setNotice] = useState<string | null>(null)
  const [appVersion, setAppVersion] = useState('0.1.0')
  const [microsoftProfile, setMicrosoftProfile] = useState<MicrosoftProfile | null>(null)
  const [microsoftChecks, setMicrosoftChecks] = useState<MicrosoftDiagnostics | null>(null)
  const [checksBusy, setChecksBusy] = useState(false)
  const [clientIdDraft, setClientIdDraft] = useState('')
  const [clientIdBusy, setClientIdBusy] = useState(false)
  const [deviceCode, setDeviceCode] = useState<DeviceCodePrompt | null>(null)
  const [microsoftBusy, setMicrosoftBusy] = useState(false)
  const [indexStatus, setIndexStatus] = useState<IndexStatus | null>(null)
  const [indexBusy, setIndexBusy] = useState(false)
  const [indexNotice, setIndexNotice] = useState<string | null>(null)
  const [folderPath, setFolderPath] = useState('')
  const [folderBusy, setFolderBusy] = useState(false)
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [showAudit, setShowAudit] = useState(false)
  const [modelProgress, setModelProgress] = useState<RuntimeProgress | null>(null)
  const [modelBusy, setModelBusy] = useState(false)
  const [modelNotice, setModelNotice] = useState<string | null>(null)

  const selected = info?.selectedModel ?? 'extractive'
  const webGrant = grants.find((grant) => grant.kind === 'web')

  useEffect(() => {
    if (!inTauri()) return
    let stop: (() => void) | undefined
    let cancelled = false
    void api
      .onRuntimeProgress((next) => {
        if (next.kind !== 'model') return
        setModelProgress(next)
        if (next.phase === 'done') {
          setModelBusy(false)
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
    setClientIdDraft(
      info?.microsoftClientId ?? import.meta.env.VITE_MICROSOFT_CLIENT_ID?.trim() ?? '',
    )
  }, [info?.microsoftClientId])

  useEffect(() => {
    if (!inTauri()) return
    let active = true
    void import('@tauri-apps/api/app')
      .then(({ getVersion }) => getVersion())
      .then((version) => {
        if (active) setAppVersion(version)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    api.microsoftDiagnostics()
      .then((checks) => {
        if (active) setMicrosoftChecks(checks)
      })
      .catch(() => {
        if (active) setMicrosoftChecks(null)
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
          setMicrosoftChecks(await api.microsoftDiagnostics())
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

  async function recheckMicrosoft() {
    setChecksBusy(true)
    try {
      setMicrosoftChecks(await api.microsoftDiagnostics())
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setChecksBusy(false)
    }
  }

  async function saveClientId() {
    setClientIdBusy(true)
    setNotice(null)
    try {
      await api.setMicrosoftClientId(clientIdDraft.trim() || null)
      await refresh()
      setNotice('Microsoft client ID saved.')
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setClientIdBusy(false)
    }
  }

  async function connectMicrosoft() {
    const clientId =
      clientIdDraft.trim() || import.meta.env.VITE_MICROSOFT_CLIENT_ID?.trim()
    if (!clientId) {
      setNotice('Enter a Microsoft client ID below, or set VITE_MICROSOFT_CLIENT_ID in desktop/.env.local.')
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
      setMicrosoftChecks(null)
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

  async function addFolder() {
    if (!folderPath.trim()) return
    setFolderBusy(true)
    setNotice(null)
    try {
      await grantFolder(folderPath.trim())
      setFolderPath('')
      setNotice('Folder granted. It can be read on demand.')
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setFolderBusy(false)
    }
  }

  async function enableWebSearch() {
    setFolderBusy(true)
    setNotice(null)
    try {
      await api.grantWebSearch()
      await refresh()
      setNotice('Web search enabled. Only your question is sent to Bing; source contents stay local.')
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setFolderBusy(false)
    }
  }

  async function restoreFixture() {
    setFolderBusy(true)
    setNotice(null)
    try {
      await grantFixture()
      setNotice('Sample notes restored.')
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setFolderBusy(false)
    }
  }

  async function browse() {
    if (!inTauri()) {
      setNotice('The folder picker needs the desktop app.')
      return
    }
    const { open } = await import('@tauri-apps/plugin-dialog')
    const picked = await open({ directory: true, multiple: false })
    if (typeof picked === 'string') setFolderPath(picked)
  }

  async function loadAudit() {
    setAudit(await api.listAudit(40))
    setShowAudit(true)
  }

  async function clearActivity() {
    await api.clearAudit()
    setAudit([])
  }

  async function downloadModel() {
    setModelBusy(true)
    setModelNotice(null)
    setModelProgress({
      kind: 'model',
      phase: 'download',
      message: 'Starting the Phi-4 Mini download…',
      downloaded: 0,
      total: 0,
    })
    try {
      await api.downloadModel()
      setModelNotice('Phi-4 Mini is installed and ready to select.')
      await refresh()
    } catch (cause) {
      setModelNotice(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setModelBusy(false)
      setModelProgress(null)
    }
  }

  async function cancelModelDownload() {
    await api.cancelModelDownload()
    setModelNotice('Stopping the model download…')
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
        <div className="settingsSection">
          <h2>Access</h2>
          <span>What FrontDesk may read</span>
        </div>

        <section className="panel panel--wide" aria-labelledby="sources">
          <header className="panel__head">
            <h2 id="sources" className="panel__title">
              Sources &amp; access
            </h2>
            <span className="panel__meta">Read-only grants</span>
          </header>

          <p className="panel__note">
            FrontDesk reads the originals where they live. Access is revoked immediately and no
            note content is copied into app data.
          </p>

          <div className="folderForm">
            <input
              value={folderPath}
              onChange={(event) => setFolderPath(event.target.value)}
              placeholder="/Users/you/Documents/Notes"
              aria-label="Folder path"
            />
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => void browse()}>
              Browse…
            </button>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              disabled={folderBusy || !folderPath.trim()}
              onClick={() => void addFolder()}
            >
              Grant
            </button>
          </div>

          <ul className="grantList">
            {grants.map((grant) => (
              <li key={grant.id}>
                <span className="grantList__body">
                  <strong>{grant.title}</strong>
                  <em>
                    {grant.kind === 'web' ? (
                      'public snippets · question only'
                    ) : (
                      <>
                        {grant.kind} ·{' '}
                        {grant.kind === 'file' &&
                        (grant.scope.startsWith('/') || grant.scope.startsWith('~')) ? (
                          <PathLink path={grant.scope}>{grant.scope}</PathLink>
                        ) : (
                          grant.scope
                        )}
                      </>
                    )}
                  </em>
                </span>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => void revoke(grant.id)}
                >
                  Revoke
                </button>
              </li>
            ))}
            {!webGrant ? (
              <li>
                <span className="grantList__body">
                  <strong>Web search</strong>
                  <em>Public snippets · only your question is sent</em>
                </span>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={folderBusy}
                  onClick={() => void enableWebSearch()}
                >
                  Enable
                </button>
              </li>
            ) : null}
            {!grants.some((grant) => grant.id === 'fixture:desk') ? (
              <li>
                <span className="grantList__body">
                  <strong>FrontDesk sample notes</strong>
                  <em>Not granted · built-in demo notes</em>
                </span>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => void restoreFixture()}
                >
                  Restore
                </button>
              </li>
            ) : null}
            {!grants.length ? <li className="emptyRow">No access granted.</li> : null}
          </ul>
          <p className="panel__note">
            Web search sends only the question to Bing. Notes, mail, calendar and OneNote
            contents are never included. Strict citations ignores the web grant.
          </p>
        </section>

        <div className="settingsSection">
          <h2>Connections &amp; models</h2>
          <span>Microsoft, local model, OCR and retrieval</span>
        </div>

        <section className="panel" aria-labelledby="connections">
          <header className="panel__head">
            <h2 id="connections" className="panel__title">
              Microsoft &amp; local runtime
            </h2>
            <span className="panel__meta">Read-only</span>
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
          <div className="clientIdRow">
            <label className="fieldLabel" htmlFor="microsoftClientId">
              Microsoft client ID
            </label>
            <input
              id="microsoftClientId"
              value={clientIdDraft}
              onChange={(event) => setClientIdDraft(event.target.value)}
              placeholder="Public Entra application ID"
              spellCheck={false}
            />
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={clientIdBusy}
              onClick={() => void saveClientId()}
            >
              {clientIdBusy ? 'Saving…' : 'Save'}
            </button>
          </div>
          <p className="panel__note">
            Public client ID for device-code sign-in. Official builds include one; self-hosted
            demos can override it here.
          </p>

          {deviceCode ? (
            <div className="authPrompt">
              <p>
                Microsoft is waiting for approval. Open the sign-in page in your browser and enter
                this code:
              </p>
              <div className="authPrompt__codeRow">
                <code className="authPrompt__code">{deviceCode.userCode}</code>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => {
                    void navigator.clipboard?.writeText(deviceCode.userCode)
                    setNotice('Sign-in code copied.')
                  }}
                >
                  Copy code
                </button>
              </div>
              <div className="authPrompt__actions">
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={() =>
                    void api.openUrl(
                      deviceCode.verificationUri.includes('login.microsoft.com/device')
                        ? 'https://microsoft.com/devicelogin'
                        : deviceCode.verificationUri,
                    )
                  }
                >
                  Open Microsoft sign-in ↗
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => void cancelMicrosoftSignIn()}
                >
                  Cancel
                </button>
              </div>
              <p className="panel__note">Waiting for you to approve FrontDesk in the browser…</p>
            </div>
          ) : null}

          {microsoftChecks ? (
            <div className="diagList">
              {microsoftChecks.account ? (
                <span className="diagList__account">Account · {microsoftChecks.account}</span>
              ) : null}
              <span className={microsoftChecks.mail.ok ? 'is-ok' : 'is-bad'}>
                Mail · {microsoftChecks.mail.detail}
              </span>
              <span className={microsoftChecks.calendar.ok ? 'is-ok' : 'is-bad'}>
                Calendar · {microsoftChecks.calendar.detail}
              </span>
              <span className={microsoftChecks.onenote.ok ? 'is-ok' : 'is-bad'}>
                OneNote · {microsoftChecks.onenote.detail}
              </span>
              <button
                type="button"
                className="diagList__recheck"
                disabled={checksBusy}
                onClick={() => void recheckMicrosoft()}
              >
                {checksBusy ? 'Checking…' : 'Recheck'}
              </button>
            </div>
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
              Models &amp; answer style
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

          <p className="panel__note monoWrap">
            {info?.modelsDir ? <PathLink path={info.modelsDir}>{info.modelsDir}</PathLink> : '—'}
          </p>

          <p className="panel__note">
            Add or remove a <code>.gguf</code> file in this folder to plug a model in or out. The
            model stays a file on this machine; the adapter can change without touching the UI.
          </p>

          <div className="modelDownload">
            <label className="fieldLabel">One-click local model</label>
            <p className="panel__note">
              Phi-4 Mini (Q4_K_M) · ~2.3 GB · SHA-256 verified. Extractive mode needs no download.
            </p>
            <div className="modelActions">
              <button
                type="button"
                className="btn btn--primary btn--sm"
                disabled={modelBusy || models.some((model) => /phi-?4.?mini/i.test(model.name))}
                onClick={() => void downloadModel()}
              >
                {models.some((model) => /phi-?4.?mini/i.test(model.name))
                  ? 'Phi-4 Mini installed'
                  : modelBusy
                    ? 'Downloading…'
                    : 'Download Phi-4 Mini'}
              </button>
              {modelBusy ? (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => void cancelModelDownload()}
                >
                  Cancel
                </button>
              ) : null}
            </div>
            {modelProgress ? (
              <p className="panel__note">
                {modelProgress.message}
                {modelProgress.total > 0
                  ? ` · ${Math.min(100, Math.round((modelProgress.downloaded / modelProgress.total) * 100))}%`
                  : ''}
              </p>
            ) : null}
            {modelNotice ? <p className="panel__note">{modelNotice}</p> : null}
          </div>
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

        <div className="settingsSection">
          <h2>Storage &amp; activity</h2>
          <span>Local data, metadata and app details</span>
        </div>

        <section className="panel" aria-labelledby="storage">
          <header className="panel__head">
            <h2 id="storage" className="panel__title">
              Storage &amp; privacy
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
              <dd className="monoWrap">
                {info?.dataDir ? <PathLink path={info.dataDir}>{info.dataDir}</PathLink> : '—'}
              </dd>
            </div>
            <div>
              <dt>Saved answers</dt>
              <dd className="monoWrap">
                {info?.savedFolder ? (
                  <PathLink path={info.savedFolder}>{info.savedFolder}</PathLink>
                ) : (
                  'Not chosen yet'
                )}
              </dd>
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
            onClick={() => void loadAudit()}
          >
            Show activity
          </button>
        </section>

        <section className="panel panel--inset" aria-labelledby="about">
          <header className="panel__head">
            <h2 id="about" className="panel__title">
              About
            </h2>
            <span className="panel__meta">v{appVersion} local core</span>
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
        <section className="panel panel--wide" aria-labelledby="activity">
          <header className="panel__head">
            <h2 id="activity" className="panel__title">
              Activity log
            </h2>
            <span className="panel__meta">Metadata only</span>
          </header>
          <p className="panel__note">
            FrontDesk records that a source was read, never what it said.
          </p>
          <div className="modelActions">
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => void loadAudit()}>
              {showAudit ? 'Refresh' : 'Show activity'}
            </button>
            {showAudit ? (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => void clearActivity()}>
                Clear
              </button>
            ) : null}
          </div>
          {showAudit ? (
            <ul className="auditList">
              {audit.map((entry, index) => (
                <li key={`${entry.at}-${index}`}>
                  <span className="tag">{entry.action}</span>
                  <span>{entry.sourceId ?? entry.scope ?? '—'}</span>
                  <em>{new Date(entry.at).toLocaleString()}</em>
                </li>
              ))}
              {!audit.length ? <li className="emptyRow">No reads yet.</li> : null}
            </ul>
          ) : null}
        </section>

      </div>
    </div>
  )
}
