import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Backend to proxy to. Override for a backend on another port:
//   AUTOTRADE_API_URL=http://localhost:8010 npm run dev
const target = process.env.AUTOTRADE_API_URL ?? 'http://localhost:8000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // REST + WebSockets. Host is not rewritten, so the backend's same-origin
      // WebSocket check sees the page's own origin.
      '/api': { target, ws: true },
      // Broker callbacks (the URLs registered with Fyers / Zerodha).
      '/auth': target,
    },
  },
})
