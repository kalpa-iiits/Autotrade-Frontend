import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, api, errorMessage, unwrap } from '../api/client'
import type { ApiTokenInfo } from '../api/types'
import { useAuth } from '../auth'
import { Card, Empty, ErrorBox, fmtTime, useLoad } from '../components/ui'

export default function Settings() {
  return (
    <div className="stack">
      <p className="muted">
        Broker accounts and the daily broker login are on the <Link to="/accounts">Accounts</Link> page.
      </p>
      <ApiTokens />
      <ChangePassword />
    </div>
  )
}

/** Personal API tokens for scripts and bots. Each acts as you; shown once when created. */
function ApiTokens() {
  const tokens = useLoad(() => unwrap<ApiTokenInfo[]>(api.GET('/api/auth/tokens')))
  const [name, setName] = useState('')
  const [created, setCreated] = useState<{ name: string; token: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function create(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setCopied(false)
    try {
      const r = await unwrap<ApiTokenInfo & { token: string }>(api.POST('/api/auth/tokens', { body: { name: name.trim() } }))
      setCreated({ name: r.name, token: r.token })
      setName('')
      await tokens.reload()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function revoke(t: ApiTokenInfo) {
    if (!window.confirm(`Revoke "${t.name}" (${t.prefix}…)? Scripts using it stop working at once.`)) return
    setError(null)
    try {
      await unwrap(api.DELETE('/api/auth/tokens/{token_id}', { params: { path: { token_id: t.id } } }))
      await tokens.reload()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function copy() {
    if (!created) return
    try {
      await navigator.clipboard.writeText(created.token)
      setCopied(true)
    } catch {
      setError('Copy failed; select the token and copy it by hand.')
    }
  }

  return (
    <Card title="API tokens" actions={<button className="link" onClick={() => void tokens.reload()}>Refresh</button>}>
      <p className="muted">
        For scripts and bots: send <code>Authorization: Bearer &lt;token&gt;</code> (or <code>?token=</code> on
        WebSockets). A token can do everything you can, on all your accounts. It is shown once; only a hash is stored.
      </p>
      <form className="inline-form" onSubmit={create}>
        <input className="small" placeholder="Name, e.g. my-bot" maxLength={64} value={name} onChange={(e) => setName(e.target.value)} required />
        <button type="submit" className="small" disabled={busy}>{busy ? 'Creating…' : 'Create token'}</button>
      </form>
      {created && (
        <div className="ok">
          <div>
            New token <strong>{created.name}</strong>. Copy it now: it won't be shown again.
          </div>
          <div className="secret">{created.token}</div>
          <div className="buttons">
            <button className="small" onClick={() => void copy()}>{copied ? 'Copied' : 'Copy'}</button>
            <button className="link" onClick={() => setCreated(null)}>Done</button>
          </div>
        </div>
      )}
      <ErrorBox error={tokens.error ?? error} />
      {tokens.data?.length === 0 && <Empty>No tokens.</Empty>}
      {!!tokens.data?.length && (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Starts with</th>
              <th>Created</th>
              <th>Last used</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {tokens.data.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td className="muted">{t.prefix}…</td>
                <td>{fmtTime(t.created_at)}</td>
                <td>{fmtTime(t.last_used_at)}</td>
                <td>
                  <button className="small danger" onClick={() => void revoke(t)}>Revoke</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
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
