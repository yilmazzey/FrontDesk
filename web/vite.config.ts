import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const rootPackage = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string }

export default defineConfig({
  // GitHub Pages serves project sites under /<repo>/. Local dev stays at /.
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(rootPackage.version) },
  server: { port: 5173 },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
  },
})
