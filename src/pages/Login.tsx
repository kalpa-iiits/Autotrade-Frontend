import { useEffect, useState, type FormEvent } from 'react'
import { ApiError, errorMessage } from '../api/client'
import { useAuth } from '../auth'
import { Icon } from '../components/icons'

export default function Login() {
  const { login, signup } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>(() => (new URLSearchParams(window.location.search).has('signup') ? 'signup' : 'signin'))
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [lockedUntil, setLockedUntil] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const signingUp = mode === 'signup'

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
    setError(null)
    if (signingUp && password !== repeat) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    try {
      await (signingUp ? signup : login)(username, password)
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setLockedUntil(Date.now() + (err.retryAfter ?? 300) * 1000)
        setNow(Date.now())
        setError('Too many attempts from this address.')
      } else if (signingUp && err instanceof ApiError && err.status === 404) {
        setError('Sign-up is turned off on this server. Ask its admin for a user.')
      } else {
        setError(err instanceof ApiError && err.status === 401 ? 'Wrong username or password.' : errorMessage(err))
      }
    } finally {
      setBusy(false)
    }
  }

  function switchMode() {
    setMode(signingUp ? 'signin' : 'signup')
    setError(null)
    setRepeat('')
  }

  const wait = lockedUntil ? Math.max(0, Math.ceil((lockedUntil - now) / 1000)) : 0

  return (
    <div className="center">
      <form className="card login" onSubmit={submit}>
        <div className="brand" style={{ padding: 0 }}>
          <span className="brand-mark">
            <Icon name="logo" size={17} />
          </span>
          AutoTrade
        </div>
        <label className="field">
          Username
          <input autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <label className="field">
          Password
          <input
            type="password"
            autoComplete={signingUp ? 'new-password' : 'current-password'}
            minLength={signingUp ? 10 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {signingUp && (
          <label className="field">
            Repeat password
            <input type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required />
          </label>
        )}
        {error && (
          <div className="alert bad" role="alert">
            <div>
              {error}
              {wait > 0 && <div>Locked out — try again in {wait}s.</div>}
            </div>
          </div>
        )}
        <button type="submit" className="primary lg" disabled={busy || wait > 0}>
          {busy ? (signingUp ? 'Creating…' : 'Signing in…') : signingUp ? 'Create user' : 'Sign in'}
        </button>
        <button type="button" className="link" onClick={switchMode}>
          {signingUp ? 'I already have a user: sign in' : 'New here? Create a user'}
        </button>
      </form>
    </div>
  )
}
