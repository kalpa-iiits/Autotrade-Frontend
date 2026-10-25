import createClient, { type Middleware } from 'openapi-fetch'
import type { components, paths } from './schema'

export type Schemas = components['schemas']

/** An error reply from the backend: `{"detail": ...}` plus the HTTP status. */
export class ApiError extends Error {
  status: number
  retryAfter: number | null

  constructor(status: number, message: string, retryAfter: number | null = null) {
    super(message)
    this.status = status
    this.retryAfter = retryAfter
  }
}

// Called on any 401 except a failed sign-in; the auth provider sends the user to the login page.
let onUnauthorized: () => void = () => {}
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler
}

const unauthorized: Middleware = {
  onResponse({ request, response }) {
    if (response.status === 401 && !request.url.endsWith('/api/auth/login')) onUnauthorized()
    return undefined
  },
}

// Same origin: the Vite dev server proxies /api to the backend (see vite.config.ts).
export const api = createClient<paths>({ baseUrl: '', credentials: 'include' })
api.use(unauthorized)

function detailText(detail: unknown): string {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    // FastAPI validation errors: [{loc: [...], msg: "..."}]
    return detail
      .map((d) => {
        const e = d as { loc?: unknown[]; msg?: string }
        const field = e.loc?.filter((p) => p !== 'body').join('.')
        return field ? `${field}: ${e.msg}` : (e.msg ?? JSON.stringify(d))
      })
      .join('; ')
  }
  return detail === undefined ? '' : JSON.stringify(detail)
}

const STATUS_TEXT: Record<number, string> = {
  401: 'Not signed in',
  403: 'Forbidden',
  404: 'Not found',
  409: 'Conflict',
  422: 'Invalid request',
  429: 'Too many attempts',
  502: 'Broker API error',
  503: 'Broker not connected — log in to the broker in Settings',
}

/**
 * Await an openapi-fetch call and return its data, or throw an ApiError.
 * `T` overrides the data type for endpoints the schema leaves untyped (see types.ts).
 */
export async function unwrap<T = never, D = unknown>(
  call: Promise<{ data?: D; error?: unknown; response: Response }>,
): Promise<[T] extends [never] ? D : T> {
  const { data, error, response } = await call
  if (!response.ok) {
    const detail = detailText((error as { detail?: unknown } | undefined)?.detail)
    const retry = response.headers.get('Retry-After')
    const status = STATUS_TEXT[response.status]
    throw new ApiError(
      response.status,
      detail || status || `HTTP ${response.status}`,
      retry ? Number(retry) : null,
    )
  }
  return data as [T] extends [never] ? D : T
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message
  if (e instanceof Error) return e.message
  return String(e)
}
