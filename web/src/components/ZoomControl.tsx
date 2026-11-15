import { useEffect } from 'react'
import { useUI } from '../store'

/**
 * Small, quiet zoom control for the 3D desk. The desk is a model, not a
 * screenshot, so it can be pushed in and pulled back without changing the
 * page layout. Trackpad pinch and ⌘/Ctrl + wheel also work.
 */
export function ZoomControl() {
  const mode = useUI((s) => s.mode)
  const zoom = useUI((s) => s.zoom)
  const nudgeZoom = useUI((s) => s.nudgeZoom)
  const setZoom = useUI((s) => s.setZoom)

  useEffect(() => {
    if (mode !== 'desk') return

    const onWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      event.preventDefault()
      nudgeZoom(event.deltaY > 0 ? -0.06 : 0.06)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === '+' || event.key === '=') nudgeZoom(0.08)
      if (event.key === '-' || event.key === '_') nudgeZoom(-0.08)
      if (event.key === '0') setZoom(1)
    }

    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKey)
    }
  }, [mode, nudgeZoom, setZoom])

  if (mode !== 'desk') return null

  return (
    <div className="deskZoom" role="group" aria-label="Desk zoom">
      <button
        type="button"
        className="deskZoom__btn"
        onClick={() => nudgeZoom(-0.1)}
        aria-label="Zoom out"
        disabled={zoom <= 0.79}
      >
        −
      </button>
      <button
        type="button"
        className="deskZoom__reset"
        onClick={() => setZoom(1)}
        aria-label="Reset zoom"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        className="deskZoom__btn"
        onClick={() => nudgeZoom(0.1)}
        aria-label="Zoom in"
        disabled={zoom >= 2.09}
      >
        +
      </button>
    </div>
  )
}
