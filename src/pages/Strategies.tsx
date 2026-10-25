import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { brokerTitle, needsLogin, startBrokerLogin, useCurrentAccount } from '../accounts'
import { api, errorMessage, unwrap } from '../api/client'
import type { Account, CatalogStrategy, Instance, OrdersMessage, Signal } from '../api/types'
import { Sparkline } from '../components/charts'
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
  fmtCompact,
  fmtNum,
  fmtQty,
  fmtTime,
  shortSymbol,
  symbolKind,
  useLoad,
} from '../components/ui'
import { useLive } from '../live'
import { DEFAULT_RANGE, loadCatalog, loadPerformance, preferredSymbol, presetRange, testSymbol, testTimeframe } from '../strategies'
import { pnlByStrategy, useSummary } from '../summary'

export default function Strategies() {
  const account = useCurrentAccount()
  return (
    <Page
      title="Strategies"
      sub="Coded trading strategies — open one for its rules and backtested performance, then run it on an account."
      band
      actions={<MarketPill />}
    >
      <Library account={account} />
      {account ? <AccountStrategies key={account.id} account={account} /> : <NeedAccount />}
    </Page>
  )
}

// ---------- the strategy list ----------


function Library({ account }: { account: Account | null | undefined }) {
  const catalog = useLoad(loadCatalog, [])
  const { strategies } = useSummary()
  return (
    <>
      <ErrorBox error={catalog.error} />
      <div className="grid-3">
        {catalog.data?.map((s) => (
          <LibraryCard key={`${s.key}-${account?.id}`} s={s} account={account} instances={strategies.data?.strategies} />
        ))}
      </div>
      {catalog.data?.length === 0 && <Card><Empty>No strategies are defined in code yet (app/strategies/deployments.py).</Empty></Card>}
    </>
  )
}

