import { useEffect, useRef } from 'react'
import { useUI } from '../store'
import NotebookBook from './NotebookBook'
import './NotebookOverlay.css'

export function NotebookOverlay() {
  const mode = useUI((state) => state.mode)
  const section = useUI((state) => state.section)
  const closeNotebook = useUI((state) => state.closeNotebook)
  const open = mode === 'notebook'
  const closeRef = useRef<HTMLButtonElement>(null)

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
      className="notebookOverlay"
      role="dialog"
      aria-modal="true"
      aria-label="FrontDesk notebook"
      onClick={closeNotebook}
    >
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
