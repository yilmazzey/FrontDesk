import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Home from './pages/Home'
import MonitorPage from './pages/MonitorPage'
import { THEME_KEY, useUI } from './store'

export default function App() {
  const theme = useUI((s) => s.theme)

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