function LibraryCard({ s, account, instances }: { s: CatalogStrategy; account: Account | null | undefined; instances: Instance[] | undefined }) {
  const navigate = useNavigate()
  const { strategies, reload } = useSummary()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const symbol = preferredSymbol(s, instances) // where Deploy runs it
  const tested = account ? testSymbol(account) : null // where the card's backtest runs: NIFTY 50
  const timeframe = testTimeframe(s)
  const canTest = !!account && !needsLogin(account)
  const perf = useLoad(
    () => (canTest && tested ? loadPerformance(s.key, account.id, tested, timeframe, presetRange(DEFAULT_RANGE)) : Promise.resolve(undefined)),
    [s.key, account?.id, tested, timeframe, canTest],
  )
  const p = perf.data?.summary.all
  const curve = useMemo(() => [0, ...(perf.data?.trades.map((t) => t.cum_pnl) ?? [])], [perf.data])
  const mine = (instances ?? []).filter((i) => i.deployment_key === s.key)
  const running = mine.filter((i) => i.status === 'running')
  const report = `/strategies/${s.key}`

  /** On: run it on this account (adding it on the shown symbol and its own timeframe if needed). Off: stop it. */
  async function toggle(on: boolean) {
    if (!account) return
    if (on && s.mode === 'live') {
      const live = strategies.data?.live_trading_enabled
      const msg = live
        ? `${s.label} is in LIVE mode and will place REAL orders (${s.quantity} per trade) with ${account.label}. Start it?`
        : `${s.label} is in LIVE mode. The server's live switch is off, so its signals will be blocked. Start anyway?`
      if (!window.confirm(msg)) return
    }
    setBusy(true)
    setError(null)
    try {
      if (on) {
        const inst = mine.find((i) => i.status === 'stopped' || i.status === 'error') ??
          (await unwrap<Instance>(api.POST('/api/strategies', { body: { deployment_key: s.key, account_id: account.id, symbol, timeframe: s.default_timeframe } })))
        await unwrap(api.POST('/api/strategies/{instance_id}/start', { params: { path: { instance_id: inst.id } } }))
      } else {
        for (const inst of running) await unwrap(api.POST('/api/strategies/{instance_id}/stop', { params: { path: { instance_id: inst.id } } }))
      }
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
      reload()
    }
  }

  const deployed = running.length > 0
  const target = deployed ? running.map((i) => `${shortSymbol(i.symbol)} ${i.timeframe}`).join(', ') : `${shortSymbol(mine.find((i) => i.status !== 'running')?.symbol ?? symbol)} ${mine.find((i) => i.status !== 'running')?.timeframe ?? s.default_timeframe}`
  return (
    <section className="card library-card" onClick={() => navigate(report)}>
      <div className="between" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <h3 className="mono ellipsis"><Link to={report} className="plain-link">{s.label}</Link></h3>
          <div className="tiny muted mono" style={{ marginTop: 2 }}>{s.strategy} · built for {s.default_timeframe}</div>
        </div>
        {account && (
          <label className="deploy-toggle" onClick={(e) => e.stopPropagation()} title={needsLogin(account) ? `Log in to ${brokerTitle(account.broker)} first` : `${deployed ? 'Stop' : 'Start'} on ${account.label}: ${target}`}>
            <span className="small">
              {busy ? (deployed ? 'Stopping…' : 'Starting…') : deployed ? 'Deployed' : 'Deploy'}
            </span>
            <Switch on={deployed} label={deployed ? `Stop ${s.label}` : `Deploy ${s.label}`} onChange={(on) => void toggle(on)} disabled={busy || needsLogin(account)} />
          </label>
        )}
      </div>
      <div className="row" style={{ gap: 6 }}>
        {s.tags.map((t) => <span key={t} className="chip">{t}</span>)}
      </div>
      <p className="small muted">{s.description}</p>
      <div className="inset stack tight" style={{ marginTop: 'auto' }}>
        <div className="between">
          <span className="caps tiny">Backtest · {DEFAULT_RANGE} · {tested ? shortSymbol(tested) : 'NIFTY 50'} · {timeframe}</span>
          {curve.length > 1 && <Sparkline values={curve} width={80} height={22} />}
        </div>
        {p ? (
          <div className="kv-grid" style={{ '--cols': 2 } as React.CSSProperties}>
            <div><div className="k">Net P&amp;L</div><Pnl value={p.net_pnl} compact className="small" /></div>
            <div><div className="k">Profitable</div><div className="v">{p.win_rate === null ? '—' : `${p.win_rate.toFixed(0)}%`}</div></div>
            <div><div className="k">Trades</div><div className="v">{p.trades}</div></div>
            <div><div className="k">Max DD</div><div className="v">{p.max_drawdown ? fmtCompact(-p.max_drawdown) : '—'}</div></div>
          </div>
        ) : (
          <div className="small muted">
            {!account ? 'Add a broker account to backtest it.' : !canTest ? 'Log in to the broker to backtest it.' : perf.error ? `Couldn’t backtest: ${perf.error}` : 'Backtesting…'}
          </div>
        )}
      </div>
      {error && <div onClick={(e) => e.stopPropagation()}><ErrorBox error={error} /></div>}
      <div className="library-actions" onClick={(e) => e.stopPropagation()}>
        <Link to={report} className="button-link primary">
          See performance report <Icon name="arrow" size={14} />
        </Link>
      </div>
    </section>
  )
}

type Filter = 'all' | 'running' | 'stopped'

function AccountStrategies({ account }: { account: Account }) {
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

      <h2 style={{ fontSize: 17, marginTop: 8 }}>Running on {account.label}</h2>
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
          <Empty>No strategies on {account.label} yet. Open one of the strategies above and press Deploy.</Empty>
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
            <h3 className="ellipsis"><Link to={`/strategies/${inst.deployment_key}?symbol=${encodeURIComponent(inst.symbol)}&tf=${inst.timeframe}`} className="plain-link">{inst.label}</Link></h3>
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
