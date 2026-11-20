import { useEffect, useState } from 'react'
import { api, inTauri } from '../lib/ipc'
import type { ScreenShareState } from '../types/source'
import {
  previewPrivacy,
  privacyAutoEnabled,
  setPrivacyAutoEnabled,
} from './PrivacyShield'

export default function PrivacySettings() {
  const [auto, setAuto] = useState(() => privacyAutoEnabled())
  const [state, setState] = useState<ScreenShareState>({ sharing: false, apps: [] })

  useEffect(() => {
    if (!inTauri()) return
    let alive = true
    const poll = () => {
      api
        .screenShareState()
        .then((next) => {
          if (alive) setState(next)
        })
        .catch(() => {})
    }
    poll()
    const timer = window.setInterval(poll, 5000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [])

  return (
    <section className="panel" aria-labelledby="privacy">
      <header className="panel__head">
        <h2 id="privacy" className="panel__title">
          Privacy shield
        </h2>
        <span className="panel__meta">
          {state.sharing ? 'Remote access detected' : 'Watching for remote access'}
        </span>
      </header>

      <label className="privateToggle">
        <input
          type="checkbox"
          checked={auto}
          onChange={(event) => {
            const next = event.target.checked
            setAuto(next)
            setPrivacyAutoEnabled(next)
          }}
        />
        <span>
          <strong>Blur FrontDesk during screen sharing</strong>
          <em>
            Covers the whole window when AnyDesk, TeamViewer, RustDesk, macOS Screen
            Sharing, Zoom screen sharing or a similar tool is active.
          </em>
        </span>
      </label>

      <div className="privacyStatus">
        <span
          className={`privacyStatus__dot${state.sharing ? ' is-live' : ''}`}
          aria-hidden="true"
        />
        <span>
          {state.sharing
            ? `Detected: ${state.apps.join(', ')}`
            : inTauri()
              ? 'No remote-access tool detected'
              : 'Detection runs in the desktop app'}
        </span>
      </div>

      <div className="privacyActions">
        <button type="button" className="btn btn--ghost" onClick={previewPrivacy}>
          Preview the blur
        </button>
      </div>

      <p className="panel__note panel__note--quiet">
        Teams, Zoom and Slack are not watched because they run all day. If you share
        from one of them, use the preview button or the shield shortcut to cover the
        window first. The shield never changes what FrontDesk stores.
      </p>
    </section>
  )
}
