import { useEffect, useState } from 'react'
import PathLink from './PathLink'
import { api, inTauri } from '../lib/ipc'
import { useAccess } from '../state/access'
import { useSaved } from '../state/saved'
import type { SavedClassification } from '../types/source'

const CLASSES: Array<{ id: SavedClassification; label: string; hint: string }> = [
  { id: 'briefing', label: 'Briefing', hint: 'A concise summary to read later' },
  { id: 'roadmap', label: 'Roadmap', hint: 'Plans, phases and next steps' },
  { id: 'todo', label: 'Todo', hint: 'Actions and follow-ups' },
  { id: 'decision', label: 'Decision', hint: 'What was decided and why' },
  { id: 'reference', label: 'Reference', hint: 'Background worth keeping' },
]

type Props = {
  open: boolean
  title: string
  body: string
  sources: string[]
  onClose: () => void
}

export default function SaveAnswerDialog({ open, title, body, sources, onClose }: Props) {
  const { add } = useSaved()
  const { info, refresh } = useAccess()
  const [folder, setFolder] = useState('')
  const [classification, setClassification] = useState<SavedClassification>('briefing')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    if (!folder && info?.savedFolder) setFolder(info.savedFolder)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [folder, info?.savedFolder, onClose, open])

  if (!open) return null

  async function chooseFolder() {
    if (!inTauri()) {
      setError('The folder picker needs the desktop app.')
      return
    }
    const { open: openDialog } = await import('@tauri-apps/plugin-dialog')
    const picked = await openDialog({ directory: true, multiple: false })
    if (typeof picked === 'string') setFolder(picked)
  }

  async function save() {
    if (!folder) {
      setError('Choose a folder first.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const savedPath = await api.saveAnswer({
        folder,
        classification,
        title: title.trim() || 'FrontDesk answer',
        body,
        sources,
      })
      add({
        id: savedPath,
        path: savedPath,
        title: title.trim() || 'FrontDesk answer',
        classification,
        savedAt: new Date().toISOString(),
        body,
        sources,
      })
      await refresh()
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="saveDialog" role="dialog" aria-modal="true" aria-label="Save answer">
      <div className="saveDialog__panel">
        <header className="saveDialog__head">
          <div>
            <p className="eyebrow">Save answer</p>
            <h2>Keep this where you can find it.</h2>
          </div>
          <button type="button" className="saveDialog__close" onClick={onClose}>
            Esc
          </button>
        </header>

        <p className="panel__note">
          Pick a folder you already own. FrontDesk writes one Markdown file there and keeps no
          copy of its own.
        </p>

        <button type="button" className="btn btn--ghost btn--sm" onClick={() => void chooseFolder()}>
          {folder ? 'Change folder' : 'Choose folder'}
        </button>
        {folder ? (
          <p className="panel__note monoWrap">
            <PathLink path={folder}>{folder}</PathLink>
          </p>
        ) : null}

        <div className="saveDialog__classes" role="group" aria-label="Classification">
          {CLASSES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`saveChoice${classification === item.id ? ' is-on' : ''}`}
              onClick={() => setClassification(item.id)}
              aria-pressed={classification === item.id}
            >
              <strong>{item.label}</strong>
              <span>{item.hint}</span>
            </button>
          ))}
        </div>

        {error ? <p className="notice notice--bad">{error}</p> : null}

        <div className="saveDialog__actions">
          <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save Markdown'}
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
