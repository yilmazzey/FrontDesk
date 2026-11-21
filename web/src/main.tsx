import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { THEME_KEY, useUI } from './store'
import './styles.css'

// Apply the stored scheme before the first paint so there is no dark flash.
const initial = useUI.getState().theme
document.documentElement.dataset.theme = initial
document.documentElement.style.colorScheme = initial
try {
  window.localStorage.setItem(THEME_KEY, initial)
} catch {
  /* ignore */
}

const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
