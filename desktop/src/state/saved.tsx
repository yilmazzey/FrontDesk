import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { api } from '../lib/ipc'
import type { SavedItem } from '../types/source'

type SavedValue = {
  items: SavedItem[]
  loading: boolean
  add: (item: SavedItem) => void
  refresh: () => Promise<void>
}

const SavedContext = createContext<SavedValue | null>(null)

export function SavedProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<SavedItem[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      setItems(await api.listSaved())
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const add = useCallback((item: SavedItem) => {
    setItems((current) => [item, ...current.filter((existing) => existing.id !== item.id)])
  }, [])

  const value = useMemo(() => ({ items, loading, add, refresh }), [add, items, loading, refresh])
  return <SavedContext.Provider value={value}>{children}</SavedContext.Provider>
}

export function useSaved(): SavedValue {
  const value = useContext(SavedContext)
  if (!value) throw new Error('useSaved must be used inside SavedProvider')
  return value
}
