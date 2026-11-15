import { create } from 'zustand'

export type NotebookSection = 'about' | 'pricing' | 'privacy'
export type SceneMode = 'desk' | 'notebook' | 'entering'
export type Theme = 'dark' | 'light'

const THEME_KEY = 'frontdesk-theme'

function readTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  try {
    const stored = window.localStorage.getItem(THEME_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    /* private mode — fall through */
  }
  // The desk is designed as an evening room; light mode is an explicit choice.
  return 'dark'
}

type Store = {
  /** Warm task light above the notebook. */
  lampOn: boolean
  toggleLamp: () => void

  mode: SceneMode
  openNotebook: () => void
  closeNotebook: () => void
  enterApp: () => void
  resetMode: () => void

  section: NotebookSection
  setSection: (section: NotebookSection) => void

  /** id of the object currently hovered */
  hover: string | null
  setHover: (id: string | null) => void

  /** camera zoom on the desk. 1 is the authored pose, larger is closer. */
  zoom: number
  setZoom: (zoom: number) => void

  /** whole-page colour scheme */
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void

  /** true once the GLB is parsed and the first frame is drawn */
  ready: boolean
  setReady: (ready: boolean) => void
}

export const useUI = create<Store>((set) => ({
  lampOn: false,
  toggleLamp: () => set((s) => ({ lampOn: !s.lampOn })),

  mode: 'desk',
  openNotebook: () => set({ mode: 'notebook', hover: null }),
  closeNotebook: () => set({ mode: 'desk', hover: null }),
  enterApp: () => set({ mode: 'entering', hover: null }),
  resetMode: () => set({ mode: 'desk', hover: null }),

  section: 'about',
  setSection: (section) => set({ section }),

  hover: null,
  setHover: (hover) => set({ hover }),

  zoom: 1,
  setZoom: (zoom) => set({ zoom: Math.min(2.6, Math.max(0.6, zoom)) }),

  theme: readTheme(),
  setTheme: (theme) => set({ theme }),
  toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),

  ready: false,
  setReady: (ready) => set({ ready }),
}))

export { THEME_KEY }
