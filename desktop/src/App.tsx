import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './shell/AppShell'
import Dashboard from './pages/Dashboard'
import Notes from './pages/Notes'
import Search from './pages/Search'
import Timeline from './pages/Timeline'
import Chat from './pages/Chat'
import Access from './pages/Access'
import Settings from './pages/Settings'
import { AccessProvider } from './state/access'

export default function App() {
  return (
    <AccessProvider>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/timeline" element={<Timeline />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/search" element={<Search />} />
          <Route path="/access" element={<Access />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AccessProvider>
  )
}
