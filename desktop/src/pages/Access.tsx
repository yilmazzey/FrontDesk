import { useState } from 'react'
import RuntimePanel from '../components/RuntimePanel'
import { api, inTauri } from '../lib/ipc'
import { useAccess } from '../state/access'
import type { AuditEntry } from '../types/source'

function bytes(value: number): string {
  if (value > 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`
  if (value > 1024 ** 2) return `${(value / 1024 ** 2).toFixed(0)} MB`
  return `${Math.max(1, Math.round(value / 1024))} KB`
}

function when(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export default function Access() {
  const {
    grants,
    sources,
    models,
    info,
    loading,
    error,
    grantFolder,
    grantFixture,
    revoke,
    selectModel,
    selectMode,
    warmModel,
  } = useAccess()
  const [path, setPath] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [showAudit, setShowAudit] = useState(false)

  const selected = info?.selectedModel ?? 'extractive'

  async function addFolder() {
    if (!path.trim()) return
    setBusy(true)
    setNotice(null)
    try {
      await grantFolder(path.trim())
      setPath('')
      setNotice('Folder granted. FrontDesk can now read it on demand.')
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  async function restoreFixture() {
    setBusy(true)
    setNotice(null)
    try {
      await grantFixture()
      setNotice('Sample notes restored. Ask a question to see a cited answer.')
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  async function browse() {
    if (!inTauri()) {
      setNotice('The folder picker is available in the desktop app. Use npm run tauri dev.')
      return
    }
    const { open } = await import('@tauri-apps/plugin-dialog')
    const picked = await open({ directory: true, multiple: false })
    if (typeof picked === 'string') setPath(picked)
  }

  async function loadAudit() {
    setAudit(await api.listAudit(40))
    setShowAudit(true)
  }

  async function clearAudit() {
    await api.clearAudit()
    setAudit([])
  }

  async function loadModel() {
    if (selected === 'extractive') {
      setNotice('The extractive adapter is always ready and needs no model.')
      return
    }
    setBusy(true)
    setNotice('Importing the GGUF into the local runtime. The first load can take a minute…')
    try {
      const status = await warmModel(selected)
      setNotice(status)
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <header className="pageHead">
        <div>
          <p className="eyebrow">Access</p>
          <h1 className="pageTitle">
            Yours to <em>grant, and revoke.</em>
          </h1>
          <p className="pageLede">
            Everything below is a live permission. FrontDesk stores the scope, never the contents.
            Revoking a source removes it from the very next question.
          </p>
        </div>
        <button type="button" className="btn btn--ghost" onClick={() => void clearAudit()}>
          Clear activity
        </button>
      </header>

      {error ? <p className="notice notice--bad">{error}</p> : null}
      {notice ? <p className="notice">{notice}</p> : null}

      <div className="accessGrid">
        <section className="panel" aria-labelledby="grant">
          <header className="panel__head">
            <h2 id="grant" className="panel__title">
              Grant a folder
            </h2>
            <span className="panel__meta">Read-only</span>
          </header>

          <p className="panel__note">
            Point FrontDesk at a folder of Markdown, text, PDFs or scans. It is read on demand and
            never mirrored.
          </p>

          <div className="folderForm">
            <input
              value={path}
              onChange={(event) => setPath(event.target.value)}
              placeholder="/Users/you/Documents/Notes"
              aria-label="Folder path"
            />
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => void browse()}>
              Browse…
            </button>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              disabled={busy || !path.trim()}
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
                    {grant.kind} · {grant.scope}
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
            {!grants.some((grant) => grant.id === 'fixture:desk') ? (
              <li>
                <span className="grantList__body">
                  <strong>FrontDesk sample notes</strong>
                  <em>Not granted · built-in demo notes, no files needed</em>
                </span>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => void restoreFixture()}
                >
                  Restore sample notes
                </button>
              </li>
            ) : null}
            {!grants.length ? <li className="emptyRow">No access granted.</li> : null}
          </ul>
        </section>

        <section className="panel" aria-labelledby="model">
          <header className="panel__head">
            <h2 id="model" className="panel__title">
              Local model
            </h2>
            <span className="panel__meta">GGUF folder</span>
          </header>

          <p className="panel__note">
            Drop a <code>.gguf</code> file into the models folder to add it. The extractive adapter
            is instant and needs no model at all.
          </p>

          <label className="fieldLabel" htmlFor="modeSelect">
            Answer style
          </label>
          <select
            id="modeSelect"
            className="select"
            value={info?.answerMode ?? 'chat'}
            onChange={(event) =>
              void selectMode(event.target.value === 'grounded' ? 'grounded' : 'chat')
            }
          >
            <option value="chat">Assistant — answer freely, cite files when used</option>
            <option value="grounded">Strict citations — refuse when not in files</option>
          </select>

          <label className="fieldLabel" htmlFor="modelSelect">
            Answer adapter
          </label>
          <select
            id="modelSelect"
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

          <div className="modelActions">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={busy || selected === 'extractive'}
              onClick={() => void loadModel()}
            >
              Load / warm model
            </button>
            <span className="modelHint">
              {models.length
                ? `${models.length} GGUF ${models.length === 1 ? 'file' : 'files'} found`
                : 'No GGUF files found'}
            </span>
          </div>

          <dl className="kv kv--tight">
            <div>
              <dt>Models folder</dt>
              <dd className="monoWrap">{info?.modelsDir ?? '—'}</dd>
            </div>
            <div>
              <dt>App data</dt>
              <dd className="monoWrap">{info?.dataDir ?? '—'}</dd>
            </div>
          </dl>
        </section>

        <RuntimePanel />

        <section className="panel panel--inset" aria-labelledby="sources">
          <header className="panel__head">
            <h2 id="sources" className="panel__title">
              In scope right now
            </h2>
            <span className="panel__meta">
              {loading ? 'reading…' : `${sources.length} items`}
            </span>
          </header>

          <ul className="sourceList">
            {sources.map((source) => (
              <li key={source.id}>
                <span className="sourceList__kind">{source.kind}</span>
                <span className="sourceList__body">
                  <strong>{source.title}</strong>
                  <em>{source.location}</em>
                </span>
                <span className="sourceList__when">{when(source.modified)}</span>
              </li>
            ))}
            {!sources.length ? (
              <li className="emptyRow">
                Nothing readable yet. Grant a folder, or keep the sample notes.
              </li>
            ) : null}
          </ul>
        </section>

        <section className="panel panel--inset" aria-labelledby="activity">
          <header className="panel__head">
            <h2 id="activity" className="panel__title">
              Activity
            </h2>
            <span className="panel__meta">Metadata only</span>
          </header>

          <p className="panel__note">
            FrontDesk records that a source was read, never what it said. The log stays on this
            machine.
          </p>

          <div className="modelActions">
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => void loadAudit()}>
              {showAudit ? 'Refresh activity' : 'Show activity'}
            </button>
            {showAudit ? (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => void clearAudit()}>
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
                  <em>{when(entry.at)}</em>
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
