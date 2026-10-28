import { useEffect, useRef, useState, type FormEvent } from 'react'
import { accountName, brokerTitle, needsLogin, startBrokerLogin, useAccounts } from '../accounts'
import { api, errorMessage, unwrap } from '../api/client'
import type { Account, BrokerName, BrokerSpec, BrokerSpecs, Funds, StrategiesList } from '../api/types'
import { Icon } from '../components/icons'
import { Page } from '../components/Page'
import { ErrorBox, Modal, Note, Pill, fmtDate, fmtMoney, fmtTime, useLoad, useNow } from '../components/ui'
import { minutesToIstMidnight } from '../market'

const SECRET = /secret/

const FIELD_LABELS: Record<string, string> = {
  client_id: 'App ID',
  secret_key: 'API secret',
  api_key: 'API key',
  api_secret: 'API secret',
  product_type: 'Default product',
  product: 'Default product',
  starting_cash: 'Starting cash',
}

const label = (field: string) => FIELD_LABELS[field] ?? field

const BROKER_SUB: Record<BrokerName, string> = {
  fyers: 'Live · API v3',
  zerodha: 'Live · Kite Connect',
  paper: 'Virtual cash · no risk',
}

function initials(broker: string) {
  return broker === 'fyers' ? 'FY' : broker === 'zerodha' ? 'ZE' : 'PT'
}

export default function Accounts() {
  const { accounts, error, current, select, reload, returned, clearReturned } = useAccounts()
  const specs = useLoad(() => unwrap<BrokerSpecs>(api.GET('/api/accounts/brokers')))
  // Every account's strategies, to say which ones wait on a login.
  const strategies = useLoad(() => unwrap<StrategiesList>(api.GET('/api/strategies')), [accounts?.length])
  const addRef = useRef<HTMLDivElement>(null)

  return (
    <Page
      title="Broker accounts"
      sub="Connect brokers, log in once each trading day, and choose which account you’re working in."
      actions={
        <button className="primary" onClick={() => addRef.current?.scrollIntoView({ behavior: 'smooth' })}>
          <Icon name="plus" size={16} /> Add account
        </button>
      }
    >
      {returned && (
        <Note tone={returned.ok ? 'good' : 'bad'} onClose={clearReturned}>
          {returned.text}
        </Note>
      )}
      <ErrorBox error={error ?? specs.error} />

      <div className="card how">
        <b>How daily login works</b>
        <span><span className="n">1</span>Fyers &amp; Zerodha tokens expire every day</span>
        <span><span className="n">2</span>Log in before 09:15 with one click</span>
        <span><span className="n">3</span>Strategies on that account resume automatically</span>
      </div>

      {accounts?.length === 0 && (
        <div className="card empty">No accounts yet. Add one below — a paper account is a safe start.</div>
      )}
      <div className="grid-3">
        {accounts?.map((a) => (
          <AccountCard
            key={a.id}
            account={a}
            spec={specs.data?.[a.broker]}
            isCurrent={a.id === current?.id}
            onSelect={() => select(a.id)}
            onChanged={reload}
            waiting={(strategies.data?.strategies ?? []).filter((s) => s.account_id === a.id).map((s) => s.label)}
          />
        ))}
      </div>

      <div ref={addRef}>
        {specs.data && (
          <AddAccount
            specs={specs.data}
            onAdded={async (a) => {
              await reload()
              select(a.id)
              if (a.needs_daily_login) await startBrokerLogin(a.id)
            }}
          />
        )}
      </div>
    </Page>
  )
}

