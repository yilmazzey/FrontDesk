import { useEffect, useState } from 'react'
import DashboardAskDock from '../components/DashboardAskDock'
import DailyAgenda from '../components/DailyAgenda'
import TeamPanel from '../components/TeamPanel'
import { useAccess } from '../state/access'

export default function Dashboard() {
  const { grants, sources, loading } = useAccess()
  const [askOpen, setAskOpen] = useState(false)
  const [askSeed, setAskSeed] = useState('')
  const now = new Date()
  const calendarConnected = grants.some((grant) => grant.kind === 'calendar')

  const openAsk = (question = '') => {
    setAskSeed(question)
    setAskOpen(true)
  }

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
      <header className="pageHead">
        <div>
          <p className="eyebrow">
            {now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <h1 className="pageTitle">
            Your day, <em>in one place.</em>
          </h1>
          <p className="pageLede">
            A manager&apos;s second brain: the meetings ahead, the people in them, and everything
            you already know.
          </p>
          <p className="eventTag">Pfizer &amp; Newpage Solutions Hackathon Challenge</p>
        </div>

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

      <DashboardAskDock
        open={askOpen}
        initialQuestion={askSeed}
        onClose={() => setAskOpen(false)}
      />
    </div>
  )
}
