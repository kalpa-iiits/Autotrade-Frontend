import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { brokerTitle, needsLogin, startBrokerLogin, useCurrentAccount } from '../accounts'
import { api, errorMessage, unwrap } from '../api/client'
import type { Account, Deployment, Instance, OrdersMessage, Signal, StrategiesList } from '../api/types'
import { Icon } from '../components/icons'
import { Page } from '../components/Page'
import { MarketPill } from '../components/StatusPills'
import {
  Card,
  Empty,
  ErrorBox,
  Modal,
  NeedAccount,
  Note,
  Pill,
  Pnl,
  Seg,
  StatusPill,
  Switch,
  fmtNum,
  fmtQty,
  fmtTime,
  shortSymbol,
  symbolKind,
  useLoad,
} from '../components/ui'
import { useLive } from '../live'
import { pnlByStrategy, useSummary } from '../summary'

export default function Strategies() {
  const account = useCurrentAccount()
  const addRef = useRef<HTMLDivElement>(null)
  return (
    <Page
      title="Strategies"
      sub="Run your coded strategies on an account — pick the instrument and timeframe here."
      band
      actions={
        <>
          <MarketPill />
          {account && (
            <button className="primary" onClick={() => addRef.current?.scrollIntoView({ behavior: 'smooth' })}>
              <Icon name="plus" size={16} /> New strategy
            </button>
          )}
        </>
      }
    >
      {account ? <AccountStrategies key={account.id} account={account} addRef={addRef} /> : <NeedAccount />}
    </Page>
  )
}

type Filter = 'all' | 'running' | 'stopped'

function AccountStrategies({ account, addRef }: { account: Account; addRef: React.RefObject<HTMLDivElement | null> }) {
  const { strategies: list, closedToday, trades, reload } = useSummary()
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [signalsFor, setSignalsFor] = useState<Instance | null>(null)
  const [pushed, setPushed] = useState<Signal | null>(null)

  const onMessage = useCallback((msg: OrdersMessage) => {
    if (msg.type === 'strategy_signal') setPushed(msg.signal)
  }, [])
  useLive(onMessage)

  const d = list.data
  const insts = d?.strategies ?? []
  const running = insts.filter((i) => i.status === 'running')
  const shown = filter === 'all' ? insts : filter === 'running' ? running : insts.filter((i) => i.status !== 'running')
  const pnl = useMemo(() => pnlByStrategy(closedToday.data, trades.data), [closedToday.data, trades.data])

  function replace(updated: Instance) {
    list.setData((x) => x && { ...x, strategies: x.strategies.map((i) => (i.id === updated.id ? updated : i)) })
  }

  return (
    <>
      {d && <LiveSwitch on={d.live_trading_enabled} />}
      <ErrorBox error={list.error ?? error} />

      <div className="between">
        <Seg
          label="Filter"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All', count: insts.length },
            { value: 'running', label: 'Running', count: running.length },
            { value: 'stopped', label: 'Stopped', count: insts.length - running.length },
          ]}
        />
        <span className="small muted">
          Account: <b style={{ color: 'var(--text)', fontWeight: 500 }}>{account.label}</b> ({account.broker === 'paper' ? 'paper' : brokerTitle(account.broker)})
        </span>
      </div>

      {d && insts.length === 0 && (
        <Card>
          <Empty action={<button className="primary sm" onClick={() => addRef.current?.scrollIntoView({ behavior: 'smooth' })}>Add your first strategy</button>}>
            No strategies on {account.label} yet. Pick one of the strategies defined in code below.
          </Empty>
        </Card>
      )}
      {d && insts.length > 0 && shown.length === 0 && <Card><Empty>No {filter} strategies.</Empty></Card>}

      <div className="grid-3">
        {shown.map((inst) => (
          <InstanceCard
            key={inst.id}
            inst={inst}
            account={account}
            liveEnabled={!!d?.live_trading_enabled}
            todayPnl={pnl.get(inst.label)}
            onChange={replace}
            onRemoved={reload}
            onError={setError}
            onSignals={() => setSignalsFor(inst)}
          />
        ))}
      </div>

      <div ref={addRef}>{d && <AddInstance account={account} data={d} onAdded={reload} />}</div>

      {signalsFor && (
        <Modal title={`Signal log — ${signalsFor.label}`} onClose={() => setSignalsFor(null)} wide>
          <SignalList instanceId={signalsFor.id} pushed={pushed?.instance_id === signalsFor.id ? pushed : null} />
        </Modal>
      )}
    </>
  )
}