function AccountCard({
  account: a,
  spec,
  isCurrent,
  onSelect,
  onChanged,
  waiting,
}: {
  account: Account
  spec: BrokerSpec | undefined
  isCurrent: boolean
  onSelect: () => void
  onChanged: () => Promise<void>
  waiting: string[]
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [modal, setModal] = useState<'edit' | 'token' | null>(null)
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const now = useNow(60_000)
  const path = { params: { path: { account_id: a.id } } }
  const conn = a.connection?.broker
  const paper = a.broker === 'paper'
  const pending = needsLogin(a)
  const funds = useLoad(
    () => (conn?.connected ? unwrap<Funds>(api.GET('/api/accounts/{account_id}/funds', path)) : Promise.resolve(null)),
    [conn?.connected],
  )

  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [menu])

  async function act(name: string, fn: () => Promise<unknown>) {
    setBusy(name)
    setMenu(false)
    setError(null)
    setNote(null)
    try {
      await fn()
      await onChanged()
      void funds.reload()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  function login() {
    void act('login', () => startBrokerLogin(a.id))
  }

  function logout() {
    if (!window.confirm(`Log ${a.label} out of ${brokerTitle(a.broker)}? Today's token is cleared and it disconnects.`)) return
    void act('logout', () => unwrap(api.POST('/api/accounts/{account_id}/broker-logout', path)))
  }

  function reconnect(confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return
    void act('reconnect', async () => {
      const r = await unwrap<Account & { connected: boolean }>(api.POST('/api/accounts/{account_id}/reconnect', path))
      setNote(r.connected ? (paper ? 'Balance reset.' : 'Connected.') : `Not connected: ${r.connection?.broker.reason ?? 'unknown reason'}`)
    })
  }

  function remove() {
    const msg = `Delete ${accountName(a)}? It disconnects and its stored credentials and token are wiped. Its order and trade history is kept. Stop its strategies first.`
    if (!window.confirm(msg)) return
    void act('delete', () => unwrap(api.DELETE('/api/accounts/{account_id}', path)))
  }

  const startingCash = Number(a.options.starting_cash ?? 1_000_000)
  const idField = a.credentials ? Object.entries(a.credentials).find(([, v]) => v && v !== 'set') : undefined
  const left = minutesToIstMidnight(now)
  const status = paper ? (
    <><span className="dot good" /> <span className="pos">Connected</span><span className="muted"> · always on, no login needed</span></>
  ) : pending ? (
    <><span className="dot warn" /> <span className="warn">{a.last_login_date ? 'Session expired' : 'Not logged in'}</span><span className="muted"> · {a.last_login_date ? `last login ${fmtDate(a.last_login_date).slice(0, -5)}` : 'log in to start'}</span></>
  ) : conn?.connected ? (
    <><span className="dot good" /> <span className="pos">Logged in today</span></>
  ) : (
    <><span className="dot bad" /> <span className="neg">Not connected</span><span className="muted"> · {conn?.reason ?? 'reconnect to retry'}</span></>
  )

  return (
    <section className={`card stack account-card ${isCurrent ? 'current' : ''} ${pending ? 'attention' : ''}`} style={{ gap: 14 }}>
      <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
        <span className={`broker-logo ${a.broker}`}>{initials(a.broker)}</span>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="ellipsis" style={{ fontWeight: 600, fontSize: 15 }}>{a.label}</div>
          <div className="small muted ellipsis">
            {paper ? 'Paper trading · simulated fills' : `Live broker · ${idField ? `${label(idField[0]).toLowerCase()} ${idField[1]}` : brokerTitle(a.broker)}`}
          </div>
        </div>
        {isCurrent ? <Pill tone="info">Active</Pill> : !paper && <span className="tag live">LIVE</span>}
      </div>
      <div className="small row" style={{ gap: 6 }}>{status}</div>

      {!paper && !pending && conn?.connected && (
        <div>
          <div className="between small muted" style={{ marginBottom: 6 }}>
            <span>Session ends at midnight IST</span>
            <span className="mono">{Math.floor(left / 60)}h {left % 60}m left</span>
          </div>
          <div className="meter good"><span style={{ width: `${(left / (24 * 60)) * 100}%` }} /></div>
        </div>
      )}
      {pending && waiting.length > 0 && (
        <div className="alert warn">
          <div className="grow">
            {waiting.length} strateg{waiting.length === 1 ? 'y is' : 'ies are'} waiting on this account. Log in to let <code>{waiting[0]}</code>
            {waiting.length > 1 ? ` and ${waiting.length - 1} more` : ''} trade today.
          </div>
        </div>
      )}
      {conn?.stream_error && <ErrorBox error={conn.stream_error} />}
      {a.connection && !a.connection.ledger.healthy && (
        <ErrorBox error={`Trade ledger has ${a.connection.ledger.unsaved_orders} unsaved update(s); live strategies paused.`} />
      )}
      {a.credentials_error && <ErrorBox error={a.credentials_error} />}

      <div className="inset kv-grid" style={{ ['--cols' as string]: 2 }}>
        {paper ? (
          <>
            <div><div className="k">Virtual balance</div><div className="v">{fmtMoney(funds.data?.cash)}</div></div>
            <div><div className="k">Started with</div><div className="v">{fmtMoney(startingCash)}</div></div>
            <div><div className="k">Added</div><div className="v">{fmtTime(a.created_at)}</div></div>
            <div><div className="k">Last tick</div><div className="v">{conn?.last_tick_at ? new Date(conn.last_tick_at).toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata' }) : '—'}</div></div>
          </>
        ) : (
          <>
            <div><div className="k">Available</div><div className={`v ${funds.data ? '' : 'muted'}`}>{funds.data ? fmtMoney(funds.data.cash) : '— log in to see'}</div></div>
            <div><div className="k">{idField ? label(idField[0]) : 'Credentials'}</div><div className="v">{idField ? idField[1] : a.credentials ? 'set' : 'missing'}</div></div>
          </>
        )}
      </div>

      <div className="row" style={{ marginTop: 'auto', flexWrap: 'nowrap' }}>
        {paper ? (
          <button className="grow" disabled={busy !== null} onClick={() => reconnect(`Reset ${a.label}? Cash goes back to ${fmtMoney(startingCash)} and its simulated positions and open orders are dropped. Trade history is kept.`)}>
            {busy === 'reconnect' ? 'Resetting…' : 'Reset balance'}
          </button>
        ) : pending ? (
          <button className="primary grow" disabled={busy !== null} onClick={login}>
            {busy === 'login' ? 'Opening…' : <>Log in to {brokerTitle(a.broker)} <Icon name="external" size={14} /></>}
          </button>
        ) : (
          <button className="grow" disabled={busy !== null || isCurrent} onClick={onSelect}>
            {isCurrent ? 'In use' : 'Switch to this'}
          </button>
        )}
        <button disabled={busy !== null || !spec} onClick={() => setModal('edit')}>Edit</button>
        <div style={{ position: 'relative' }} ref={menuRef}>
          <button className="icon" aria-label="More" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
            <Icon name="more" size={18} />
          </button>
          {menu && (
            <div className="account-switch" style={{ position: 'absolute', right: 0, bottom: 44, width: 200 }}>
              <div className="menu" role="menu" style={{ position: 'static' }}>
                {paper && !isCurrent && <button className="menu-item" onClick={() => { setMenu(false); onSelect() }}>Switch to this</button>}
                {!paper && pending === false && <button className="menu-item" onClick={login}>Log in again</button>}
                {a.needs_daily_login && <button className="menu-item" onClick={() => { setMenu(false); setModal('token') }}>Paste today’s token</button>}
                {a.needs_daily_login && a.logged_in_today && <button className="menu-item" onClick={logout}>Log out of broker</button>}
                {!paper && <button className="menu-item" onClick={() => reconnect()}>Reconnect</button>}
                <button className="menu-item neg" onClick={remove}>Delete account</button>
              </div>
            </div>
          )}
        </div>
      </div>
      <ErrorBox error={error} />
      {note && <Note onClose={() => setNote(null)}>{note}</Note>}

      {modal === 'edit' && spec && (
        <Modal title={`Edit ${a.label}`} onClose={() => setModal(null)}>
          <EditAccount
            account={a}
            spec={spec}
            onSaved={async () => {
              setModal(null)
              setNote('Saved.')
              await onChanged()
            }}
          />
        </Modal>
      )}
      {modal === 'token' && (
        <Modal title={`Paste today’s token — ${a.label}`} onClose={() => setModal(null)}>
          <PasteToken
            accountId={a.id}
            onDone={async (text) => {
              setModal(null)
              setNote(text)
              await onChanged()
            }}
          />
        </Modal>
      )}
    </section>
  )
}

function PasteToken({ accountId, onDone }: { accountId: number; onDone: (text: string) => Promise<void> }) {
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const r = await unwrap<{ connected: boolean; reason: string | null }>(
        api.POST('/api/accounts/{account_id}/access-token', { params: { path: { account_id: accountId } }, body: { access_token: token.trim() } }),
      )
      setToken('')
      await onDone(r.connected ? 'Token saved; connected.' : `Token saved, but not connected: ${r.reason}`)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <label className="field">
        Access token generated elsewhere for today
        <input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} required autoFocus />
      </label>
      <ErrorBox error={error} />
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="submit" className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save token'}</button>
      </div>
    </form>
  )
}

/** Credential inputs and option inputs for a broker. Secrets are never pre-filled. */
function Fields({
  spec,
  credentials,
  setCredential,
  options,
  setOption,
  requireCredentials,
}: {
  spec: BrokerSpec
  credentials: Record<string, string>
  setCredential: (field: string, value: string) => void
  options: Record<string, unknown>
  setOption: (field: string, value: unknown) => void
  requireCredentials: boolean
}) {
  return (
    <>
      {spec.credentials.map((field) => (
        <label key={field} className="field">
          {label(field)}
          <input
            type={SECRET.test(field) ? 'password' : 'text'}
            autoComplete="off"
            spellCheck={false}
            value={credentials[field] ?? ''}
            placeholder={requireCredentials ? (SECRET.test(field) ? '••••••••••••' : 'Paste from developer console') : 'unchanged'}
            onChange={(e) => setCredential(field, e.target.value)}
            required={requireCredentials}
          />
        </label>
      ))}
      {Object.entries(spec.options).map(([field, schema]) => (
        <label key={field} className="field">
          {label(field)}
          {schema.enum ? (
            <select value={String(options[field] ?? schema.default ?? '')} onChange={(e) => setOption(field, e.target.value)}>
              {schema.enum.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          ) : (
            <input
              type="number"
              min={0}
              className="mono"
              value={String(options[field] ?? '')}
              placeholder={schema.default === undefined ? '' : String(schema.default)}
              onChange={(e) => setOption(field, e.target.value === '' ? undefined : Number(e.target.value))}
            />
          )}
        </label>
      ))}
    </>
  )
}

function definedOnly(values: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined && v !== ''))
}

