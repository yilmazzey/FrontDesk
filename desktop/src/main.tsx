import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './styles.css'

// Hash routing keeps the desktop app portable: it works from Vite in the
// browser today and inside the Tauri webview (tauri://localhost) later, where
// there is no server to rewrite paths.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
