import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import AskBar from '../components/AskBar'
import NextUpCard from '../components/NextUpCard'
import OpenLoopsCard from '../components/OpenLoopsCard'
import PeoplePanel from '../components/PeoplePanel'
import TimelinePreview from '../components/TimelinePreview'
import { api } from '../lib/ipc'
import { useAccess } from '../state/access'
import type { ManagerSnapshot } from '../types/source'

function shortTitle(value: string) {
  return value.split(' — ')[0]?.trim() || value
}

export default function Dashboard() {
  const { grants, sources, loading } = useAccess()
  const location = useLocation()
  const navigate = useNavigate()
  const [focusSignal, setFocusSignal] = useState(0)
  const [prompt, setPrompt] = useState<{ value: string; id: number } | undefined>()
  const [snapshot, setSnapshot] = useState<ManagerSnapshot | null>(null)
  const [snapshotLoading, setSnapshotLoading] = useState(true)
  const [snapshotError, setSnapshotError] = useState<string | null>(null)
  const now = new Date()
  const calendarConnected = grants.some((grant) => grant.kind === 'calendar')

  function openAsk(question = '') {
    if (question) setPrompt({ value: question, id: Date.now() })
    else setFocusSignal(Date.now())
  }

  useEffect(() => {
    const state = location.state as { focusAsk?: boolean; question?: string } | null
    if (!state?.focusAsk) return
    if (state.question?.trim()) {
      setPrompt({ value: state.question.trim(), id: Date.now() })
    } else {
      setFocusSignal(Date.now())
    }
    navigate('/', { replace: true, state: null })
  }, [location.state, navigate])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'j') {
        event.preventDefault()
        setFocusSignal(Date.now())
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    let active = true
    setSnapshotLoading(true)
    setSnapshotError(null)
    void (async () => {
      try {
        const profile = calendarConnected
          ? await api.getMicrosoftProfile().catch(() => null)
          : null
        const next = await api.managerSnapshot(profile?.displayName)
        if (active) setSnapshot(next)
      } catch (cause) {
        if (active) {
          setSnapshot(null)
          setSnapshotError(cause instanceof Error ? cause.message : String(cause))
        }
      } finally {
        if (active) setSnapshotLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [calendarConnected, sources])

  const suggestions = useMemo(() => {
    const next = snapshot?.nextUp
    const due = snapshot?.people.find((person) => person.due)
    const waiting = snapshot?.openLoops.some((loop) => loop.direction === 'waiting')
    const title = next ? shortTitle(next.source.title) : ''
    const prep =
      title && !/^1:1/i.test(title)
        ? `Prep me for ${title}`
        : 'Prep me for my next 1:1'
    return [
      prep,
      'What did I commit to last week?',
      waiting ? 'What am I waiting on?' : 'Who haven’t I spoken to in a month?',
      due ? `Catch me up on ${due.name}` : 'Who’s due for a catch-up?',
    ].slice(0, 4)
  }, [snapshot])

  return (
    <div className="page">
      <header className="pageHead pageHead--dashboard">
        <p className="eyebrow">
          {now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </header>

      <AskBar focusSignal={focusSignal} prompt={prompt} suggestions={suggestions} />

      {snapshotError ? <p className="notice notice--bad">{snapshotError}</p> : null}

      <div className="managerTop">
        <NextUpCard
          snapshot={snapshot}
          loading={snapshotLoading || loading}
          calendarConnected={calendarConnected}
          onAsk={openAsk}
        />
        <OpenLoopsCard
          snapshot={snapshot}
          loading={snapshotLoading}
          onAsk={openAsk}
        />
      </div>

      <PeoplePanel
        snapshot={snapshot}
        loading={snapshotLoading || loading}
        calendarConnected={calendarConnected}
        onAsk={openAsk}
      />

      <div className="dashboardWide">
        <TimelinePreview sources={sources} />
      </div>
    </div>
  )
}
