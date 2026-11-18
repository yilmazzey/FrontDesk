import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './shell/AppShell'
import Dashboard from './pages/Dashboard'
import Search from './pages/Search'
import Timeline from './pages/Timeline'
import Saved from './pages/Saved'
import Settings from './pages/Settings'
import TrayPopover from './pages/TrayPopover'
import { AccessProvider } from './state/access'
import { SavedProvider } from './state/saved'

export default function App() {
  return (
    <AccessProvider>
      <SavedProvider>
        <Routes>
          <Route path="/tray" element={<TrayPopover />} />
          <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="/timeline" element={<Timeline />} />
          <Route path="/saved" element={<Saved />} />
          <Route path="/search" element={<Search />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </SavedProvider>
    </AccessProvider>
  )
}
