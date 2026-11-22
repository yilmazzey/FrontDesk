import { useEffect } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import Home from './pages/Home'
import MonitorPage from './pages/MonitorPage'
import { THEME_KEY, useUI } from './store'

export default function App() {
  const theme = useUI((s) => s.theme)
  const navigate = useNavigate()

  // GitHub Pages serves 404.html for a direct /FrontDesk/monitor hit. That file
  // stores the requested path in sessionStorage before sending the browser
  // home; restore it here so shared download links keep working.
  useEffect(() => {
    let target: string | null = null
    try {
      target = sessionStorage.getItem('fd:redirect')
      if (target) sessionStorage.removeItem('fd:redirect')
    } catch {
      return
    }
    if (!target) return
    const path = target.replace(/^\/FrontDesk(?=\/|$)/, '') || '/'
    if (path.startsWith('/') && path !== '/') {
      navigate(path, { replace: true })
    }
  }, [navigate])

  // One place applies the scheme to the document, so every route (and the
  // native scrollbar / form controls) follows the same switch.
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    try {
      window.localStorage.setItem(THEME_KEY, theme)
    } catch {
      /* private mode — the in-memory theme still works */
    }
  }, [theme])

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/monitor" element={<MonitorPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