function AddAccount({ specs, onAdded }: { specs: BrokerSpecs; onAdded: (a: Account) => Promise<void> }) {
  const brokers = (['fyers', 'zerodha', 'paper'] as BrokerName[]).filter((b) => specs[b])
  const [broker, setBroker] = useState<BrokerName>(brokers[0] ?? 'paper')
  const [labelText, setLabelText] = useState('')
  const [credentials, setCredentials] = useState<Record<string, string>>({})
  const [options, setOptions] = useState<Record<string, unknown>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const spec = specs[broker]

  function pick(b: BrokerName) {
    setBroker(b)
    setCredentials({})
    setOptions({})
    setError(null)
  }

  function reset() {
    setCredentials({})
    setOptions({})
    setLabelText('')
    setError(null)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const creds = definedOnly(credentials) as Record<string, string>
      const account = await unwrap<Account>(
        api.POST('/api/accounts', {
          body: { broker, label: labelText.trim() || `${brokerTitle(broker)} — main`, credentials: spec.credentials.length ? creds : null, options: definedOnly(options) },
        }),
      )
      reset() // don't keep secrets in memory longer than needed
      await onAdded(account)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const callback = `${location.origin}/auth/${broker}/callback`
  async function copy() {
    try {
      await navigator.clipboard.writeText(callback)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* select it by hand */
    }
  }

  return (
    <form className="card stack" onSubmit={submit} autoComplete="off">
      <div>
        <h2 style={{ fontSize: 17 }}>Add a broker account</h2>
        <p className="small muted" style={{ marginTop: 4 }}>Keys are encrypted at rest and never shown again. To change one later, just enter the new value.</p>
      </div>
      <div className="grid-3" style={{ gap: 10 }}>
        {brokers.map((b) => (
          <button type="button" key={b} className={`option-card row ${b === broker ? 'on' : ''}`} style={{ minHeight: 0, flexDirection: 'row', alignItems: 'center', gap: 12 }} onClick={() => pick(b)} aria-pressed={b === broker}>
            <span className={`broker-logo ${b}`}>{initials(b)}</span>
            <span>
              <div style={{ fontWeight: 600 }}>{brokerTitle(b)}</div>
              <div className="tiny muted">{BROKER_SUB[b]}</div>
            </span>
          </button>
        ))}
      </div>
      <div className="grid-3" style={{ gap: 12 }}>
        <label className="field">
          Label
          <input value={labelText} placeholder={`e.g. ${brokerTitle(broker)} — main`} maxLength={64} onChange={(e) => setLabelText(e.target.value)} />
        </label>
        <Fields
          spec={spec}
          credentials={credentials}
          setCredential={(f, v) => setCredentials((c) => ({ ...c, [f]: v }))}
          options={options}
          setOption={(f, v) => setOptions((o) => ({ ...o, [f]: v }))}
          requireCredentials
        />
      </div>
      {spec.daily_login && (
        <label className="field">
          Redirect URL — paste this into your {broker === 'fyers' ? 'Fyers app (myapi.fyers.in)' : 'Kite Connect app (developers.kite.trade)'} settings
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input className="mono" readOnly value={callback} onFocus={(e) => e.target.select()} />
            <button type="button" onClick={() => void copy()}>{copied ? 'Copied' : 'Copy'}</button>
          </div>
          {broker === 'fyers' && <span className="field-note">It must match the server’s AUTOTRADE_FYERS_REDIRECT_URI.</span>}
        </label>
      )}
      <ErrorBox error={error} />
      <div className="between form-foot" style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
        <span className="small muted row" style={{ gap: 6 }}>
          <Icon name="lock" size={13} /> Encrypted with your server key
        </span>
        <div className="row">
          <button type="button" onClick={reset} disabled={busy}>Cancel</button>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Saving…' : spec.daily_login ? `Save & log in to ${brokerTitle(broker)}` : 'Add paper account'}
          </button>
        </div>
      </div>
    </form>
  )
}

function EditAccount({ account, spec, onSaved }: { account: Account; spec: BrokerSpec; onSaved: () => Promise<void> }) {
  const [labelText, setLabelText] = useState(account.label)
  const [credentials, setCredentials] = useState<Record<string, string>>({})
  const [options, setOptions] = useState<Record<string, unknown>>(account.options)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const creds = definedOnly(credentials) as Record<string, string>
    if (Object.keys(creds).length && !window.confirm('New credentials drop today’s broker login. Save?')) return
    setBusy(true)
    setError(null)
    try {
      await unwrap(
        api.PATCH('/api/accounts/{account_id}', {
          params: { path: { account_id: account.id } },
          body: {
            label: labelText.trim() === account.label ? null : labelText.trim(),
            credentials: Object.keys(creds).length ? creds : null,
            options: definedOnly(options),
          },
        }),
      )
      setCredentials({})
      await onSaved()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="stack" onSubmit={submit} autoComplete="off">
      <label className="field">
        Label
        <input value={labelText} maxLength={64} onChange={(e) => setLabelText(e.target.value)} required />
      </label>
      <Fields
        spec={spec}
        credentials={credentials}
        setCredential={(f, v) => setCredentials((c) => ({ ...c, [f]: v }))}
        options={options}
        setOption={(f, v) => setOptions((o) => ({ ...o, [f]: v }))}
        requireCredentials={false}
      />
      <ErrorBox error={error} />
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="submit" className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  )
}
