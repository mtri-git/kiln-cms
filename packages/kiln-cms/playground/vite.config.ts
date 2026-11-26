import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The template API runs on 8787. Proxying keeps the playground on one origin, so no CORS setup is needed.
const api = process.env.KILN_API ?? 'http://localhost:8787'

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/auth': api,
      '/admin': api,
      '/api': api,
      '/files': api,
    },
  },
})
