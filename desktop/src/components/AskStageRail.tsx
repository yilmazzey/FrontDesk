import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/ipc'

const STAGES = [
  { key: 'ingest', label: 'Ingest' },
  { key: 'extract', label: 'Extract' },
  { key: 'link', label: 'Link' },
  { key: 'plan', label: 'Plan' },
  { key: 'brief', label: 'Brief' },
] as const

export function useAskStages() {
  const [active, setActive] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let stop: (() => void) | undefined
    let cancelled = false
    void api
      .onAskStage((stage) => {
        setDone(false)
        setActive(stage)
      })
      .then((unlisten) => {
        if (cancelled) unlisten()
        else stop = unlisten
      })
    return () => {
      cancelled = true
      stop?.()
    }
  }, [])

  const start = useCallback(() => {
    setDone(false)
    setActive('ingest')
  }, [])

  const finish = useCallback(() => {
    setDone(true)
    setActive(null)
  }, [])

  return { active, done, start, finish }
}

type Props = {
  active: string | null
  done: boolean
}

export default function AskStageRail({ active, done }: Props) {
  const activeIndex = done ? STAGES.length : STAGES.findIndex((stage) => stage.key === active)

  return (
    <ol className="askStages" aria-label="Answer stages" aria-live="polite">
      {STAGES.map((stage, index) => {
        const state = done || index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'pending'
        return (
          <li key={stage.key} className={`askStages__step is-${state}`}>
            <span className="askStages__dot" aria-hidden="true" />
            <span>{stage.label}</span>
          </li>
        )
      })}
    </ol>
  )
}
