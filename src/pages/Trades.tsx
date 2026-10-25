import { useState } from 'react'
import { useAccounts } from '../accounts'
import { api, unwrap } from '../api/client'
import type { ClosedTrades } from '../api/types'
import { Badge, Card, Empty, ErrorBox, Pnl, fmtNum, fmtTime, useLoad } from '../components/ui'

// Dates are IST trading days.
function nextDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

export default function Trades() {
  const { accounts, current } = useAccounts()
  // "all": every account of yours; otherwise the selected one.
  const [scope, setScope] = useState<'current' | 'all'>('current')
  const accountId = scope === 'current' ? current?.id : undefined
  const labelOf = (id: number) => accounts?.find((a) => a.id === id)?.label ?? `#${id} (deleted)`
  const [symbol, setSymbol] = useState('')
  const [since, setSince] = useState('')
  const [until, setUntil] = useState('')
  const trades = useLoad(
    () =>
      unwrap<ClosedTrades>(
        api.GET('/api/trades/closed', {
          params: {
            query: {
              account_id: accountId,
              symbol: symbol || undefined,
              since: since ? `${since}T00:00:00+05:30` : undefined,
              until: until ? `${nextDay(until)}T00:00:00+05:30` : undefined, // "To" day inclusive
              limit: 500,
            },
          },
        }),
      ),
    [accountId, symbol, since, until],
  )
  const t = trades.data?.totals

  return (
    <div className="stack">
      <Card
        title="Closed trades"
        actions={
          <>
            <select className="small" aria-label="Accounts" value={scope} onChange={(e) => setScope(e.target.value as 'current' | 'all')}>
              <option value="current">{current ? `${current.label} only` : 'Selected account'}</option>
              <option value="all">All my accounts</option>
            </select>
            <input className="small" placeholder="Symbol" value={symbol} onChange={(e) => setSymbol(e.target.value.trim())} />
            <label className="inline">
              From <input className="small" type="date" value={since} onChange={(e) => setSince(e.target.value)} />
            </label>
            <label className="inline">
              To <input className="small" type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
            </label>
            <button className="link" onClick={() => void trades.reload()}>Refresh</button>
          </>
        }
      >
        <ErrorBox error={trades.error} />
        {t && (
          <div className="totals">
            <div>
              <span className="muted">Trades</span>
              <strong>{t.count}</strong>
            </div>
            <div>
              <span className="muted">Realized P&amp;L</span>
              <strong>
                <Pnl value={t.realized_pnl} />
              </strong>
            </div>
            <div>
              <span className="muted">Wins / losses</span>
              <strong>
                <span className="pos">{t.wins}</span> / <span className="neg">{t.losses}</span>
              </strong>
            </div>
            <div>
              <span className="muted">Win rate</span>
              <strong>{t.win_rate === null ? '—' : `${(t.win_rate * 100).toFixed(1)}%`}</strong>
            </div>
          </div>
        )}
        {trades.data?.positions.length === 0 && <Empty>No closed trades.</Empty>}
        {!!trades.data?.positions.length && (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Closed</th>
                  <th>Account</th>
                  <th>Symbol</th>
                  <th>Dir</th>
                  <th className="num">Qty</th>
                  <th className="num">Entry</th>
                  <th className="num">Exit</th>
                  <th className="num">P&amp;L</th>
                  <th>Opened</th>
                </tr>
              </thead>
              <tbody>
                {trades.data.positions.map((p) => (
                  <tr key={p.id}>
                    <td>{fmtTime(p.closed_at)}</td>
                    <td>
                      {labelOf(p.account_id)} <span className="muted small-text">{p.broker}</span>
                    </td>
                    <td>{p.symbol}</td>
                    <td>
                      <Badge tone={p.direction === 'LONG' ? 'good' : 'bad'}>{p.direction}</Badge>
                    </td>
                    <td className="num">{p.entry_quantity}</td>
                    <td className="num">{fmtNum(p.avg_entry_price)}</td>
                    <td className="num">{fmtNum(p.avg_exit_price)}</td>
                    <td className="num">
                      <Pnl value={p.realized_pnl} />
                    </td>
                    <td className="muted">{fmtTime(p.opened_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
