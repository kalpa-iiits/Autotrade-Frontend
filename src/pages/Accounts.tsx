import { useState, type FormEvent } from 'react'
import { accountName, useAccounts } from '../accounts'
import { api, errorMessage, unwrap } from '../api/client'
import type { Account, BrokerName, BrokerSpec, BrokerSpecs } from '../api/types'
import { Badge, Card, Empty, ErrorBox, fmtTime, useLoad } from '../components/ui'

const SECRET = /secret/

const FIELD_LABELS: Record<string, string> = {
  client_id: 'Client id (app id)',
  secret_key: 'Secret key',
  api_key: 'API key',
  api_secret: 'API secret',
  product_type: 'Product type',
  product: 'Product',
  starting_cash: 'Starting cash',
}

const label = (field: string) => FIELD_LABELS[field] ?? field

export default function Accounts() {
  const { accounts, error, current, select, reload, returned, clearReturned } = useAccounts()
  const specs = useLoad(() => unwrap<BrokerSpecs>(api.GET('/api/accounts/brokers')))

  return (
    <div className="stack">
      <Card title="Broker accounts" actions={<button className="link" onClick={() => void reload()}>Refresh</button>}>
        {returned && (
          <div className={returned.ok ? 'ok' : 'error'}>
            {returned.text}{' '}
            <button className="link" onClick={clearReturned}>Dismiss</button>
          </div>
        )}
        <ErrorBox error={error} />
        <p className="muted">
          Each account is yours alone. API keys and secrets are stored encrypted and never shown again: to change
          one, enter the new value. Fyers and Zerodha tokens expire daily, so log in to the broker once each trading
          day.
        </p>
        {accounts?.length === 0 && <Empty>No accounts yet. Add one below; a paper account is a safe start.</Empty>}
        {accounts?.map((a) => (
          <AccountRow
            key={a.id}
            account={a}
            spec={specs.data?.[a.broker]}
            isCurrent={a.id === current?.id}
            onSelect={() => select(a.id)}
            onChanged={reload}
          />
        ))}
      </Card>

      {specs.data && (
        <AddAccount
          specs={specs.data}
          onAdded={async (a) => {
            await reload()
            select(a.id)
          }}
        />
      )}
      <ErrorBox error={specs.error} />
    </div>
  )
}

