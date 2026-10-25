import { useEffect, useState, type FormEvent } from 'react'
import { ApiError, errorMessage } from '../api/client'
import { useAuth } from '../auth'

export default function Login() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [lockedUntil, setLockedUntil] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)

  // Count down a 429 lockout.
  useEffect(() => {
    if (!lockedUntil) return
    const t = window.setInterval(() => {
      setNow(Date.now())
      if (Date.now() >= lockedUntil) setLockedUntil(null)
    }, 1000)
    return () => window.clearInterval(t)
  }, [lockedUntil])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(username, password)
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setLockedUntil(Date.now() + (err.retryAfter ?? 300) * 1000)
        setNow(Date.now())
        setError('Too many failed sign-ins from this address.')
      } else {
        setError(err instanceof ApiError && err.status === 401 ? 'Wrong username or password.' : errorMessage(err))
      }
    } finally {
      setBusy(false)
    }
  }

  const wait = lockedUntil ? Math.max(0, Math.ceil((lockedUntil - now) / 1000)) : 0

  return (
    <div className="center">
      <form className="card login" onSubmit={submit}>
        <h1>AutoTrade</h1>
        <label>
          Username
          <input autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && (
          <div className="error" role="alert">
            {error}
            {wait > 0 && <div>Locked out — try again in {wait}s.</div>}
          </div>
        )}
        <button type="submit" disabled={busy || wait > 0}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
