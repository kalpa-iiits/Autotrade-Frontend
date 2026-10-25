import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { accountName, useCurrentAccount } from '../accounts'
import { api, errorMessage, unwrap } from '../api/client'
import type { Account, Instance, OrdersMessage, Signal, StrategiesList } from '../api/types'
import { Badge, Card, Empty, ErrorBox, NeedAccount, fmtNum, fmtTime, statusTone, useLoad } from '../components/ui'
import { useLive } from '../live'

export default function Strategies() {
  const account = useCurrentAccount()
  if (!account) return <NeedAccount title="Strategies" />
  return <AccountStrategies key={account.id} account={account} />
}

function AccountStrategies({ account }: { account: Account }) {
  const list = useLoad(() =>
    unwrap<StrategiesList>(api.GET('/api/strategies', { params: { query: { account_id: account.id } } })),
  )
  const [error, setError] = useState<string | null>(null)
  const [openSignals, setOpenSignals] = useState<number | null>(null)
  // Latest pushed signal, handed to the open signal list.
  const [pushed, setPushed] = useState<Signal | null>(null)

  const onMessage = useCallback(
    (msg: OrdersMessage) => {
      if (msg.type === 'strategy_status') {
        list.setData((d) =>
          d && {
            ...d,
            strategies: d.strategies.map((i) =>
              i.id === msg.instance_id ? { ...i, status: msg.status, last_error: msg.error } : i,
            ),
          },
        )
        void list.reload() // position / orders_today come with the full instance
      } else if (msg.type === 'strategy_signal') {
        setPushed(msg.signal)
        void list.reload()
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  useLive(onMessage)

  function replace(updated: Instance) {
    list.setData((d) => d && { ...d, strategies: d.strategies.map((i) => (i.id === updated.id ? updated : i)) })
  }

  async function run(action: () => Promise<unknown>) {
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  async function stopAll() {
    if (!window.confirm('Stop ALL your running strategies, on every account? Orders already at the broker are not cancelled.')) return
    await run(async () => {
      const r = await unwrap<{ stopped: unknown }>(api.POST('/api/strategies/stop-all'))
      const n = Array.isArray(r.stopped) ? r.stopped.length : r.stopped
      window.alert(`Stopped: ${typeof n === 'number' ? n : JSON.stringify(n)}`)
      await list.reload()
    })
  }

  const d = list.data
  const running = d?.strategies.filter((i) => i.status === 'running').length ?? 0

  return (
    <div className="stack">
      <Card
        title={`Strategies — ${accountName(account)}`}
        actions={
          <>
            <button className="link" onClick={() => void list.reload()}>Refresh</button>
            <button className="danger" onClick={() => void stopAll()} title="Every running strategy on all your accounts">
              Stop all (all accounts){running ? ` — ${running} here` : ''}
            </button>
          </>
        }
      >
        <ErrorBox error={list.error ?? error} />
        {d && (
          <p className="muted">
            Logic, size, limits and mode are defined in backend code; here you run them on this account and choose
            symbol and timeframe.{' '}
            Live trading switch (AUTOTRADE_STRATEGIES_LIVE):{' '}
            {d.live_trading_enabled ? (
              <Badge tone="bad">ON — live instances place real orders</Badge>
            ) : (
              <Badge>off — live signals are blocked</Badge>
            )}
          </p>
        )}
        {d?.strategies.length === 0 && <Empty>No strategies on this account yet. Add one below.</Empty>}
        {d?.strategies.map((inst) => (
          <InstanceRow
            key={inst.id}
            inst={inst}
            liveEnabled={d.live_trading_enabled}
            onChange={replace}
            onRemoved={() => void list.reload()}
            onError={setError}
            signalsOpen={openSignals === inst.id}
            toggleSignals={() => setOpenSignals(openSignals === inst.id ? null : inst.id)}
            pushed={pushed?.instance_id === inst.id ? pushed : null}
          />
        ))}
      </Card>

      {d && <AddInstance account={account} data={d} onAdded={() => void list.reload()} />}
    </div>
  )
}

function InstanceRow({
  inst,
  liveEnabled,
  onChange,
  onRemoved,
  onError,
  signalsOpen,
  toggleSignals,
  pushed,
}: {
  inst: Instance
  liveEnabled: boolean
  onChange: (i: Instance) => void
  onRemoved: () => void
  onError: (e: string | null) => void
  signalsOpen: boolean
  toggleSignals: () => void
  pushed: Signal | null
}) {
  const [editing, setEditing] = useState(false)
  const [symbol, setSymbol] = useState(inst.symbol)
  const [timeframe, setTimeframe] = useState(inst.timeframe)
  const [busy, setBusy] = useState(false)
  const path = { params: { path: { instance_id: inst.id } } }
  const stopped = inst.status === 'stopped' || inst.status === 'error'

  async function act(fn: () => Promise<void>) {
    setBusy(true)
    onError(null)
    try {
      await fn()
    } catch (e) {
      onError(`#${inst.id} ${inst.label}: ${errorMessage(e)}`)
    } finally {
      setBusy(false)
    }
  }

  function start() {
    if (inst.mode === 'live') {
      const msg = liveEnabled
        ? `#${inst.id} ${inst.label} is in LIVE mode and will place REAL orders (${inst.quantity} per trade) on ${inst.symbol} with this account's broker. Start?`
        : `#${inst.id} ${inst.label} is in LIVE mode. The global live switch is off, so its signals will be blocked. Start anyway?`
      if (!window.confirm(msg)) return
    }
    void act(async () => onChange(await unwrap<Instance>(api.POST('/api/strategies/{instance_id}/start', path))))
  }

  function stop() {
    void act(async () => onChange(await unwrap<Instance>(api.POST('/api/strategies/{instance_id}/stop', path))))
  }

  function save(e: FormEvent) {
    e.preventDefault()
    void act(async () => {
      const updated = await unwrap<Instance>(
        api.PATCH('/api/strategies/{instance_id}', { ...path, body: { symbol: symbol.trim(), timeframe } }),
      )
      onChange(updated)
      setEditing(false)
    })
  }

  function remove() {
    if (!window.confirm(`Remove #${inst.id} ${inst.label} on ${inst.symbol} ${inst.timeframe}? Its signal history is kept.`)) return
    void act(async () => {
      await unwrap(api.DELETE('/api/strategies/{instance_id}', path))
      onRemoved()
    })
  }

  return (
    <div className="instance">
      <div className="instance-head">
        <div>
          <strong>
            #{inst.id} {inst.label}
          </strong>{' '}
          <Badge tone={statusTone(inst.status)}>{inst.status}</Badge>{' '}
          <Badge tone={inst.mode === 'live' ? 'bad' : ''}>{inst.mode}</Badge>
          <div className="muted small-text">{inst.description}</div>
        </div>
        <div className="buttons">
          {inst.status === 'running' ? (
            <button disabled={busy} onClick={stop}>Stop</button>
          ) : (
            <button className="buy" disabled={busy || !stopped} onClick={start}>Start</button>
          )}
          <button disabled={busy || !stopped} onClick={() => setEditing(!editing)} title={stopped ? '' : 'Stop it first'}>
            {editing ? 'Cancel edit' : 'Edit'}
          </button>
          <button className="danger" disabled={busy || !stopped} onClick={remove} title={stopped ? '' : 'Stop it first'}>
            Remove
          </button>
          <button className="link" onClick={toggleSignals}>
            {signalsOpen ? 'Hide signals' : 'Signals'}
          </button>
        </div>
      </div>

      {editing ? (
        <form className="row-form" onSubmit={save}>
          <label>
            Symbol
            <input value={symbol} onChange={(e) => setSymbol(e.target.value)} required />
          </label>
          <label>
            Timeframe
            <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
              {inst.timeframes.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={busy}>Save</button>
        </form>
      ) : (
        <dl className="kv inline">
          <dt>Symbol</dt>
          <dd>{inst.symbol}</dd>
          <dt>Timeframe</dt>
          <dd>{inst.timeframe}</dd>
          <dt>Qty</dt>
          <dd>{inst.quantity}</dd>
          <dt>Max pos</dt>
          <dd>{inst.max_position}</dd>
          <dt>Orders today</dt>
          <dd>
            {inst.orders_today ?? '—'} / {inst.max_orders_per_day}
          </dd>
          <dt>Position</dt>
          <dd>{inst.position ?? '—'}</dd>
          <dt>Last price</dt>
          <dd>{fmtNum(inst.last_price)}</dd>
        </dl>
      )}
      {inst.last_error && <div className="error">{inst.last_error}</div>}
      {signalsOpen && <SignalList instanceId={inst.id} pushed={pushed} />}
    </div>
  )
}

function SignalList({ instanceId, pushed }: { instanceId: number; pushed: Signal | null }) {
  const signals = useLoad(
    () =>
      unwrap<Signal[]>(
        api.GET('/api/strategies/{instance_id}/signals', {
          params: { path: { instance_id: instanceId }, query: { limit: 100 } },
        }),
      ),
    [instanceId],
  )

  useEffect(() => {
    if (pushed) signals.setData((s) => (s?.some((x) => x.id === pushed.id) ? s : [pushed, ...(s ?? [])]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pushed])

  return (
    <div className="signals">
      <ErrorBox error={signals.error} />
      {signals.data?.length === 0 && <Empty>No signals yet.</Empty>}
      {!!signals.data?.length && (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Side</th>
                <th className="num">Qty</th>
                <th className="num">Price</th>
                <th>Mode</th>
                <th>Outcome</th>
                <th>Reason</th>
                <th>Message</th>
                <th>Order</th>
              </tr>
            </thead>
            <tbody>
              {signals.data.map((s) => (
                <tr key={s.id}>
                  <td>{fmtTime(s.at)}</td>
                  <td className={s.side === 'BUY' ? 'pos' : 'neg'}>{s.side}</td>
                  <td className="num">{s.quantity}</td>
                  <td className="num">{fmtNum(s.price)}</td>
                  <td>{s.mode}</td>
                  <td>
                    <Badge tone={statusTone(s.outcome)}>{s.outcome}</Badge>
                  </td>
                  <td>{s.reason}</td>
                  <td className="muted">{s.message}</td>
                  <td className="muted">{s.order_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function AddInstance({ account, data, onAdded }: { account: Account; data: StrategiesList; onAdded: () => void }) {
  const [key, setKey] = useState(data.deployments[0]?.key ?? '')
  const dep = data.deployments.find((d) => d.key === key)
  const [symbol, setSymbol] = useState(dep?.default_symbol ?? '')
  const [timeframe, setTimeframe] = useState(dep?.default_timeframe ?? '')
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function pick(k: string) {
    setKey(k)
    const d = data.deployments.find((x) => x.key === k)
    setSymbol(d?.default_symbol ?? '')
    setTimeframe(d?.default_timeframe ?? '')
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      const inst = await unwrap<Instance & { warning?: string | null }>(
        api.POST('/api/strategies', {
          body: { deployment_key: key, account_id: account.id, symbol: symbol.trim(), timeframe },
        }),
      )
      setNote(`Added #${inst.id} on ${inst.symbol} ${inst.timeframe} (stopped).${inst.warning ? ` Warning: ${inst.warning}` : ''}`)
      onAdded()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (data.deployments.length === 0) return null
  return (
    <Card title={`Add a strategy to ${account.label}`}>
      <form className="row-form" onSubmit={submit}>
        <label>
          Deployment
          <select value={key} onChange={(e) => pick(e.target.value)}>
            {data.deployments.map((d) => (
              <option key={d.key} value={d.key}>
                {d.key} ({d.strategy}, {d.mode})
              </option>
            ))}
          </select>
        </label>
        <label>
          Symbol
          <input value={symbol} onChange={(e) => setSymbol(e.target.value)} required />
        </label>
        <label>
          Timeframe
          <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
            {dep?.timeframes.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={busy || !key}>Add</button>
      </form>
      {dep && <p className="muted small-text">{dep.description}</p>}
      <ErrorBox error={error} />
      {note && <p className="ok">{note}</p>}
    </Card>
  )
}
