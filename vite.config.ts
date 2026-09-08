import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
// In dev, the Vite dev server proxies /api to the local Slidesmith Node server
// (default port 8787), so the browser only ever talks to one origin.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // Two entries: the app, and the headless render worker page a background
      // render job drives (render.html / src/render-entry.ts).
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        render: fileURLToPath(new URL('./render.html', import.meta.url)),
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
})
