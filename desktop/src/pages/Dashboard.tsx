import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import DashboardAskDock from '../components/DashboardAskDock'
import DailyAgenda from '../components/DailyAgenda'
import TeamPanel from '../components/TeamPanel'
import TimelinePreview from '../components/TimelinePreview'
import { useAccess } from '../state/access'

export default function Dashboard() {
  const { grants, sources, loading } = useAccess()
  const location = useLocation()
  const navigate = useNavigate()
  const [askOpen, setAskOpen] = useState(false)
  const [askSeed, setAskSeed] = useState('')
  const now = new Date()
  const calendarConnected = grants.some((grant) => grant.kind === 'calendar')

  const openAsk = (question = '') => {
    setAskSeed(question)
    setAskOpen(true)
  }

  useEffect(() => {
    const state = location.state as { askOpen?: boolean; question?: string } | null
    if (!state?.askOpen) return
    setAskSeed(state.question ?? '')
    setAskOpen(true)
    navigate('/', { replace: true, state: null })
  }, [location.state, navigate])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'j') {
        event.preventDefault()
        setAskSeed('')
        setAskOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="page">
      <header className="pageHead pageHead--dashboard">
        <p className="eyebrow">
          {now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>

        <button
          type="button"
          className="askDockTrigger"
          onClick={() => openAsk()}
          aria-label="Ask FrontDesk"
          title="Ask FrontDesk (⌘J)"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4.5 5.5h15v10h-9l-4 3v-3h-2v-10ZM8.5 9.5h7M8.5 12.5h4.5" />
          </svg>
        </button>
      </header>

      <div className="dashboardGrid">
        <DailyAgenda
          sources={sources}
          loading={loading}
          calendarConnected={calendarConnected}
          onAsk={openAsk}
        />
        <TeamPanel
          sources={sources}
          loading={loading}
          calendarConnected={calendarConnected}
          onAsk={openAsk}
        />
      </div>

      <TimelinePreview sources={sources} />

      <DashboardAskDock
        open={askOpen}
        initialQuestion={askSeed}
        onClose={() => setAskOpen(false)}
      />
    </div>
  )
}
