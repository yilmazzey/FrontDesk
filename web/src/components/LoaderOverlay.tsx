import { useEffect, useState } from 'react'
import { useProgress } from '@react-three/drei'
import { site } from '../config'
import { useUI } from '../store'

const HINTS = [
  'Dusting the monitor',
  'Warming up the lamp',
  'Squaring the notebook',
  'Clearing the desk',
  'Adjusting the light',
]

export function LoaderOverlay() {
  const { progress } = useProgress()
  const ready = useUI((s) => s.ready)
  const [hidden, setHidden] = useState(false)
  const [hint, setHint] = useState(0)

  const done = ready && progress >= 100

  useEffect(() => {
    if (done) return
    const timer = window.setInterval(() => setHint((h) => (h + 1) % HINTS.length), 2100)
    return () => window.clearInterval(timer)
  }, [done])

  useEffect(() => {
    if (!done) return
    const timer = window.setTimeout(() => setHidden(true), 760)
    return () => window.clearTimeout(timer)
  }, [done])

  if (hidden) return null

  return (
    <div className={`loader${done ? ' is-done' : ''}`} aria-hidden={done}>
      <div className="loader__inner">
        <div className="loader__mark">
          {site.wordmark}<span>.</span>
        </div>

        <p className="loader__label">Preparing the desk</p>

        <div className="loader__bar" role="progressbar" aria-valuenow={Math.round(progress)}>
          <span style={{ transform: `scaleX(${Math.max(progress / 100, 0.02)})` }} />
        </div>

        <p className="loader__meta">
          <span>{Math.round(progress)}%</span>
          <span className="loader__sep">·</span>
          <span>{HINTS[hint]}</span>
        </p>
      </div>
    </div>
  )
}
