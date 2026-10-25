import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { accountName, useAccounts } from '../accounts'
import { api, unwrap } from '../api/client'
import type { ClosedTrades, TradePosition } from '../api/types'
import { AreaChart, Ring } from '../components/charts'
import { Icon } from '../components/icons'
import { Page } from '../components/Page'
import {
  Card,
  Empty,
  ErrorBox,
  Seg,
  fmtClock,
  fmtCompact,
  fmtDate,
  fmtDuration,
  fmtMoney,
  fmtNum,
  fmtQty,
  istDay,
  shortSymbol,
  useLoad,
} from '../components/ui'

type Period = 'today' | 'week' | 'month' | '3m' | 'custom'

// All dates are IST trading days (YYYY-MM-DD).
function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function periodRange(p: Period, custom: { from: string; to: string }): { from: string; to: string } {
  const today = istDay()
  if (p === 'today') return { from: today, to: today }
  if (p === 'week') {
    const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7 // 0 = Monday
    return { from: addDays(today, -dow), to: today }
  }
  if (p === 'month') return { from: `${today.slice(0, 8)}01`, to: today }
  if (p === '3m') return { from: addDays(today, -90), to: today }
  return { from: custom.from || addDays(today, -30), to: custom.to || today }
}

const MANUAL = 'Manual'

