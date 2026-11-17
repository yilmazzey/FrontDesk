import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { SavedItem } from '../types/source'

type SavedValue = {
  items: SavedItem[]
  add: (item: SavedItem) => void
}

const SavedContext = createContext<SavedValue | null>(null)

export function SavedProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<SavedItem[]>([])

  const add = useCallback((item: SavedItem) => {
    setItems((current) => [item, ...current])
  }, [])

  const value = useMemo(() => ({ items, add }), [add, items])
  return <SavedContext.Provider value={value}>{children}</SavedContext.Provider>
}

export function useSaved(): SavedValue {
  const value = useContext(SavedContext)
  if (!value) throw new Error('useSaved must be used inside SavedProvider')
  return value
}
