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
import type { AppInfo, ModelRef, SourceGrant, SourceRef } from '../types/source'

type AccessValue = {
  grants: SourceGrant[]
  sources: SourceRef[]
  models: ModelRef[]
  info: AppInfo | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  grantFolder: (path: string) => Promise<void>
  grantFixture: () => Promise<void>
  revoke: (id: string) => Promise<void>
  selectModel: (id: string | null) => Promise<void>
  warmModel: (id: string) => Promise<string>
}

const AccessContext = createContext<AccessValue | null>(null)

export function AccessProvider({ children }: { children: ReactNode }) {
  const [grants, setGrants] = useState<SourceGrant[]>([])
  const [sources, setSources] = useState<SourceRef[]>([])
  const [models, setModels] = useState<ModelRef[]>([])
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [refresh])

  const grantFolder = useCallback(
    async (path: string) => {
      await api.grantFolder(path)
      await refresh()
    },
    [refresh],
  )

  const grantFixture = useCallback(async () => {
    await api.grantFixture()
    await refresh()
  }, [refresh])

  const revoke = useCallback(
    async (id: string) => {
      await api.revokeGrant(id)
      await refresh()
    },
    [refresh],
  )

  const selectModel = useCallback(
    async (id: string | null) => {
      const next = await api.selectModel(id)
      setInfo(next)
    },
    [],
  )

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
      loading,
      error,
      refresh,
      grantFolder,
      grantFixture,
      revoke,
      selectModel,
      warmModel,
    }),
    [
      grants,
      sources,
      models,
      info,
      loading,
      error,
      refresh,
      grantFolder,
      grantFixture,
      revoke,
      selectModel,
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
