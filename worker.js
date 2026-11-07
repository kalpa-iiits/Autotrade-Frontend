// Cloudflare Worker: serves the built app from ./dist and forwards /api (REST + WebSockets)
// and /auth (broker login callbacks) to the backend, so the browser sees one origin, the
// same way the Vite dev server proxies them locally.
export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
      return fetch(new Request(new URL(url.pathname + url.search, env.BACKEND_URL), request))
    }
    const asset = await env.ASSETS.fetch(request)
    const response = new Response(asset.body, asset)
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('X-Frame-Options', 'DENY')
    response.headers.set('Referrer-Policy', 'same-origin')
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    response.headers.set(
      'Content-Security-Policy',
      "default-src 'self'; connect-src 'self' wss:; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    )
    return response
  },
}
