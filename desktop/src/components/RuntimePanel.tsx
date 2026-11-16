import { useCallback, useEffect, useState } from 'react'
import { api, inTauri } from '../lib/ipc'
import type { RuntimeKind, RuntimeProgress, RuntimeStatus } from '../types/source'

function size(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `~${mb} MB`
}

/**
 * Shows whether the optional native helpers are present and can install them
 * without sending the user to a terminal (macOS/Homebrew today; a clear
 * command everywhere else).
 */
export default function RuntimePanel() {
  const [status, setStatus] = useState<RuntimeStatus | null>(null)
  const [progress, setProgress] = useState<RuntimeProgress | null>(null)
  const [busy, setBusy] = useState<RuntimeKind | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setStatus(await api.runtimeStatus())
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    let stop: (() => void) | undefined
    let cancelled = false
    void api
      .onRuntimeProgress((next) => {
        setProgress(next)
        if (next.phase === 'done') void refresh()
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

  async function install(kind: RuntimeKind) {
    if (!inTauri()) {
      setNotice('Runtime installation happens in the desktop app.')
      return
    }
    setBusy(kind)
    setNotice(null)
    setProgress({ kind, phase: 'download', message: 'Starting…', downloaded: 0, total: 0 })
    try {
      const next = await api.installRuntime(kind)
      setStatus(next)
      setNotice(
        kind === 'ocr'
          ? 'OCR helpers are ready.'
          : 'llama-server is installed. Ask a question to use it.',
      )
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(null)
      setProgress(null)
    }
  }

  const pct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
      : null

  return (
    <section className="panel" aria-labelledby="runtime">
      <header className="panel__head">
        <h2 id="runtime" className="panel__title">
          Local runtime
        </h2>
        <span className="panel__meta">{status?.platform ?? 'desktop only'}</span>
      </header>

      <p className="panel__note">
        The app can install its own helpers into the app-data folder — no Homebrew step first.
        Everything stays on this machine.
      </p>

      {notice ? <p className="notice">{notice}</p> : null}

      {progress ? (
        <p className="notice">
          {progress.message}
          {pct !== null ? ` · ${pct}%` : ''}
        </p>
      ) : null}

      <div className="connectRow">
        <span className="connectRow__mark" aria-hidden="true">
          AI
        </span>
        <span className="connectRow__body">
          <strong>
            llama-server
            {status?.llamaInstalled ? (
              <span className="tag" style={{ marginInlineStart: 8 }}>
                ready
              </span>
            ) : (
              <span className="tag" style={{ marginInlineStart: 8 }}>
                missing
              </span>
            )}
          </strong>
          <em>
            {status?.llamaInstalled
              ? status.llamaVersion ?? status.llamaPath ?? 'installed'
              : `llama.cpp ${status?.llamaTag ?? ''} · ${size(status?.llamaSizeMb ?? 16)} download`}
          </em>
        </span>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          disabled={!status || status.llamaInstalled || busy !== null || !status.llamaAsset}
          onClick={() => void install('llama')}
        >
          {busy === 'llama' ? 'Installing…' : status?.llamaInstalled ? 'Installed' : 'Install'}
        </button>
      </div>

      {status && !status.llamaAsset ? (
        <p className="panel__note">
          No official llama.cpp build for this platform. Use your package manager or build it from
          source.
        </p>
      ) : null}

      <ul className="grantList">
        {status?.tools.map((tool) => (
          <li key={tool.key}>
            <span className="grantList__body">
              <strong>
                {tool.label}
                <span className="tag" style={{ marginInlineStart: 8 }}>
                  {tool.installed ? 'ready' : 'missing'}
                </span>
              </strong>
              <em>{tool.detail ?? (tool.installed ? 'on PATH' : 'needed for scans')}</em>
            </span>
          </li>
        ))}
      </ul>

      <div className="modelActions">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          disabled={
            !status || busy !== null || !status.tools.some((tool) => !tool.installed)
          }
          onClick={() => void install('ocr')}
        >
          {busy === 'ocr' ? 'Installing OCR…' : 'Install OCR helpers'}
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          disabled={!status || busy !== null}
          onClick={() => void refresh()}
        >
          Refresh
        </button>
      </div>

      {status && !status.canAutoInstallOcr ? (
        <p className="panel__note monoWrap">{status.ocrHint}</p>
      ) : (
        <p className="panel__note">
          PDFs are read in-process, so text PDFs work without Poppler. OCR helpers are only needed
          for scans and images.
        </p>
      )}
    </section>
  )
}
