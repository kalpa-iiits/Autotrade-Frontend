import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, api, errorMessage, unwrap } from '../api/client'
import type { ApiTokenInfo } from '../api/types'
import { useAuth } from '../auth'
import { Icon } from '../components/icons'
import { Page } from '../components/Page'
import { Empty, ErrorBox, Note, Switch, fmtAgo, fmtDate, useLoad } from '../components/ui'
import { askPermission, notificationsAllowed, usePrefs, type ReminderPrefs } from '../reminders'

const SECTIONS = [
  ['tokens', 'API tokens'],
  ['password', 'Password'],
  ['reminders', 'Reminders'],
] as const

export default function Settings() {
  const [on, setOn] = useState<string>('tokens')
  return (
    <Page
      title="Settings"
      sub={
        <>
          Access for your scripts, sign-in security and reminders. Broker logins live on <Link to="/accounts">Accounts</Link>.
        </>
      }
    >
      <div className="side-left" style={{ gridTemplateColumns: '200px minmax(0, 860px)' }}>
        <nav className="settings-nav" aria-label="Settings sections">
          {SECTIONS.map(([id, text]) => (
            <a
              key={id}
              href={`#${id}`}
              className={on === id ? 'on' : ''}
              onClick={(e) => {
                e.preventDefault()
                setOn(id)
                document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
              }}
            >
              {text}
            </a>
          ))}
        </nav>
        <div className="stack">
          <ApiTokens />
          <ChangePassword />
          <Reminders />
        </div>
      </div>
    </Page>
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
    <section className="card stack" id="tokens">
      <div>
        <h2 style={{ fontSize: 17 }}>API tokens</h2>
        <p className="small muted" style={{ marginTop: 4 }}>
          For scripts and bots. Send <code>Authorization: Bearer &lt;token&gt;</code>, or <code>?token=</code> on WebSockets.
        </p>
      </div>
      <div className="alert bad">
        <Icon name="warn" size={15} />
        <div className="grow">
          A token can do everything you can — place orders and start strategies on <b>all</b> your accounts. Treat it like a password.
        </div>
      </div>
      <form className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-end' }} onSubmit={create}>
        <label className="field grow">
          Token name
          <input placeholder="e.g. trading-bot" maxLength={64} value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <button type="submit" className="primary" style={{ minHeight: 40 }} disabled={busy}>
          {busy ? 'Creating…' : 'Create token'}
        </button>
      </form>
      {created && (
        <Note onClose={() => setCreated(null)}>
          <div style={{ marginBottom: 8 }}>
            New token <b>{created.name}</b>. Copy it now — it won’t be shown again; only a hash is stored.
          </div>
          <div className="secret">{created.token}</div>
          <button className="sm" style={{ marginTop: 8 }} onClick={() => void copy()}>{copied ? 'Copied' : 'Copy'}</button>
        </Note>
      )}
      <ErrorBox error={tokens.error ?? error} />
      <div className="inset" style={{ padding: 0, overflow: 'hidden' }}>
        {tokens.data?.length === 0 ? (
          <Empty>No tokens yet. Create one above for each script, so you can revoke them one at a time.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Created</th>
                <th>Last used</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tokens.data?.map((t) => (
                <tr key={t.id}>
                  <td className="mono">
                    <span className="row" style={{ gap: 8 }}>
                      <Icon name="key" size={14} className="muted" /> {t.name}
                      <span className="tiny muted">{t.prefix}…</span>
                    </span>
                  </td>
                  <td className="small">{fmtDate(t.created_at)}</td>
                  <td className="small">{fmtAgo(t.last_used_at)}</td>
                  <td className="num">
                    <button className="danger sm" onClick={() => void revoke(t)}>Revoke</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}

/** 0-4: length plus character variety. */
function strength(pw: string): number {
  if (!pw) return 0
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length
  let s = pw.length >= 16 ? 3 : pw.length >= 12 ? 2 : pw.length >= 10 ? 1 : 0
  if (kinds >= 3) s += 1
  return Math.min(4, Math.max(1, s))
}

const STRENGTH = ['', 'Weak', 'Fair', 'Good', 'Strong']

function ChangePassword() {
  const { user } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [busy, setBusy] = useState(false)
  const s = strength(next)

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
    <form className="card stack" id="password" onSubmit={submit}>
      <div>
        <h2 style={{ fontSize: 17 }}>Change password</h2>
        <p className="small muted" style={{ marginTop: 4 }}>
          Signed in as <b style={{ color: 'var(--text)' }}>{user?.username}</b>. Changing it signs out other sessions.
        </p>
      </div>
      <input type="text" autoComplete="username" value={user?.username ?? ''} readOnly hidden />
      <label className="field" style={{ maxWidth: 300 }}>
        Current password
        <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
      </label>
      <div className="row" style={{ alignItems: 'flex-start', gap: 14 }}>
        <label className="field" style={{ width: 300 }}>
          New password
          <div className="input-wrap">
            <input type={show ? 'text' : 'password'} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required style={{ paddingRight: 60 }} />
            <button type="button" className="link suffix small" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
          </div>
          {next && (
            <>
              <div className={`strength ${s <= 1 ? 'weak' : s === 2 ? 'fair' : ''}`}>
                {[1, 2, 3, 4].map((i) => <i key={i} className={i <= s ? 'on' : ''} />)}
              </div>
              <span className={`tiny ${s <= 1 ? 'neg' : s === 2 ? 'warn' : 'pos'}`}>{STRENGTH[s]} · {next.length} characters</span>
            </>
          )}
        </label>
        <label className="field" style={{ width: 300 }}>
          Repeat new password
          <input type={show ? 'text' : 'password'} autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required />
          {repeat && (
            <span className={`tiny ${repeat === next ? 'pos' : 'neg'}`} style={{ marginTop: 8 }}>
              {repeat === next ? '✓ Passwords match' : 'Passwords don’t match yet'}
            </span>
          )}
        </label>
      </div>
      <ErrorBox error={error} />
      {ok && <Note>Password changed. Your other sessions are signed out.</Note>}
      <div>
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Saving…' : 'Update password'}
        </button>
      </div>
    </form>
  )
}

function Reminders() {
  const [prefs, save] = usePrefs()
  const [allowed, setAllowed] = useState(notificationsAllowed)
  const [error, setError] = useState<string | null>(null)
  const supported = typeof Notification !== 'undefined'

  async function set(key: keyof ReminderPrefs, value: boolean) {
    setError(null)
    if (value && !allowed) {
      const ok = await askPermission()
      setAllowed(ok)
      if (!ok) {
        setError('The browser blocked notifications for this site. Allow them in the site settings, then try again.')
        return
      }
    }
    save({ ...prefs, [key]: value })
  }

  const rows: [keyof ReminderPrefs, string, string][] = [
    ['login', 'Broker login reminder', 'Nudge at 08:45 on trading days if any broker isn’t logged in'],
    ['errors', 'Strategy errors', 'Alert when a strategy stops unexpectedly or an order is rejected'],
    ['fills', 'Every fill', 'A notification for each executed order'],
  ]
  return (
    <section className="card" id="reminders">
      <h2 style={{ fontSize: 17 }}>Reminders</h2>
      <p className="small muted" style={{ marginTop: 4, marginBottom: 10 }}>
        So a missed broker login never costs you a trading day. Browser notifications on this device, while AutoTrade is open in a tab
        {supported && !allowed ? ' — you’ll be asked to allow them.' : '.'}
      </p>
      {!supported && <ErrorBox error="This browser doesn’t support notifications." />}
      <ErrorBox error={error} />
      {rows.map(([key, title, text]) => (
        <div key={key} className="setting-row">
          <div className="grow">
            <div style={{ fontWeight: 500 }}>{title}</div>
            <div className="small muted">{text}</div>
          </div>
          <Switch label={title} on={prefs[key] && allowed} disabled={!supported} onChange={(v) => void set(key, v)} />
        </div>
      ))}
    </section>
  )
}
