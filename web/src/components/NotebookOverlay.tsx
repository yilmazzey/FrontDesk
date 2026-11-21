import { useEffect, useRef, useState } from 'react'
import { useUI } from '../store'
import NotebookBook from './NotebookBook'
import { useScreenshotGuard } from '../hooks/useScreenshotGuard'
import './NotebookOverlay.css'

export function NotebookOverlay() {
  const mode = useUI((state) => state.mode)
  const section = useUI((state) => state.section)
  const closeNotebook = useUI((state) => state.closeNotebook)
  const open = mode === 'notebook'
  const closeRef = useRef<HTMLButtonElement>(null)
  const [manualHidden, setManualHidden] = useState(false)
  const { guarded, release } = useScreenshotGuard(open)
  const photosHidden = guarded || manualHidden

  useEffect(() => {
    if (open) return
    setManualHidden(false)
    release()
  }, [open, release])

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeNotebook()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, closeNotebook])

  if (!open) return null

  return (
    <div
      className={`notebookOverlay${photosHidden ? ' is-photos-hidden' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="FrontDesk notebook"
      onClick={closeNotebook}
    >
      <button
        type="button"
        className="notebookOverlay__privacy"
        onClick={(event) => {
          event.stopPropagation()
          if (photosHidden) {
            setManualHidden(false)
            release()
          } else {
            setManualHidden(true)
          }
        }}
        aria-pressed={manualHidden}
        title="Blur the profile photos, for example before taking a screenshot"
      >
        {photosHidden ? 'Show photos' : 'Hide photos'}
      </button>
      {guarded && !manualHidden ? (
        <span className="notebookOverlay__guard" role="status">
          Photos hidden
        </span>
      ) : null}
      <button
        type="button"
        className="notebookOverlay__close"
        ref={closeRef}
        onClick={(event) => {
          event.stopPropagation()
          closeNotebook()
        }}
      >
        Close <span aria-hidden="true">×</span>
      </button>
      <div className="notebookOverlay__book" onClick={(event) => event.stopPropagation()}>
        <NotebookBook section={section} />
      </div>
    </div>
  )
}
