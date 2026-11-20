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
import type {
  AnswerMode,
  AppInfo,
  ManagerSnapshot,
  ModelRef,
  SourceGrant,
  SourceRef,
} from '../types/source'

type AccessValue = {
  grants: SourceGrant[]
  sources: SourceRef[]
  models: ModelRef[]
  info: AppInfo | null
  snapshot: ManagerSnapshot | null
  loading: boolean
  snapshotLoading: boolean
  error: string | null
  snapshotError: string | null
  /** Re-read every source, grant and the manager snapshot. */
  resync: () => Promise<void>
  /** Alias kept for settings actions that only need fresh access data. */
  refresh: () => Promise<void>
  grantFolder: (path: string) => Promise<void>
  grantFixture: () => Promise<void>
  revoke: (id: string) => Promise<void>
  selectModel: (id: string | null) => Promise<void>
  selectMode: (mode: AnswerMode) => Promise<void>
  warmModel: (id: string) => Promise<string>
}

const AccessContext = createContext<AccessValue | null>(null)

export function AccessProvider({ children }: { children: ReactNode }) {
  const [grants, setGrants] = useState<SourceGrant[]>([])
  const [sources, setSources] = useState<SourceRef[]>([])
  const [models, setModels] = useState<ModelRef[]>([])
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [snapshot, setSnapshot] = useState<ManagerSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [snapshotLoading, setSnapshotLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [snapshotError, setSnapshotError] = useState<string | null>(null)

  const resync = useCallback(async () => {
    setLoading(true)
    setSnapshotLoading(true)
    try {
      const [nextGrants, nextSources, nextModels, nextInfo] = await Promise.all([
        api.listGrants(),
        api.listSources(),
        api.listModels(),
        api.appInfo(),
      ])
      setGrants(nextGrants)
      setSources(nextSources)
      setModels(nextModels)
      setInfo(nextInfo)
      setError(null)

      // Keep the last good snapshot if the live scan fails; navigation must
      // never blank the dashboard while the app is open.
      try {
        const calendarConnected = nextGrants.some(
          (grant) => grant.kind === 'calendar',
        )
        const profile = calendarConnected
          ? await api.getMicrosoftProfile().catch(() => null)
          : null
        const nextSnapshot = await api.managerSnapshot(profile?.displayName)
        setSnapshot(nextSnapshot)
        setSnapshotError(null)
      } catch (cause) {
        setSnapshotError(cause instanceof Error ? cause.message : String(cause))
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
      setSnapshotLoading(false)
    }
  }, [])

  useEffect(() => {
    void resync()
  }, [resync])

  const grantFolder = useCallback(
    async (path: string) => {
      await api.grantFolder(path)
      await resync()
    },
    [resync],
  )

  const grantFixture = useCallback(async () => {
    await api.grantFixture()
    await resync()
  }, [resync])

  const revoke = useCallback(
    async (id: string) => {
      await api.revokeGrant(id)
      await resync()
    },
    [resync],
  )

  const selectModel = useCallback(async (id: string | null) => {
    const next = await api.selectModel(id)
    setInfo(next)
  }, [])

  const selectMode = useCallback(async (mode: AnswerMode) => {
    const next = await api.selectMode(mode)
    setInfo(next)
  }, [])

  const warmModel = useCallback(async (id: string) => {
    const status = await api.warmModel(id)
    const next = await api.appInfo()
    setInfo(next)
    return status
  }, [])

  const value = useMemo<AccessValue>(
    () => ({
      grants,
      sources,
      models,
      info,
      snapshot,
      loading,
      snapshotLoading,
      error,
      snapshotError,
      resync,
      refresh: resync,
      grantFolder,
      grantFixture,
      revoke,
      selectModel,
      selectMode,
      warmModel,
    }),
    [
      grants,
      sources,
      models,
      info,
      snapshot,
      loading,
      snapshotLoading,
      error,
      snapshotError,
      resync,
      grantFolder,
      grantFixture,
      revoke,
      selectModel,
      selectMode,
      warmModel,
    ],
  )

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>
}

export function useAccess(): AccessValue {
  const value = useContext(AccessContext)
  if (!value) throw new Error('useAccess must be used inside AccessProvider')
  return value
}
