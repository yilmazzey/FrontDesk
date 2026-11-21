import { useEffect, useState } from 'react'
import { api, inTauri } from '../lib/ipc'
import type { ScreenShareState } from '../types/source'

const AUTO_KEY = 'frontdesk.privacyAuto'

export function privacyAutoEnabled() {
  try {
    return localStorage.getItem(AUTO_KEY) !== 'off'
  } catch {
    return true
  }
}

export function setPrivacyAutoEnabled(enabled: boolean) {
  try {
    localStorage.setItem(AUTO_KEY, enabled ? 'on' : 'off')
  } catch {
    // Storage can be unavailable in hardened webviews; the shield still works
    // for the current session.
  }
  window.dispatchEvent(new Event('frontdesk-privacy-settings'))
}

export function previewPrivacy() {
  window.dispatchEvent(new Event('frontdesk-privacy-preview'))
}

/**
 * Screen-share privacy shield.
 *
 * macOS does not expose a public "am I being shared?" API to every app, so we
 * watch for remote-access tools (AnyDesk, TeamViewer, RustDesk, macOS Screen
 * Sharing, …) and blur the whole window while one is running. Microsoft Teams
 * is watched only while a meeting or sharing window is open; it runs all day,
 * so the process alone is not a signal. The overlay has an always-available
 * unblur action, and Settings has a preview button.
 */
export default function PrivacyShield() {
  const [state, setState] = useState<ScreenShareState>({ sharing: false, apps: [] })
  const [manual, setManual] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [auto, setAuto] = useState(() => privacyAutoEnabled())

  useEffect(() => {
    if (!inTauri()) return
    let alive = true
    const poll = () => {
      api
        .screenShareState()
        .then((next) => {
          if (alive) setState(next)
        })
        .catch(() => {
          // Detection is best-effort; a failure must never block the app.
        })
    }
    poll()
    const timer = window.setInterval(poll, 3000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    const onSettings = () => setAuto(privacyAutoEnabled())
    const onPreview = () => {
      setManual(true)
      setDismissed(false)
    }
    window.addEventListener('frontdesk-privacy-settings', onSettings)
    window.addEventListener('frontdesk-privacy-preview', onPreview)
    return () => {
      window.removeEventListener('frontdesk-privacy-settings', onSettings)
      window.removeEventListener('frontdesk-privacy-preview', onPreview)
    }
  }, [])

  // A new sharing session should always start protected again.
  useEffect(() => {
    if (!state.sharing) setDismissed(false)
  }, [state.sharing])

  const active = manual || (auto && state.sharing)

  if (!active) return null

  if (dismissed) {
    return (
      <button
        type="button"
        className="privacyPill"
        onClick={() => setDismissed(false)}
        title="Turn the privacy blur back on"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3 4.5 6v5.3c0 4.6 3.2 8.8 7.5 9.9 4.3-1.1 7.5-5.3 7.5-9.9V6L12 3Z" />
        </svg>
        Privacy blur off · re-blur
      </button>
    )
  }

  const apps = state.apps.length ? state.apps.join(', ') : 'Screen sharing'

  return (
    <div className="privacyShield" role="alertdialog" aria-modal="true" aria-live="assertive">
      <div className="privacyShield__card">
        <span className="privacyShield__badge">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3 4.5 6v5.3c0 4.6 3.2 8.8 7.5 9.9 4.3-1.1 7.5-5.3 7.5-9.9V6L12 3Z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
          Privacy
        </span>
        <h2>FrontDesk is hidden while someone can see your screen</h2>
        <p>
          <strong>{apps}</strong> appears to be active. The window is blurred so
          mail, notes and answers cannot leak into a call or remote session.
        </p>
        <div className="privacyShield__actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              setDismissed(true)
              setManual(false)
            }}
          >
            Unblur this session
          </button>
          {manual ? (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setManual(false)
                setDismissed(false)
              }}
            >
              End preview
            </button>
          ) : null}
        </div>
        <p className="privacyShield__note">
          The blur returns automatically the next time a share or Teams meeting
          starts. Turn it off in Settings → Privacy.
        </p>
      </div>
    </div>
  )
}
