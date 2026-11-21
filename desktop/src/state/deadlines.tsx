import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type Deadline = {
  id: string
  title: string
  dueAt: string
  createdAt: string
  source?: string
}

export type NewDeadline = {
  title: string
  dueAt: string
  source?: string
}

const KEY = 'frontdesk.deadlines'

function read(): Deadline[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is Deadline =>
        Boolean(item) &&
        typeof item.id === 'string' &&
        typeof item.title === 'string' &&
        typeof item.dueAt === 'string' &&
        !Number.isNaN(Date.parse(item.dueAt)),
    )
  } catch {
    return []
  }
}

function write(items: Deadline[]) {
  localStorage.setItem(KEY, JSON.stringify(items))
}

type DeadlineValue = {
  deadlines: Deadline[]
  add: (input: NewDeadline) => Deadline
  remove: (id: string) => void
}

const DeadlineContext = createContext<DeadlineValue | null>(null)

export function DeadlineProvider({ children }: { children: ReactNode }) {
  const [deadlines, setDeadlines] = useState<Deadline[]>(read)

  useEffect(() => {
    const sync = () => setDeadlines(read())
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  const add = useCallback((input: NewDeadline) => {
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const deadline: Deadline = {
      id,
      title: input.title.trim() || 'Untitled deadline',
      dueAt: input.dueAt,
      createdAt: new Date().toISOString(),
      source: input.source,
    }
    setDeadlines((current) => {
      const next = [...current, deadline]
      write(next)
      return next
    })
    return deadline
  }, [])

  const remove = useCallback((id: string) => {
    setDeadlines((current) => {
      const next = current.filter((deadline) => deadline.id !== id)
      write(next)
      return next
    })
  }, [])

  const value = useMemo(() => ({ deadlines, add, remove }), [add, deadlines, remove])
  return <DeadlineContext.Provider value={value}>{children}</DeadlineContext.Provider>
}

export function useDeadlines(): DeadlineValue {
  const value = useContext(DeadlineContext)
  if (!value) throw new Error('useDeadlines must be used inside DeadlineProvider')
  return value
}
