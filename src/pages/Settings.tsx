import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ApiError, api, errorMessage, unwrap } from '../api/client'
import type { Broker, BrokerStatus } from '../api/types'
import { useAuth } from '../auth'
import { Badge, Card, ErrorBox, useLoad } from '../components/ui'

const BROKERS: Broker[] = ['fyers', 'zerodha']

export default function Settings() {
  const status = useLoad(() => unwrap<BrokerStatus>(api.GET('/api/auth/status')))
  const [params, setParams] = useSearchParams()
  const [returned, setReturned] = useState<{ ok: boolean; text: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  // Coming back from a broker login: ?broker_login=fyers or ?broker_login_error=...
  useEffect(() => {
    const ok = params.get('broker_login')
    const err = params.get('broker_login_error')
    if (!ok && !err) return
    setReturned(ok ? { ok: true, text: `Logged in to ${ok}.` } : { ok: false, text: `Broker login failed: ${err}` })
    setParams({}, { replace: true })
    void status.reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function brokerLogin(broker: Broker) {
    setBusy(broker)
    setError(null)
    setReturned(null)
    try {
      const path = broker === 'fyers' ? '/api/auth/fyers/login' : '/api/auth/zerodha/login'
      const { url } = await unwrap<{ url: string }>(api.GET(path, { params: { query: { redirect: false } } }))
      window.location.assign(url)
    } catch (e) {
      setError(errorMessage(e))
      setBusy(null)
    }
  }

  async function brokerLogout(broker: Broker) {
    if (!window.confirm(`Log out of ${broker}? Its saved token for today is cleared.`)) return
    setBusy(broker)
    setError(null)
    try {
      await unwrap(api.POST('/api/auth/{broker}/logout', { params: { path: { broker } } }))
      await status.reload()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  const s = status.data
  return (
    <div className="stack">
      <Card title="Broker login" actions={<button className="link" onClick={() => void status.reload()}>Refresh</button>}>
        {returned && <div className={returned.ok ? 'ok' : 'error'}>{returned.text}</div>}
        <ErrorBox error={status.error ?? error} />
        <p className="muted">
          Fyers and Zerodha tokens expire daily: log in once each trading day. You will be sent to the broker and
          come back here.
        </p>
        {s && (
          <p>
            Active broker: <strong>{s.broker}</strong>{' '}
            {s.connected ? <Badge tone="good">connected</Badge> : <Badge tone="bad">not connected</Badge>}
            {s.reason && <span className="muted"> {s.reason}</span>}
          </p>
        )}
        <table>
          <tbody>
            {BROKERS.map((b) => (
              <tr key={b}>
                <td>
                  <strong>{b}</strong> {s?.broker === b && <Badge tone="info">active</Badge>}
                </td>
                <td>{s?.logged_in_today[b] ? <Badge tone="good">logged in today</Badge> : <Badge>not logged in</Badge>}</td>
                <td className="buttons">
                  <button disabled={busy !== null} onClick={() => void brokerLogin(b)}>
                    {busy === b ? 'Opening…' : `Log in to ${b}`}
                  </button>
                  <button className="link" disabled={busy !== null || !s?.logged_in_today[b]} onClick={() => void brokerLogout(b)}>
                    Log out
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <ChangePassword />
    </div>
  )
}

function ChangePassword() {
  const { user } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setOk(false)
    if (next !== repeat) {
      setError('New passwords do not match.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await unwrap(api.POST('/api/auth/password', { body: { current_password: current, new_password: next } }))
      setOk(true)
      setCurrent('')
      setNext('')
      setRepeat('')
    } catch (err) {
      setError(err instanceof ApiError && err.status === 403 ? 'Current password is wrong.' : errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title={`Change password (${user?.username})`}>
      <form className="col-form" onSubmit={submit}>
        <input type="text" autoComplete="username" value={user?.username ?? ''} readOnly hidden />
        <label>
          Current password
          <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </label>
        <label>
          New password
          <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />
        </label>
        <label>
          Repeat new password
          <input type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required />
        </label>
        <ErrorBox error={error} />
        {ok && <p className="ok">Password changed. Your other sessions are signed out.</p>}
        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Change password'}
        </button>
      </form>
    </Card>
  )
}
