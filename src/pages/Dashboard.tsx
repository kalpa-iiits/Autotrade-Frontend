import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { brokerTitle, needsLogin, startBrokerLogin, useAccounts, useCurrentAccount } from '../accounts'
import { api, errorMessage, unwrap } from '../api/client'
import type { Account, ClosedTrades, Instance, Order, Signal, TradePosition } from '../api/types'
import { AreaChart, type Point } from '../components/charts'
import { Icon } from '../components/icons'
import { Page } from '../components/Page'
import { BrokerPills, MarketPill, openPalette } from '../components/StatusPills'
import {
  Card,
  Empty,
  ErrorBox,
  NeedAccount,
  Pill,
  Pnl,
  Seg,
  fmtClock,
  fmtMoney,
  fmtNum,
  fmtPct,
  fmtQty,
  istDay,
  shortSymbol,
  useLoad,
  useNow,
} from '../components/ui'
import { istHeadline, marketStatus } from '../market'
import { accountValue, pnlByStrategy, useSummary } from '../summary'

export default function Dashboard() {
  const account = useCurrentAccount()
  const now = useNow(30_000)
  return (
    <Page
      title="Dashboard"
      sub={istHeadline(now)}
      band
      actions={
        <>
          <button className="search-trigger" onClick={openPalette}>
            <Icon name="search" size={15} /> Search symbols, strategies…
            <span className="kbd">⌘K</span>
          </button>
          <MarketPill />
          <BrokerPills />
        </>
      }
    >
      {account ? <AccountDashboard key={account.id} account={account} /> : <NeedAccount />}
    </Page>
  )
}

function AccountDashboard({ account }: { account: Account }) {
  const { funds, orders, positions, trades, closedToday: today, strategies } = useSummary()

  const value = accountValue(account.broker, funds.data, positions.data, trades.data)
  const realized = (today.data?.totals.realized_pnl ?? 0) + (trades.data?.totals.realized_pnl ?? 0)
  const open = trades.data?.totals.unrealized_pnl ?? 0
  const book = orders.data ?? []
  const insts = strategies.data?.strategies ?? []
  const running = insts.filter((i) => i.status === 'running').length

  // Value tied up in open positions (at cost), against the account's value.
  const inUse = (positions.data ?? []).reduce((s, p) => s + Math.abs(p.quantity * p.avg_price), 0)

  const byStrategy = useMemo(() => pnlByStrategy(today.data, trades.data), [today.data, trades.data])

  return (
    <>
      <ReadyCheck />
      <ErrorBox error={funds.error && !needsLogin(account) ? funds.error : null} />

      <div className="grid-4">
        <div className="card stat">
          <div className="label">Today’s P&amp;L</div>
          <Pnl value={today.data || trades.data ? realized + open : null} className="figure" />
          <div className="foot">
            <span>
              Realized <Pnl value={realized} />
            </span>
            <span>
              Open <Pnl value={trades.data?.totals.unrealized_pnl ?? null} />
            </span>
          </div>
        </div>
        <div className="card stat">
          <div className="label">Available cash</div>
          <div className="figure">{funds.data ? fmtMoney(funds.data.cash) : '—'}</div>
          <div className="meter" style={{ marginTop: 14 }}>
            <span style={{ width: `${value ? Math.min(100, (inUse / value) * 100) : 0}%` }} />
          </div>
          <div className="foot">
            {fmtMoney(inUse, { decimals: false })} in use{value ? ` · ${Math.round((inUse / value) * 100)}%` : ''}
          </div>
        </div>
        <div className="card stat">
          <div className="label">Strategies</div>
          <div className="row" style={{ alignItems: 'baseline' }}>
            <span className="figure">{running}</span>
            <span className="muted small">of {insts.length} running</span>
          </div>
          <div className="foot">
            <Pill tone="good">{running} running</Pill>
            <Pill tone="muted">{insts.length - running} stopped</Pill>
          </div>
        </div>
        <div className="card stat">
          <div className="label">Orders today</div>
          <span className="figure">{book.length}</span>
          <div className="foot">
            <span><b>{book.filter((o) => o.status === 'FILLED').length}</b> filled</span>
            <span><b>{book.filter((o) => o.status === 'OPEN').length}</b> open</span>
            <span><b>{book.filter((o) => o.status === 'REJECTED').length}</b> rejected</span>
          </div>
        </div>
      </div>

      <div className="split">
        <AccountValue account={account} value={value} unrealized={open} />
        <Card title="Strategies" actions={<Link to="/my-strategies" className="small" style={{ textDecoration: 'none' }}>Manage →</Link>} flush>
          {insts.length === 0 && (
            <Empty action={<Link to="/strategies"><button className="sm">Add a strategy</button></Link>}>No strategies on this account yet.</Empty>
          )}
          {insts.map((i) => (
            <StrategyLine key={i.id} inst={i} account={account} pnl={byStrategy.get(i.label)} />
          ))}
        </Card>
      </div>

      <div className="split even">
        <OpenPositions account={account} positions={trades.data?.positions} error={trades.error} />
        <Activity account={account} orders={book} instances={insts} />
      </div>
    </>
  )
}

