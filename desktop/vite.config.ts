import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The desktop shell serves this app from the Tauri webview. Hash routing keeps
// deep links working without a dev server rewrite, and port 5174 runs beside
// the landing page instead of fighting it for 5173.
export default defineConfig({
  plugins: [react()],
  server: { port: 5174, strictPort: true },
  build: {
    target: 'es2020',
    // Tauri ships a known webview, so a modern target is safe.
    chunkSizeWarningLimit: 900,
  },
})
