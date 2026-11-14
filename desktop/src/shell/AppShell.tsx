import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { api, inTauri } from '../lib/ipc'
import { useAccess } from '../state/access'

const nav = [
  { to: '/', label: 'Dashboard', end: true, glyph: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z' },
  { to: '/notes', label: 'Notes', end: false, glyph: 'M5 3.8h9.5L19 8.2v12H5v-16ZM14.2 3.9v4.5H19M8.2 12.4h7.4M8.2 16h5.2' },
  { to: '/chat', label: 'Ask', end: false, glyph: 'M4.5 5.5h15v10h-9l-4 3v-3h-2v-10ZM8.5 9.5h7M8.5 12.5h4.5' },
  { to: '/search', label: 'Search', end: false, glyph: 'M11 4.2a6.8 6.8 0 1 0 0 13.6 6.8 6.8 0 0 0 0-13.6ZM16 16l4 4' },
  { to: '/access', label: 'Access', end: false, glyph: 'M12 4.2 19 7v5.2c0 4.1-2.8 6.6-7 7.6-4.2-1-7-3.5-7-7.6V7l7-2.8ZM9.2 11.8l2 2 3.6-3.8' },
  { to: '/settings', label: 'Settings', end: false, glyph: 'M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2ZM12 3v2.2M12 18.8V21M4.6 7.8l1.9 1.1M17.5 15.1l1.9 1.1M4.6 16.2l1.9-1.1M17.5 8.9l1.9-1.1' },
]

const titles: Record<string, string> = {
  '/': 'Dashboard',
  '/notes': 'Notes',
  '/chat': 'Ask',
  '/search': 'Search',
  '/access': 'Access',
  '/settings': 'Settings',
}

export function AppShell() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { info, models, grants } = useAccess()
  const [theme, setTheme] = useState<'dark' | 'light'>(
    () => (localStorage.getItem('frontdesk.theme') as 'dark' | 'light') || 'dark',
  )
  const [core, setCore] = useState<'checking' | 'online' | 'browser'>('checking')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    localStorage.setItem('frontdesk.theme', theme)
  }, [theme])

  useEffect(() => {
    if (!inTauri()) {
      setCore('browser')
      return
    }
    api
      .ping()
      .then(() => setCore('online'))
      .catch(() => setCore('browser'))
  }, [])

  // ⌘K / Ctrl-K jumps to search, the way a desktop app should.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        navigate('/search')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  const selected = info?.selectedModel
    ? models.find((model) => model.id === info.selectedModel)?.name ?? info.selectedModel
    : 'Extractive'

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <span className="sidebar__dot" aria-hidden="true" />
          <span className="sidebar__word">FrontDesk</span>
          <span className="sidebar__tag">desktop</span>
        </div>

        <nav className="sidebar__nav" aria-label="Primary">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `navItem${isActive ? ' is-active' : ''}`}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d={item.glyph} />
              </svg>
              {item.label}
            </NavLink>
          ))}
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
            className="themeSwitch"
            onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
            aria-label="Toggle light mode"
          >
            <span className={`themeSwitch__track${theme === 'light' ? ' is-on' : ''}`}>
              <span className="themeSwitch__knob" />
            </span>
            {theme === 'light' ? 'Daylight' : 'Lamplight'}
          </button>
        </div>
      </aside>

      <div className="work">
        <header className="titlebar">
          <div className="titlebar__lights" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <span className="titlebar__title">{titles[pathname] ?? 'FrontDesk'}</span>
          <span className="titlebar__status">
            <span className="titlebar__statusDot" aria-hidden="true" />
            Local · not synced
          </span>
        </header>

        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