/** What blocks trading right now, each with its one-click fix. */
function ReadyCheck() {
  const { accounts, current } = useAccounts()
  const [error, setError] = useState<string | null>(null)
  const market = marketStatus()
  const daily = (accounts ?? []).filter((a) => a.needs_daily_login)
  const conn = current?.connection?.broker
  const lastTick = conn?.last_tick_at ? Date.now() - new Date(conn.last_tick_at).getTime() : null
  const dataLive = !!conn?.connected && (current?.broker === 'paper' || (lastTick !== null && lastTick < 120_000) || !market.open)
  const checks = [
    ...daily.map((a) => ({
      ok: !needsLogin(a),
      text: needsLogin(a) ? `${brokerTitle(a.broker)} ${a.last_login_date ? 'session expired' : 'not logged in'}` : `${brokerTitle(a.broker)} logged in`,
    })),
    { ok: dataLive, text: dataLive ? (market.open || current?.broker === 'paper' ? 'Market data live' : 'Broker connected') : 'No market data' },
  ]
  const passed = checks.filter((c) => c.ok).length
  const pending = daily.filter(needsLogin)
  const first = pending[0]

  async function login(a: Account) {
    setError(null)
    try {
      await startBrokerLogin(a.id)
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <div className="card ready">
      <div>
        <h2 style={{ fontSize: 15, marginBottom: 4 }}>{passed === checks.length ? 'Ready to trade' : 'Ready to trade?'}</h2>
        <div className="small muted">
          {passed} of {checks.length} checks passed
          {pending.length > 0 && ` — strategies on ${pending.map((a) => brokerTitle(a.broker)).join(', ')} are paused until you log in.`}
          {pending.length === 0 && !dataLive && ' — reconnect the account on the Accounts page.'}
        </div>
        <ErrorBox error={error} />
      </div>
      <div className="checks">
        {checks.map((c) => (
          <span key={c.text} className={`check ${c.ok ? '' : 'bad'}`}>
            <span className="mark">{c.ok ? <Icon name="check" size={11} /> : '!'}</span>
            {c.text}
          </span>
        ))}
        {first && (
          <button className="primary" onClick={() => void login(first)}>
            Log in to {brokerTitle(first.broker)}
          </button>
        )}
      </div>
    </div>
  )
}

type Range = '1W' | '1M' | '3M' | 'ALL'
const RANGE_DAYS: Record<Range, number | null> = { '1W': 7, '1M': 30, '3M': 90, ALL: null }
const RANGE_TEXT: Record<Range, string> = { '1W': 'this week', '1M': 'this month', '3M': 'in 3 months', ALL: 'all time' }
const DAY_MS = 86_400_000

/**
 * Account value over time, rebuilt from closed trades: today's value minus the P&L of every
 * trade closed after each day. Deposits and withdrawals aren't known, so they don't show.
 */
function AccountValue({ account, value, unrealized }: { account: Account; value: number | null; unrealized: number }) {
  const [range, setRange] = useState<Range>('1M')
  const days = RANGE_DAYS[range]
  const closed = useLoad(
    () =>
      unwrap<ClosedTrades>(
        api.GET('/api/trades/closed', {
          params: { query: { account_id: account.id, since: days ? new Date(Date.now() - days * DAY_MS).toISOString() : undefined, limit: 1000 } },
        }),
      ),
    [range],
  )

  const points = useMemo<Point[]>(() => {
    if (value === null || !closed.data) return []
    const rows = [...closed.data.positions].sort((a, b) => (a.closed_at ?? '').localeCompare(b.closed_at ?? ''))
    const now = Date.now()
    const first = days ? now - days * DAY_MS : rows.length ? new Date(rows[0].closed_at!).getTime() - DAY_MS : now - 7 * DAY_MS
    const base = value - unrealized
    const out: Point[] = []
    for (let t = first; t < now; t += DAY_MS) {
      const later = rows.filter((r) => new Date(r.closed_at!).getTime() > t).reduce((s, r) => s + r.realized_pnl, 0)
      out.push({ t, v: base - later })
    }
    out.push({ t: now, v: value })
    return out
  }, [closed.data, value, unrealized, days])

  const change = points.length > 1 ? points[points.length - 1].v - points[0].v : null
  const startValue = points[0]?.v
  return (
    <Card
      title="Account value"
      actions={<Seg label="Range" value={range} onChange={setRange} options={(['1W', '1M', '3M', 'ALL'] as Range[]).map((r) => ({ value: r, label: r }))} />}
    >
      <div className="row" style={{ alignItems: 'baseline', gap: 12, marginTop: -6, marginBottom: 10 }}>
        <span className="figure md">{fmtMoney(value)}</span>
        {change !== null && (
          <span className={`mono small ${change >= 0 ? 'pos' : 'neg'}`}>
            {change >= 0 ? '▲' : '▼'} {fmtMoney(change, { sign: true, decimals: false })} ({fmtPct(startValue ? (change / startValue) * 100 : 0)}) {RANGE_TEXT[range]}
          </span>
        )}
      </div>
      <ErrorBox error={closed.error} />
      {value === null ? (
        <Empty>{needsLogin(account) ? 'Log in to the broker to see this account’s value.' : 'No funds data from the broker yet.'}</Empty>
      ) : (
        <AreaChart
          points={points}
          height={230}
          format={(v) => fmtMoney(v, { decimals: false })}
          formatX={(t) => new Date(t).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' })}
        />
      )}
    </Card>
  )
}

function StrategyLine({ inst, account, pnl }: { inst: Instance; account: Account; pnl: number | undefined }) {
  const waiting = needsLogin(account)
  const tone = inst.status === 'running' ? 'good' : inst.status === 'error' ? 'bad' : waiting ? 'warn' : ''
  let sub: string
  if (inst.status === 'error') sub = 'Stopped with an error'
  else if (inst.status !== 'running') sub = waiting ? 'Waiting for login' : 'Stopped'
  else if (inst.position) sub = 'In position'
  else sub = `${inst.orders_today ?? 0} / ${inst.max_orders_per_day} orders`
  return (
    <div className="list-row">
      <span className={`dot ${tone}`} />
      <div className="grow">
        <div style={{ fontWeight: 500 }}>{inst.label}</div>
        <div className="mono tiny muted">
          {shortSymbol(inst.symbol)} · {inst.timeframe} · {brokerTitle(account.broker)}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <Pnl value={pnl ?? (inst.status === 'running' ? 0 : null)} />
        <div className={`tiny ${inst.status === 'error' ? 'neg' : 'muted'}`}>{sub}</div>
      </div>
    </div>
  )
}

function OpenPositions({ account, positions, error }: { account: Account; positions: TradePosition[] | undefined; error: string | null }) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const navigate = useNavigate()
  const real = account.broker === 'paper' ? '' : ' These are REAL orders.'

  async function exit(list: TradePosition[]) {
    const what = list.map((p) => `${p.direction === 'LONG' ? 'SELL' : 'BUY'} ${p.quantity} ${shortSymbol(p.symbol)}`).join(', ')
    if (!window.confirm(`Exit at market on ${account.label}: ${what}?${real}`)) return
    setBusy(true)
    setNote(null)
    try {
      for (const p of list) {
        await unwrap(
          api.POST('/api/accounts/{account_id}/orders', {
            params: { path: { account_id: account.id } },
            body: { symbol: p.symbol, side: p.direction === 'LONG' ? 'SELL' : 'BUY', quantity: p.quantity, order_type: 'MARKET' },
          }),
        )
      }
      setNote(`Sent ${list.length} exit order${list.length === 1 ? '' : 's'}.`)
    } catch (e) {
      setNote(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const rows = positions ?? []
  return (
    <Card
      title="Open positions"
      count={rows.length}
      flush
      actions={rows.length > 0 && <button className="sm" disabled={busy} onClick={() => void exit(rows)}>Exit all</button>}
    >
      <div style={{ padding: '0 18px' }}>
        <ErrorBox error={error} />
        {note && <div className="small muted" style={{ paddingTop: 8 }}>{note}</div>}
      </div>
      {rows.length === 0 ? (
        <Empty action={<button className="sm" onClick={() => navigate('/orders')}>Place an order</button>}>No open positions.</Empty>
      ) : (
        <div className="table-wrap" style={{ marginTop: 10 }}>
          <table>
            <thead>
              <tr>
                <th>Instrument</th>
                <th className="num">Qty</th>
                <th className="num">Avg</th>
                <th className="num">LTP</th>
                <th className="num">P&amp;L</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const cost = p.avg_entry_price * p.quantity
                return (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{shortSymbol(p.symbol)}</div>
                      <div className="sub">
                        {p.strategy ?? 'Manual'} · {p.direction === 'LONG' ? 'Long' : 'Short'}
                      </div>
                    </td>
                    <td className="num">{fmtQty(p.quantity)}</td>
                    <td className="num muted">{fmtNum(p.avg_entry_price)}</td>
                    <td className="num">{fmtNum(p.last_price)}</td>
                    <td className="num">
                      <Pnl value={p.unrealized_pnl} />
                      {p.unrealized_pnl !== null && p.unrealized_pnl !== undefined && cost > 0 && (
                        <div className={`tiny mono ${p.unrealized_pnl >= 0 ? 'pos' : 'neg'}`}>{fmtPct((p.unrealized_pnl / cost) * 100)}</div>
                      )}
                    </td>
                    <td className="num">
                      <button className="link" disabled={busy} onClick={() => void exit([p])}>
                        Exit
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

interface Event {
  at: string
  text: string
  tone: 'good' | 'bad' | 'info' | 'idle'
}

/** Today's orders and strategy signals, newest first. */
function Activity({ account, orders, instances }: { account: Account; orders: Order[]; instances: Instance[] }) {
  const ids = instances.map((i) => i.id).join(',')
  const signals = useLoad(async () => {
    const lists = await Promise.all(
      instances.map((i) =>
        unwrap<Signal[]>(api.GET('/api/strategies/{instance_id}/signals', { params: { path: { instance_id: i.id }, query: { limit: 20 } } })).then((s) =>
          s.map((x) => ({ ...x, label: i.label })),
        ),
      ),
    )
    return lists.flat()
  }, [ids, orders.length])

  const events = useMemo<Event[]>(() => {
    const today = istDay()
    const out: Event[] = []
    for (const o of orders) {
      const sym = shortSymbol(o.symbol)
      const at = o.updated_at ?? o.created_at ?? ''
      if (o.status === 'FILLED') out.push({ at, tone: 'good', text: `${o.side} ${fmtQty(o.filled_quantity)} ${sym} filled @ ${fmtNum(o.filled_price)}` })
      else if (o.status === 'REJECTED') out.push({ at, tone: 'bad', text: `${o.side} ${fmtQty(o.quantity)} ${sym} rejected${o.reason ? ` — ${o.reason}` : ''}` })
      else if (o.status === 'CANCELLED') out.push({ at, tone: 'idle', text: `${o.side} ${fmtQty(o.quantity)} ${sym} cancelled` })
      else out.push({ at, tone: 'info', text: `${o.side} ${fmtQty(o.quantity)} ${sym} ${o.order_type}${o.trigger_price ? ` @ ${fmtNum(o.trigger_price)}` : o.limit_price ? ` @ ${fmtNum(o.limit_price)}` : ''} open` })
    }
    for (const s of signals.data ?? []) {
      if (istDay(new Date(s.at)) !== today) continue
      out.push({
        at: s.at,
        tone: s.outcome === 'blocked' || s.outcome === 'rejected' ? 'bad' : 'idle',
        text: `${s.label}: ${s.side.toLowerCase()} signal${s.reason ? ` — ${s.reason}` : ''}${s.outcome === 'signal_only' ? '' : ` (${s.outcome})`}`,
      })
    }
    return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8)
  }, [orders, signals.data])

  return (
    <Card title="Activity">
      {events.length === 0 ? (
        <Empty>Nothing yet today on {account.label}. Orders and strategy signals show up here as they happen.</Empty>
      ) : (
        <ul className="activity" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {events.map((e, i) => (
            <li key={i}>
              <time>{fmtClock(e.at)}</time>
              <span className={`dot ${e.tone === 'idle' ? '' : e.tone}`} />
              <span>{e.text}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