/** The server's AUTOTRADE_STRATEGIES_LIVE switch, explained in plain words. */
function LiveSwitch({ on }: { on: boolean }) {
  return (
    <div className="card row" style={{ gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
      <span className="inset" style={{ padding: 10, display: 'grid', placeItems: 'center', color: on ? 'var(--loss)' : 'var(--muted)' }}>
        <Icon name="shield" size={20} />
      </span>
      <div className="grow" style={{ minWidth: 280 }}>
        <div className="row" style={{ marginBottom: 4 }}>
          <b>{on ? 'Live trading is on' : 'Live trading is off'}</b>
          {on ? <Pill tone="bad">Live orders</Pill> : <Pill>Signals only</Pill>}
        </div>
        <div className="small muted">
          {on ? (
            <>Strategies in <b>live</b> mode place real broker orders. Set <code>AUTOTRADE_STRATEGIES_LIVE=false</code> and restart to go back to signals only.</>
          ) : (
            <>Strategies run and log their signals, but no live broker order is placed. This is a server safety switch — set <code>AUTOTRADE_STRATEGIES_LIVE=true</code> and restart to allow live orders.</>
          )}
        </div>
      </div>
      <div className="row" style={{ gap: 28 }}>
        <div>
          <div className="caps tiny">Size, limits, logic</div>
          <div className="small">Defined in backend code</div>
        </div>
        <div>
          <div className="caps tiny">You choose</div>
          <div className="small">Account · symbol · timeframe</div>
        </div>
      </div>
    </div>
  )
}

function InstanceCard({
  inst,
  account,
  liveEnabled,
  todayPnl,
  onChange,
  onRemoved,
  onError,
  onSignals,
}: {
  inst: Instance
  account: Account
  liveEnabled: boolean
  todayPnl: number | undefined
  onChange: (i: Instance) => void
  onRemoved: () => void
  onError: (e: string | null) => void
  onSignals: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [symbol, setSymbol] = useState(inst.symbol)
  const [timeframe, setTimeframe] = useState(inst.timeframe)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const path = { params: { path: { instance_id: inst.id } } }
  const isRunning = inst.status === 'running'
  const stopped = inst.status === 'stopped' || inst.status === 'error'
  const blocked = needsLogin(account)

  async function act(fn: () => Promise<void>) {
    setBusy(true)
    onError(null)
    try {
      await fn()
    } catch (e) {
      onError(`${inst.label}: ${errorMessage(e)}`)
    } finally {
      setBusy(false)
    }
  }

  function toggle(on: boolean) {
    if (!on) {
      void act(async () => onChange(await unwrap<Instance>(api.POST('/api/strategies/{instance_id}/stop', path))))
      return
    }
    if (inst.mode === 'live') {
      const msg = liveEnabled
        ? `${inst.label} is in LIVE mode and will place REAL orders (${inst.quantity} per trade) on ${inst.symbol} with ${account.label}. Start?`
        : `${inst.label} is in LIVE mode. The server's live switch is off, so its signals will be blocked. Start anyway?`
      if (!window.confirm(msg)) return
    }
    void act(async () => onChange(await unwrap<Instance>(api.POST('/api/strategies/{instance_id}/start', path))))
  }

  function save(e: FormEvent) {
    e.preventDefault()
    void act(async () => {
      const updated = await unwrap<Instance & { warning?: string | null }>(
        api.PATCH('/api/strategies/{instance_id}', { ...path, body: { symbol: symbol.trim(), timeframe } }),
      )
      onChange(updated)
      setEditing(false)
      setNote(updated.warning ?? null)
    })
  }

  function remove() {
    if (!window.confirm(`Remove ${inst.label} on ${inst.symbol} ${inst.timeframe}? Its signal history is kept.`)) return
    void act(async () => {
      await unwrap(api.DELETE('/api/strategies/{instance_id}', path))
      onRemoved()
    })
  }

  const ordersPct = inst.max_orders_per_day ? Math.min(100, ((inst.orders_today ?? 0) / inst.max_orders_per_day) * 100) : 0
  const pos = inst.position ?? 0
  return (
    <section className="card strategy-card">
      <div className="between" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <div className="row" style={{ gap: 8 }}>
            <h3 className="ellipsis">{inst.label}</h3>
            <Pill tone={inst.mode === 'live' ? 'bad' : undefined}>{inst.mode}</Pill>
          </div>
          <p className="small muted" style={{ marginTop: 6 }}>{inst.description}</p>
        </div>
        <div className="row" style={{ flexWrap: 'nowrap', gap: 10 }}>
          <span className={`small ${isRunning ? 'pos' : inst.status === 'error' ? 'neg' : 'muted'}`} style={{ fontWeight: 500 }}>
            {isRunning ? 'Running' : inst.status === 'error' ? 'Error' : 'Stopped'}
          </span>
          <Switch on={isRunning} label={isRunning ? 'Stop' : 'Start'} onChange={toggle} disabled={busy || (!isRunning && (!stopped || blocked))} />
        </div>
      </div>

      {editing ? (
        <form className="inset stack tight" onSubmit={save}>
          <label className="field">
            Symbol
            <input className="mono" value={symbol} onChange={(e) => setSymbol(e.target.value)} required />
          </label>
          <span className="field-note">{symbolKind(symbol)}</span>
          <div className="caps tiny">Timeframe</div>
          <Seg label="Timeframe" mono value={timeframe} onChange={setTimeframe} options={inst.timeframes.map((t) => ({ value: t, label: t }))} />
          <div className="row">
            <button type="submit" className="primary sm" disabled={busy}>Save</button>
            <button type="button" className="sm" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <div className="inset kv-grid" style={{ gridTemplateColumns: 'minmax(0, 1.8fr) minmax(0, 1fr) minmax(0, 0.8fr) minmax(0, 1fr)' }}>
          <div><div className="k">Symbol</div><div className="v" title={inst.symbol}>{shortSymbol(inst.symbol)}</div></div>
          <div><div className="k">Timeframe</div><div className="v">{inst.timeframe}</div></div>
          <div><div className="k">Qty</div><div className="v">{fmtQty(inst.quantity)}</div></div>
          <div><div className="k">Max pos</div><div className="v">{fmtQty(inst.max_position)}</div></div>
        </div>
      )}

      <div className="between" style={{ alignItems: 'flex-end' }}>
        <div className="grow" style={{ maxWidth: '62%' }}>
          <div className="between small muted" style={{ marginBottom: 6 }}>
            <span>Orders today</span>
            <span className="mono">{inst.orders_today ?? 0} / {inst.max_orders_per_day}</span>
          </div>
          <div className="meter"><span style={{ width: `${ordersPct}%` }} /></div>
          <div className="small muted" style={{ marginTop: 8 }}>
            Position <span className="mono" style={{ color: 'var(--text)' }}>{pos > 0 ? `Long ${fmtQty(pos)}` : pos < 0 ? `Short ${fmtQty(-pos)}` : 'Flat'}</span>
            {' · '}Last <span className="mono" style={{ color: 'var(--text)' }}>{fmtNum(inst.last_price)}</span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="small muted">Today</div>
          <Pnl value={todayPnl ?? null} className="figure md" />
        </div>
      </div>

      {blocked && !isRunning && (
        <div className="alert warn">
          <span className="dot warn" style={{ marginTop: 6 }} />
          <div className="grow">
            {brokerTitle(account.broker)} is not logged in today — this strategy can’t start.{' '}
            <button className="link" onClick={() => void startBrokerLogin(account.id).catch((e) => onError(errorMessage(e)))}>
              Log in
            </button>
          </div>
        </div>
      )}
      {inst.last_error && <ErrorBox error={inst.last_error} />}
      {note && <Note tone="warn" onClose={() => setNote(null)}>{note}</Note>}

      <div className="actions">
        <button className="sm" onClick={onSignals}>Signal log</button>
        <button className="sm" disabled={busy || !stopped} onClick={() => setEditing(!editing)} title={stopped ? 'Change symbol or timeframe' : 'Stop it first'}>
          Edit
        </button>
        <span className="grow" />
        <button className="link danger small" disabled={busy || !stopped} onClick={remove} title={stopped ? '' : 'Stop it first'}>
          Remove
        </button>
      </div>
    </section>
  )
}

function SignalList({ instanceId, pushed }: { instanceId: number; pushed: Signal | null }) {
  const signals = useLoad(
    () => unwrap<Signal[]>(api.GET('/api/strategies/{instance_id}/signals', { params: { path: { instance_id: instanceId }, query: { limit: 100 } } })),
    [instanceId],
  )

  useEffect(() => {
    if (pushed) signals.setData((s) => (s?.some((x) => x.id === pushed.id) ? s : [pushed, ...(s ?? [])]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pushed])

  return (
    <>
      <ErrorBox error={signals.error} />
      {signals.data?.length === 0 && <Empty>No signals yet. Start the strategy and they show up here as it trades.</Empty>}
      {!!signals.data?.length && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Side</th>
                <th className="num">Qty</th>
                <th className="num">Price</th>
                <th>Outcome</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {signals.data.map((s) => (
                <tr key={s.id}>
                  <td className="mono small">{fmtTime(s.at)}</td>
                  <td><span className={`tag ${s.side === 'BUY' ? 'buy' : 'sell'}`}>{s.side}</span></td>
                  <td className="num">{fmtQty(s.quantity)}</td>
                  <td className="num">{fmtNum(s.price)}</td>
                  <td>
                    <StatusPill status={s.outcome} />
                  </td>
                  <td className="small" style={{ whiteSpace: 'normal', minWidth: 220 }}>
                    {s.reason}
                    {s.message && <div className="sub">{s.message}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
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

  function pick(d: Deployment) {
    setKey(d.key)
    setSymbol(d.default_symbol)
    setTimeframe(d.default_timeframe)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      const inst = await unwrap<Instance & { warning?: string | null }>(
        api.POST('/api/strategies', { body: { deployment_key: key, account_id: account.id, symbol: symbol.trim(), timeframe } }),
      )
      setNote(`Added ${inst.label} on ${shortSymbol(inst.symbol)} ${inst.timeframe}, stopped. Switch it on above when you’re ready.${inst.warning ? ` Warning: ${inst.warning}` : ''}`)
      onAdded()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (data.deployments.length === 0) return null
  const accountText = `${account.label} (${account.broker === 'paper' ? 'paper' : brokerTitle(account.broker)})`
  return (
    <section className="card">
      <h2 style={{ fontSize: 17 }}>Add a strategy to {accountText}</h2>
      <p className="small muted" style={{ marginTop: 4, marginBottom: 18 }}>Three choices. It is added stopped, so you can review it before it trades.</p>
      <form className="side-right" style={{ gridTemplateColumns: 'minmax(0, 1fr) 300px' }} onSubmit={submit}>
        <div className="stack">
          <div>
            <div style={{ fontWeight: 600, marginBottom: 10 }}><span className="step">1</span>Choose a strategy</div>
            <div className="grid-3" style={{ gap: 10 }}>
              {data.deployments.map((d) => (
                <button type="button" key={d.key} className={`option-card ${d.key === key ? 'on' : ''}`} onClick={() => pick(d)} aria-pressed={d.key === key}>
                  <span className="title">{d.key}</span>
                  <span className="mono tiny muted">{d.strategy} · {d.mode}</span>
                  <span className="desc">{d.description}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="row" style={{ alignItems: 'flex-start', gap: 20 }}>
            <div className="grow" style={{ minWidth: 220 }}>
              <div style={{ fontWeight: 600, marginBottom: 10 }}><span className="step">2</span>Instrument</div>
              <input className="mono" value={symbol} onChange={(e) => setSymbol(e.target.value)} required aria-label="Instrument" />
              <div className="field-note" style={{ marginTop: 6 }}>{symbolKind(symbol)}</div>
            </div>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 10 }}><span className="step">3</span>Timeframe</div>
              <Seg label="Timeframe" mono value={timeframe} onChange={setTimeframe} options={(dep?.timeframes ?? []).map((t) => ({ value: t, label: t }))} />
              {dep && (
                <div className={`field-note ${timeframe === dep.default_timeframe ? 'pos' : ''}`} style={{ marginTop: 6 }}>
                  {timeframe === dep.default_timeframe ? '✓ Recommended timeframe for this strategy' : `Built for ${dep.default_timeframe}`}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="inset stack" style={{ padding: 16 }}>
          <div className="caps tiny">Review</div>
          <dl className="kv">
            <dt>Strategy</dt>
            <dd>{key}</dd>
            <dt>Instrument</dt>
            <dd>{shortSymbol(symbol) || '—'}</dd>
            <dt>Timeframe</dt>
            <dd>{timeframe}</dd>
            <dt>Account</dt>
            <dd style={{ fontFamily: 'var(--font)' }}>{accountText}</dd>
            <dt>Mode</dt>
            <dd className={dep?.mode === 'live' ? 'neg' : ''}>{dep?.mode}</dd>
          </dl>
          <button type="submit" className="primary block lg" disabled={busy || !key || !symbol.trim()}>
            {busy ? 'Adding…' : 'Add strategy'}
          </button>
          <div className="tiny muted" style={{ textAlign: 'center' }}>Added as stopped — press Start when ready.</div>
        </div>
      </form>
      <div className="stack tight" style={{ marginTop: 12 }}>
        <ErrorBox error={error} />
        {note && <Note onClose={() => setNote(null)}>{note}</Note>}
      </div>
    </section>
  )
}
