import { useCallback, useEffect, useState } from 'react'
import type { OpenLoop } from '../types/source'

export type LoopDismissReason = 'done' | 'drop'

type Entry = {
  at: string
  reason: LoopDismissReason
}

type Store = Record<string, Entry>

const KEY = 'frontdesk.dismissedLoops'
const listeners = new Set<() => void>()

function read(): Store {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Store
  } catch {
    return {}
  }
}

function write(next: Store) {
  localStorage.setItem(KEY, JSON.stringify(next))
  listeners.forEach((listener) => listener())
}

export function loopKey(loop: Pick<OpenLoop, 'text' | 'direction' | 'person'>): string {
  return `${loop.direction}|${(loop.person ?? '').toLowerCase()}|${loop.text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()}`
}

export function useDismissedLoops() {
  const [store, setStore] = useState<Store>(read)

  useEffect(() => {
    const sync = () => setStore(read())
    listeners.add(sync)
    window.addEventListener('storage', sync)
    return () => {
      listeners.delete(sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const dismiss = useCallback((loop: OpenLoop, reason: LoopDismissReason) => {
    const next = {
      ...read(),
      [loopKey(loop)]: { at: new Date().toISOString(), reason },
    }
    setStore(next)
    write(next)
  }, [])

  const restoreAll = useCallback(() => {
    setStore({})
    write({})
  }, [])

  return {
    dismissed: new Set(Object.keys(store)),
    count: Object.keys(store).length,
    dismiss,
    restoreAll,
  }
}