export default function Trades() {
  const { accounts, current } = useAccounts()
  const navigate = useNavigate()
  const [period, setPeriod] = useState<Period>('month')
  const [custom, setCustom] = useState({ from: '', to: '' })
  // The selected account until another choice is made here.
  const [picked, setScope] = useState<string | null>(null)
  const scope = picked ?? (current ? String(current.id) : 'all')
  const [strategy, setStrategy] = useState('all')
  const [symbol, setSymbol] = useState('')
  const range = periodRange(period, custom)
  const accountId = scope === 'all' ? undefined : Number(scope)
  const labelOf = (id: number) => accounts?.find((a) => a.id === id)?.label ?? `#${id} (deleted)`

  const trades = useLoad(
    () =>
      unwrap<ClosedTrades>(
        api.GET('/api/trades/closed', {
          params: {
            query: {
              account_id: accountId,
              symbol: symbol.trim().toUpperCase() || undefined,
              since: `${range.from}T00:00:00+05:30`,
              until: `${addDays(range.to, 1)}T00:00:00+05:30`, // "to" day inclusive
              limit: 1000,
            },
          },
        }),
      ),
    [accountId, symbol, range.from, range.to],
  )

  const all = useMemo(() => trades.data?.positions ?? [], [trades.data])
  const strategies = useMemo(() => [...new Set(all.map((t) => t.strategy ?? MANUAL))].sort(), [all])
  const rows = strategy === 'all' ? all : all.filter((t) => (t.strategy ?? MANUAL) === strategy)
  const stats = useMemo(() => tradeStats(rows), [rows])
  const truncated = strategy === 'all' && (trades.data?.totals.count ?? 0) > all.length

  function exportCsv() {
    const head = ['closed_at', 'account', 'symbol', 'strategy', 'direction', 'quantity', 'entry', 'exit', 'opened_at', 'realized_pnl']
    const lines = rows.map((t) =>
      [t.closed_at, labelOf(t.account_id), t.symbol, t.strategy ?? MANUAL, t.direction, t.entry_quantity, t.avg_entry_price, t.avg_exit_price, t.opened_at, t.realized_pnl]
        .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
        .join(','),
    )
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `trades-${range.from}-to-${range.to}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <Page
      title="Trades"
      sub="Closed round-trips and how each strategy is really doing."
      actions={
        <button onClick={exportCsv} disabled={!rows.length}>
          <Icon name="download" size={15} /> Export CSV
        </button>
      }
    >
      <div className="row" style={{ gap: 10 }}>
        <Seg
          label="Period"
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'today', label: 'Today' },
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
            { value: '3m', label: '3M' },
            { value: 'custom', label: 'Custom' },
          ]}
        />
        {period === 'custom' && (
          <>
            <input type="date" aria-label="From" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} style={{ width: 150 }} />
            <input type="date" aria-label="To" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} style={{ width: 150 }} />
          </>
        )}
        <select aria-label="Account" value={scope} onChange={(e) => setScope(e.target.value)} style={{ width: 190 }}>
          <option value="all">All my accounts</option>
          {accounts?.map((a) => (
            <option key={a.id} value={a.id}>
              {accountName(a)}
            </option>
          ))}
        </select>
        <select aria-label="Strategy" value={strategy} onChange={(e) => setStrategy(e.target.value)} style={{ width: 190 }}>
          <option value="all">All strategies</option>
          {strategies.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <input placeholder="Symbol, e.g. NSE:SBIN-EQ" value={symbol} onChange={(e) => setSymbol(e.target.value)} style={{ width: 200 }} aria-label="Symbol" />
        <span className="grow" />
        <span className="small muted">
          {fmtDate(range.from)} – {fmtDate(range.to)}
        </span>
      </div>
      <ErrorBox error={trades.error} />
      {truncated && <div className="small muted">Showing the latest {all.length} of {trades.data?.totals.count} trades; stats below cover those.</div>}

      <div className="grid-4" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
        <div className="card stat">
          <div className="label">Net P&amp;L</div>
          <div className={`figure md ${stats.net > 0 ? 'pos' : stats.net < 0 ? 'neg' : ''}`}>{fmtMoney(stats.net, { sign: true, decimals: false })}</div>
          <div className="foot">before charges · {rows.length} trades</div>
        </div>
        <div className="card stat">
          <div className="row" style={{ gap: 14, flexWrap: 'nowrap' }}>
            <Ring value={stats.winRate ?? 0} size={46} />
            <div>
              <div className="label" style={{ marginBottom: 4 }}>Win rate</div>
              <div className="figure md">{stats.winRate === null ? '—' : `${(stats.winRate * 100).toFixed(1)}%`}</div>
            </div>
          </div>
          <div className="foot">
            <span className="pos">{stats.wins} W</span> · <span className="neg">{stats.losses} L</span> · {rows.length} trades
          </div>
        </div>
        <div className="card stat">
          <div className="label">Profit factor</div>
          <div className="figure md">{stats.profitFactor === null ? '—' : stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2)}</div>
          <div className="foot">gross win ÷ gross loss</div>
        </div>
        <div className="card stat">
          <div className="label">Avg win / avg loss</div>
          <div className="mono" style={{ fontSize: 18, fontWeight: 500 }}>
            <span className="pos">{fmtMoney(stats.avgWin, { decimals: false })}</span>
            <span className="faint"> / </span>
            <span className="neg">{fmtMoney(stats.avgLoss, { decimals: false })}</span>
          </div>
          <div className="foot">reward:risk {stats.avgWin && stats.avgLoss ? (stats.avgWin / stats.avgLoss).toFixed(2) : '—'}</div>
        </div>
        <div className="card stat">
          <div className="label">Max drawdown</div>
          <div className={`figure md ${stats.drawdown < 0 ? 'neg' : ''}`}>{fmtMoney(stats.drawdown, { decimals: false })}</div>
          <div className="foot">
            {stats.ddFrom ? `${fmtDate(stats.ddFrom).slice(0, -5)} – ${fmtDate(stats.ddTo).slice(0, -5)} · ${stats.recovered ? 'recovered' : 'not recovered yet'}` : 'none in this period'}
          </div>
        </div>
      </div>

      <div className="split even">
        <Card title="Cumulative P&L">
          {rows.length < 1 ? (
            <Empty action={<button className="sm" onClick={() => navigate('/orders')}>Place an order</button>}>No closed trades in this period.</Empty>
          ) : (
            <AreaChart
              points={stats.curve}
              height={230}
              color="var(--profit)"
              baseline={0}
              format={(v) => fmtCompact(v)}
              formatX={(t) => new Date(t).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' })}
            />
          )}
        </Card>
        <DailyCalendar daily={stats.daily} month={range.to.slice(0, 7)} range={range} />
      </div>

      <Card title="By strategy">
        {stats.byStrategy.length === 0 ? (
          <Empty>Nothing yet.</Empty>
        ) : (
          <div className="stack tight">
            {stats.byStrategy.map((s) => {
              const top = Math.max(...stats.byStrategy.map((x) => Math.abs(x.pnl))) || 1
              return (
                <div key={s.name} className="row" style={{ flexWrap: 'nowrap', gap: 16 }}>
                  <span className="mono small ellipsis" style={{ width: 200 }}>{s.name}</span>
                  <div className={`bar-track grow ${s.pnl < 0 ? 'neg' : ''}`}>
                    <span style={{ width: `${(Math.abs(s.pnl) / top) * 100}%` }} />
                  </div>
                  <span className={`mono num ${s.pnl >= 0 ? 'pos' : 'neg'}`} style={{ width: 110 }}>{fmtMoney(s.pnl, { sign: true, decimals: false })}</span>
                  <span className="small muted num" style={{ width: 70 }}>{s.count} trades</span>
                  <span className="small muted num" style={{ width: 60 }}>{Math.round((s.wins / s.count) * 100)}% win</span>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <Card title="Closed trades" count={rows.length} flush actions={<span className="small muted">Newest first</span>}>
        {rows.length === 0 ? (
          <Empty>No closed trades match these filters.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Instrument</th>
                  {scope === 'all' && <th>Account</th>}
                  <th>Strategy</th>
                  <th>Side</th>
                  <th className="num">Qty</th>
                  <th>Entry</th>
                  <th>Exit</th>
                  <th className="num">Held</th>
                  <th className="num">P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 500 }}>{shortSymbol(t.symbol)}</td>
                    {scope === 'all' && <td className="small">{labelOf(t.account_id)}</td>}
                    <td className="mono small muted">{t.strategy ?? MANUAL}</td>
                    <td>
                      <span className={`tag ${t.direction === 'LONG' ? 'buy' : 'sell'}`}>{t.direction}</span>
                    </td>
                    <td className="num">{fmtQty(t.entry_quantity)}</td>
                    <td className="mono">
                      {fmtNum(t.avg_entry_price)} <span className="tiny muted">{when(t.opened_at, t.closed_at)}</span>
                    </td>
                    <td className="mono">
                      {fmtNum(t.avg_exit_price)} <span className="tiny muted">{t.closed_at ? when(t.closed_at, t.opened_at) : ''}</span>
                    </td>
                    <td className="num small muted">{fmtDuration(t.opened_at, t.closed_at)}</td>
                    <td className={`num mono ${t.realized_pnl >= 0 ? 'pos' : 'neg'}`} style={{ fontWeight: 500 }}>
                      {fmtMoney(t.realized_pnl, { sign: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </Page>
  )
}

/** Time only when both ends are the same day; otherwise date and time. */
function when(iso: string, other: string | null): string {
  if (other && istDay(new Date(iso)) === istDay(new Date(other))) return fmtClock(iso)
  return `${new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' })} ${fmtClock(iso)}`
}

function tradeStats(rows: TradePosition[]) {
  const sorted = [...rows].sort((a, b) => (a.closed_at ?? '').localeCompare(b.closed_at ?? ''))
  const wins = rows.filter((t) => t.realized_pnl > 0)
  const losses = rows.filter((t) => t.realized_pnl < 0)
  const grossWin = wins.reduce((s, t) => s + t.realized_pnl, 0)
  const grossLoss = -losses.reduce((s, t) => s + t.realized_pnl, 0)

  // Cumulative curve and the deepest fall from a running peak.
  let cum = 0
  let peak = 0
  let peakAt: string | null = null
  let drawdown = 0
  let ddFrom: string | null = null
  let ddTo: string | null = null
  const curve = sorted.length ? [{ t: new Date(sorted[0].closed_at!).getTime() - 3_600_000, v: 0 }] : []
  for (const t of sorted) {
    cum += t.realized_pnl
    curve.push({ t: new Date(t.closed_at!).getTime(), v: cum })
    if (cum > peak) {
      peak = cum
      peakAt = t.closed_at
    }
    if (cum - peak < drawdown) {
      drawdown = cum - peak
      ddFrom = peakAt ?? sorted[0].closed_at
      ddTo = t.closed_at
    }
  }
  const recovered = drawdown < 0 && cum >= peak && peakAt !== null && ddTo !== null && peakAt > ddTo

  const daily = new Map<string, number>()
  for (const t of sorted) {
    const d = istDay(new Date(t.closed_at!))
    daily.set(d, (daily.get(d) ?? 0) + t.realized_pnl)
  }

  const groups = new Map<string, { pnl: number; count: number; wins: number }>()
  for (const t of rows) {
    const g = groups.get(t.strategy ?? MANUAL) ?? { pnl: 0, count: 0, wins: 0 }
    g.pnl += t.realized_pnl
    g.count += 1
    g.wins += t.realized_pnl > 0 ? 1 : 0
    groups.set(t.strategy ?? MANUAL, g)
  }

  return {
    net: rows.reduce((s, t) => s + t.realized_pnl, 0),
    wins: wins.length,
    losses: losses.length,
    winRate: rows.length ? wins.length / rows.length : null,
    profitFactor: grossLoss ? grossWin / grossLoss : grossWin ? Infinity : null,
    avgWin: wins.length ? grossWin / wins.length : null,
    avgLoss: losses.length ? grossLoss / losses.length : null,
    drawdown,
    ddFrom,
    ddTo,
    recovered,
    curve,
    daily,
    byStrategy: [...groups.entries()].map(([name, g]) => ({ name, ...g })).sort((a, b) => b.pnl - a.pnl),
  }
}

/** Weekdays of one month, each colored by that day's realized P&L. */
function DailyCalendar({ daily, month, range }: { daily: Map<string, number>; month: string; range: { from: string; to: string } }) {
  const first = `${month}-01`
  const days: (string | null)[] = []
  const lead = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7 // Monday = 0
  for (let i = 0; i < Math.min(lead, 5); i++) days.push(null)
  for (let d = first; d.startsWith(month); d = addDays(d, 1)) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay()
    if (dow !== 0 && dow !== 6) days.push(d)
  }
  const values = [...daily.entries()].filter(([d]) => d.startsWith(month)).map(([, v]) => v)
  const top = Math.max(1, ...values.map(Math.abs))
  const green = values.filter((v) => v > 0).length
  const red = values.filter((v) => v < 0).length
  const title = new Date(`${first}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' })

  return (
    <Card title={`Daily P&L · ${title}`} actions={<span className="small"><span className="pos">{green} green</span> · <span className="neg">{red} red</span></span>}>
      <div className="calendar">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((d) => (
          <div key={d} className="dow">{d}</div>
        ))}
        {days.map((d, i) => {
          if (!d) return <div key={`b${i}`} className="day blank" />
          const v = daily.get(d)
          const inRange = d >= range.from && d <= range.to
          const a = v === undefined ? 0 : 0.18 + 0.55 * (Math.abs(v) / top)
          const bg = v === undefined ? undefined : v >= 0 ? `rgba(52, 211, 153, ${a})` : `rgba(251, 113, 133, ${a})`
          return (
            <div key={d} className={`day ${inRange ? '' : 'out'}`} style={bg ? { background: bg, borderColor: 'transparent' } : undefined} title={v === undefined ? d : `${d}: ${fmtMoney(v, { sign: true })}`}>
              <span className="d">{Number(d.slice(8))}</span>
              {v !== undefined && <b>{fmtCompact(v, { sign: true }).replace('₹', '')}</b>}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