function AccountRow({
  account: a,
  spec,
  isCurrent,
  onSelect,
  onChanged,
}: {
  account: Account
  spec: BrokerSpec | undefined
  isCurrent: boolean
  onSelect: () => void
  onChanged: () => Promise<void>
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [pasting, setPasting] = useState(false)
  const path = { params: { path: { account_id: a.id } } }
  const conn = a.connection?.broker

  async function act(name: string, fn: () => Promise<unknown>) {
    setBusy(name)
    setError(null)
    setNote(null)
    try {
      await fn()
      await onChanged()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  function brokerLogin() {
    void act('login', async () => {
      const { url } = await unwrap<{ url: string }>(
        api.GET('/api/accounts/{account_id}/broker-login', { params: { path: { account_id: a.id }, query: { redirect: false } } }),
      )
      window.location.assign(url) // comes back to AUTOTRADE_FRONTEND_URL with ?broker_login=...
    })
  }

  function brokerLogout() {
    if (!window.confirm(`Log ${a.label} out of ${a.broker}? Today's token is cleared and it disconnects.`)) return
    void act('logout', () => unwrap(api.POST('/api/accounts/{account_id}/broker-logout', path)))
  }

  function reconnect() {
    void act('reconnect', async () => {
      const r = await unwrap<Account & { connected: boolean }>(api.POST('/api/accounts/{account_id}/reconnect', path))
      setNote(r.connected ? 'Connected.' : `Not connected: ${r.connection?.broker.reason ?? 'unknown reason'}`)
    })
  }

  function remove() {
    const msg =
      `Delete ${accountName(a)}? It disconnects and its stored credentials and token are wiped. ` +
      'Its order and trade history is kept. Stop its strategies first.'
    if (!window.confirm(msg)) return
    void act('delete', () => unwrap(api.DELETE('/api/accounts/{account_id}', path)))
  }

  return (
    <div className={`account ${isCurrent ? 'current' : ''}`}>
      <div className="account-head">
        <div>
          <strong>{a.label}</strong> <Badge>{a.broker}</Badge>
          {isCurrent && <Badge tone="info">selected</Badge>}
          {conn?.connected ? <Badge tone="good">connected</Badge> : <Badge tone="bad">not connected</Badge>}
          {a.needs_daily_login &&
            (a.logged_in_today ? <Badge tone="good">logged in today</Badge> : <Badge>needs today's login</Badge>)}
          {conn && !conn.connected && conn.reason && <div className="muted small-text">{conn.reason}</div>}
          {conn?.stream_error && <div className="error small-text">{conn.stream_error}</div>}
          {a.connection && !a.connection.ledger.healthy && (
            <div className="error small-text">
              Trade ledger has {a.connection.ledger.unsaved_orders} unsaved update(s); live strategies paused.
            </div>
          )}
        </div>
        <div className="buttons">
          {!isCurrent && <button onClick={onSelect}>Use this account</button>}
          {a.needs_daily_login && (
            <>
              <button className="buy" disabled={busy !== null} onClick={brokerLogin}>
                {busy === 'login' ? 'Opening…' : `Log in to ${a.broker}`}
              </button>
              <button disabled={busy !== null} onClick={() => setPasting(!pasting)}>
                Paste token
              </button>
              <button className="link" disabled={busy !== null || !a.logged_in_today} onClick={brokerLogout}>
                Log out
              </button>
            </>
          )}
          <button className="link" disabled={busy !== null} onClick={reconnect}>
            {busy === 'reconnect' ? 'Reconnecting…' : 'Reconnect'}
          </button>
          <button disabled={busy !== null} onClick={() => setEditing(!editing)}>
            {editing ? 'Cancel edit' : 'Edit'}
          </button>
          <button className="danger" disabled={busy !== null} onClick={remove}>
            Delete
          </button>
        </div>
      </div>

      <dl className="kv inline">
        {a.credentials &&
          Object.entries(a.credentials).map(([field, value]) => (
            <Pair key={field} k={label(field)} v={value ?? 'missing'} />
          ))}
        {Object.entries(a.options).map(([field, value]) => (
          <Pair key={field} k={label(field)} v={String(value)} />
        ))}
        <Pair k="Added" v={fmtTime(a.created_at)} />
        {conn?.last_tick_at !== undefined && <Pair k="Last tick" v={fmtTime(conn.last_tick_at)} />}
      </dl>
      {a.credentials_error && <div className="error">{a.credentials_error}</div>}

      {pasting && (
        <PasteToken
          accountId={a.id}
          onDone={async (text) => {
            setPasting(false)
            setNote(text)
            await onChanged()
          }}
        />
      )}
      {editing && spec && (
        <EditAccount
          account={a}
          spec={spec}
          onSaved={async () => {
            setEditing(false)
            setNote('Saved.')
            await onChanged()
          }}
        />
      )}
      <ErrorBox error={error} />
      {note && <p className="ok">{note}</p>}
    </div>
  )
}

function Pair({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </>
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
        api.POST('/api/accounts/{account_id}/access-token', {
          params: { path: { account_id: accountId } },
          body: { access_token: token.trim() },
        }),
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
    <form className="row-form" onSubmit={submit}>
      <label>
        Today's access token (generated elsewhere)
        <input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} required />
      </label>
      <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save token'}</button>
      <ErrorBox error={error} />
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
        <label key={field}>
          {label(field)}
          <input
            type={SECRET.test(field) ? 'password' : 'text'}
            autoComplete="off"
            spellCheck={false}
            value={credentials[field] ?? ''}
            placeholder={requireCredentials ? '' : 'unchanged'}
            onChange={(e) => setCredential(field, e.target.value)}
            required={requireCredentials}
          />
        </label>
      ))}
      {Object.entries(spec.options).map(([field, schema]) => (
        <label key={field}>
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
  const brokers = Object.keys(specs) as BrokerName[]
  const [broker, setBroker] = useState<BrokerName>(brokers[0] ?? 'paper')
  const [labelText, setLabelText] = useState('')
  const [credentials, setCredentials] = useState<Record<string, string>>({})
  const [options, setOptions] = useState<Record<string, unknown>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const spec = specs[broker]

  function pick(b: BrokerName) {
    setBroker(b)
    setCredentials({})
    setOptions({})
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const creds = definedOnly(credentials) as Record<string, string>
      const account = await unwrap<Account>(
        api.POST('/api/accounts', {
          body: {
            broker,
            label: labelText.trim() || broker,
            credentials: spec.credentials.length ? creds : null,
            options: definedOnly(options),
          },
        }),
      )
      setCredentials({}) // don't keep secrets in memory longer than needed
      setLabelText('')
      await onAdded(account)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const callback = `${location.origin}/auth/${broker}/callback`
  return (
    <Card title="Add a broker account">
      <form className="row-form" onSubmit={submit} autoComplete="off">
        <label>
          Broker
          <select value={broker} onChange={(e) => pick(e.target.value as BrokerName)}>
            {brokers.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </label>
        <label>
          Label
          <input value={labelText} placeholder={`My ${broker}`} maxLength={64} onChange={(e) => setLabelText(e.target.value)} />
        </label>
        <Fields
          spec={spec}
          credentials={credentials}
          setCredential={(f, v) => setCredentials((c) => ({ ...c, [f]: v }))}
          options={options}
          setOption={(f, v) => setOptions((o) => ({ ...o, [f]: v }))}
          requireCredentials
        />
        <button type="submit" disabled={busy}>{busy ? 'Adding…' : 'Add account'}</button>
      </form>
      {spec.daily_login && (
        <p className="muted small-text">
          Use your own {broker === 'fyers' ? 'Fyers app (myapi.fyers.in)' : 'Kite Connect app (developers.kite.trade)'} and
          register this redirect URL on it: <code>{callback}</code>
          {broker === 'fyers' && ' (it must match the server’s AUTOTRADE_FYERS_REDIRECT_URI)'}. After adding, log in to
          the broker from the account above.
        </p>
      )}
      <ErrorBox error={error} />
    </Card>
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
    <form className="row-form" onSubmit={submit} autoComplete="off">
      <label>
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
      <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      <ErrorBox error={error} />
    </form>
  )
}
