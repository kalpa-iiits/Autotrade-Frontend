// Cloudflare Worker: serves the built app from ./dist and forwards /api (REST + WebSockets)
// and /auth (broker login callbacks) to the backend, so the browser sees one origin, the
// same way the Vite dev server proxies them locally.
export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
      return fetch(new Request(new URL(url.pathname + url.search, env.BACKEND_URL), request))
    }
    return env.ASSETS.fetch(request)
  },
}
