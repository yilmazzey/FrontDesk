import { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { api, inTauri } from '../lib/ipc'
import { useAccess } from '../state/access'
import { previewPrivacy } from '../components/PrivacyShield'
import LineSidebar from '../components/LineSidebar'

const nav = [
  { to: '/', label: 'Dashboard', end: true, glyph: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z' },
  { to: '/timeline', label: 'Timeline', end: false, glyph: 'M12 4.2a7.8 7.8 0 1 0 0 15.6 7.8 7.8 0 0 0 0-15.6ZM12 8v4.4l3 1.8' },
  { to: '/loops', label: 'Open loops', end: false, glyph: 'M4 12a8 8 0 0 1 13.7-5.7M20 4v5h-5M20 12a8 8 0 0 1-13.7 5.7M4 20v-5h5' },
  { to: '/people', label: 'People', end: false, glyph: 'M12 6.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM19 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM10.7 5.2 6.4 15M13.3 5.2l4.3 9.8M7.5 17.5h9' },
  { to: '/saved', label: 'Saved', end: false, glyph: 'M6 4h12v16l-6-4-6 4V4Z' },
  { to: '/search', label: 'Search', end: false, glyph: 'M11 4.2a6.8 6.8 0 1 0 0 13.6 6.8 6.8 0 0 0 0-13.6ZM16 16l4 4' },
  { to: '/settings', label: 'Settings', end: false, glyph: 'M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2ZM12 3v2.2M12 18.8V21M4.6 7.8l1.9 1.1M17.5 15.1l1.9 1.1M4.6 16.2l1.9-1.1M17.5 8.9l1.9-1.1' },
]

const titles: Record<string, string> = {
  '/': 'Dashboard',
  '/timeline': 'Timeline',
  '/loops': 'Open loops',
  '/people': 'People graph',
  '/saved': 'Saved',
  '/search': 'Search',
  '/settings': 'Settings',
}

export function AppShell() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { info, models, grants, resync } = useAccess()
  const [theme, setTheme] = useState<'dark' | 'light'>(
    () => (localStorage.getItem('frontdesk.theme') as 'dark' | 'light') || 'dark',
  )
  const [core, setCore] = useState<'checking' | 'online' | 'browser'>('checking')
  const [syncing, setSyncing] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem('frontdesk.sidebar') === 'collapsed',
  )

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    localStorage.setItem('frontdesk.theme', theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem('frontdesk.sidebar', sidebarCollapsed ? 'collapsed' : 'open')
  }, [sidebarCollapsed])

  useEffect(() => {
    if (!inTauri()) {
      setCore('browser')
      return
    }
    document.documentElement.dataset.runtime = 'tauri'
    api
      .ping()
      .then(() => setCore('online'))
      .catch(() => setCore('browser'))
  }, [])

  // The menu-bar/tray icon asks the frontend to switch routes. The backend
  // shows and focuses the window first, then emits one of these events.
  useEffect(() => {
    if (!inTauri()) return
    let cancelled = false
    let unlisten: Array<() => void> = []
    void import('@tauri-apps/api/event').then(async ({ listen }) => {
      const offAsk = await listen('frontdesk-open-ask', () =>
        navigate('/', { state: { focusAsk: true, at: Date.now() } }),
      )
      const offQuestion = await listen<string>('frontdesk-open-question', (event) => {
        const question = typeof event.payload === 'string' ? event.payload.trim() : ''
        navigate('/', {
          state: { focusAsk: true, question: question || undefined, at: Date.now() },
        })
      })
      const offHome = await listen('frontdesk-open-home', () => navigate('/'))
      if (cancelled) {
        offAsk()
        offQuestion()
        offHome()
      } else {
        unlisten = [offAsk, offQuestion, offHome]
      }
    })
    return () => {
      cancelled = true
      unlisten.forEach((off) => off())
    }
  }, [navigate])

  // ⌘K / Ctrl-K jumps to search, the way a desktop app should.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        navigate('/search')
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === 'p'
      ) {
        event.preventDefault()
        previewPrivacy()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  const activeIndex = Math.max(
    0,
    nav.findIndex((item) =>
      item.end
        ? pathname === item.to
        : pathname === item.to || pathname.startsWith(`${item.to}/`),
    ),
  )

  const selected = info?.selectedModel
    ? models.find((model) => model.id === info.selectedModel)?.name ?? info.selectedModel
    : 'Extractive'

  return (
    <div className={`app${sidebarCollapsed ? ' app--rail' : ''}`}>
      <div className="windowBar" aria-hidden="true">
        <div className="windowBar__drag" data-tauri-drag-region />
      </div>

      <aside className="sidebar">
        <div className="sidebar__brand">
          <span className="sidebar__dot" aria-hidden="true" />
          <span className="sidebar__word">FrontDesk</span>
          <span className="sidebar__tag">desktop</span>
        </div>

        <nav
          className="sidebar__nav"
          aria-label="Primary"
        >
          <LineSidebar
            items={nav.map((item) => item.label)}
            icons={nav.map((item) => (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d={item.glyph} />
              </svg>
            ))}
            activeIndex={activeIndex}
            accentColor="var(--amber)"
            textColor="var(--ink-faint)"
            markerColor="var(--line-strong)"
            proximityRadius={92}
            maxShift={0}
            markerLength={26}
            markerGap={4}
            itemGap={16}
            fontSize={0.82}
            smoothing={120}
            onItemClick={(index) => navigate(nav[index].to)}
          />
        </nav>

        <div className="sidebar__foot">
          <div className="modelCard">
            <span className="modelCard__label">Local model</span>
            <strong className="modelCard__value">{selected}</strong>
            <span className="modelCard__note">
              {core === 'online'
                ? 'Local core · online'
                : core === 'browser'
                  ? 'Browser preview · no files'
                  : 'Checking the local core…'}
            </span>
          </div>

          <div className="sidebar__grants">
            {grants.length} {grants.length === 1 ? 'grant' : 'grants'} active
          </div>

          <button
            type="button"
            className="sidebar__rail"
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!sidebarCollapsed}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={sidebarCollapsed ? 'M9 5l7 7-7 7' : 'M15 5l-7 7 7 7'} />
            </svg>
            <span className="sidebar__railText">Collapse sidebar</span>
          </button>

          <button
            type="button"
            className="themeSwitch"
            onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <svg className="themeSwitch__icon" viewBox="0 0 24 24" aria-hidden="true">
              {theme === 'dark' ? (
                <>
                  <circle cx="12" cy="12" r="4.2" />
                  <path d="M12 3.2v2.1M12 18.7v2.1M4.9 4.9l1.5 1.5M17.6 17.6l1.5 1.5M3.2 12h2.1M18.7 12h2.1M4.9 19.1l1.5-1.5M17.6 6.4l1.5-1.5" />
                </>
              ) : (
                <path d="M19.2 14.4A7.4 7.4 0 0 1 9.6 4.8 7.6 7.6 0 1 0 19.2 14.4Z" />
              )}
            </svg>
            <span className="themeSwitch__text">
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </span>
          </button>
        </div>
      </aside>

      <div className="work">
        <header className="titlebar">
          <span className="titlebar__title">{titles[pathname] ?? 'FrontDesk'}</span>
          <div className="titlebar__right">
            <button
              type="button"
              className="titlebar__shield"
              disabled={syncing}
              onClick={() => {
                setSyncing(true)
                void resync().finally(() => setSyncing(false))
              }}
              title="Re-read sources, calendar and mail"
              aria-label="Resync sources"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" />
              </svg>
              {syncing ? 'Syncing…' : 'Resync'}
            </button>
            <button
              type="button"
              className="titlebar__shield"
              onClick={previewPrivacy}
              title="Blur FrontDesk now (⌘⇧P)"
              aria-label="Blur FrontDesk for privacy"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3 4.5 6v5.3c0 4.6 3.2 8.8 7.5 9.9 4.3-1.1 7.5-5.3 7.5-9.9V6L12 3Z" />
              </svg>
              Privacy
            </button>
            <span className="titlebar__status">
              <span className="titlebar__statusDot" aria-hidden="true" />
              Local · not synced
            </span>
          </div>
        </header>

        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
