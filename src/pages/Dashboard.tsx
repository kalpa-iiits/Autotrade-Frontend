import { useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useAccounts, useCurrentAccount } from '../accounts'
import { api, unwrap } from '../api/client'
import type { Account, Funds, OpenTrades, OrdersMessage } from '../api/types'
import { Badge, Card, Empty, ErrorBox, NeedAccount, Pnl, fmtNum, fmtTime, useLoad } from '../components/ui'
import { useLive } from '../live'

export default function Dashboard() {
  const account = useCurrentAccount()
  if (!account) return <NeedAccount title="Dashboard" />
  // Keyed by account: switching accounts starts every card fresh.
  return <AccountDashboard key={account.id} account={account} />
}

function AccountDashboard({ account }: { account: Account }) {
  const { reload: reloadAccounts } = useAccounts()
  const path = { params: { path: { account_id: account.id } } }
  const funds = useLoad(() => unwrap<Funds>(api.GET('/api/accounts/{account_id}/funds', path)))
  const positions = useLoad(() => unwrap(api.GET('/api/accounts/{account_id}/positions', path)))
  const trades = useLoad(() =>
    unwrap<OpenTrades>(api.GET('/api/trades/open', { params: { query: { account_id: account.id } } })),
  )

  // Refresh account data shortly after fills (several updates can arrive together).
  const timer = useRef<number | undefined>(undefined)
  const onMessage = useCallback(
    (msg: OrdersMessage) => {
      if (msg.type !== 'order_update') return
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => {
        void funds.reload()
        void positions.reload()
        void trades.reload()
      }, 500)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  useLive(onMessage)

  const conn = account.connection?.broker
  return (
    <div className="grid">
      <Card title="Broker account" actions={<button className="link" onClick={() => void reloadAccounts()}>Refresh</button>}>
        <dl className="kv">
          <dt>Account</dt>
          <dd>
            {account.label} <Badge>{account.broker}</Badge>
          </dd>
          <dt>Connected</dt>
          <dd>
            {conn?.connected ? <Badge tone="good">connected</Badge> : <Badge tone="bad">not connected</Badge>}
            {conn && !conn.connected && conn.reason && <span className="muted"> {conn.reason}</span>}
          </dd>
          {account.needs_daily_login && (
            <>
              <dt>Logged in today</dt>
              <dd>{account.logged_in_today ? <Badge tone="good">yes</Badge> : <Badge>no</Badge>}</dd>
            </>
          )}
          {conn?.last_tick_at !== undefined && (
            <>
              <dt>Last tick</dt>
              <dd>{fmtTime(conn.last_tick_at)}</dd>
            </>
          )}
        </dl>
        {!conn?.connected && (
          <p>
            <Link to="/accounts">{account.needs_daily_login ? 'Log in to the broker' : 'Manage accounts'}</Link>
          </p>
        )}
      </Card>

      <Card title="Funds" actions={<button className="link" onClick={() => void funds.reload()}>Refresh</button>}>
        <ErrorBox error={funds.error} />
        {funds.data && (
          <dl className="kv">
            <dt>Cash</dt>
            <dd className="big">{fmtNum(funds.data.cash)}</dd>
            {Object.entries(funds.data.limits ?? {}).map(([k, v]) => (
              <FundRow key={k} label={k} value={v} />
            ))}
          </dl>
        )}
      </Card>

      <Card title="Positions (broker)" actions={<button className="link" onClick={() => void positions.reload()}>Refresh</button>}>
        <ErrorBox error={positions.error} />
        {positions.data?.length === 0 && <Empty>No positions.</Empty>}
        {!!positions.data?.length && (
          <table>
            <thead>
              <tr>
                <th>Symbol</th>
                <th className="num">Qty</th>
                <th className="num">Avg price</th>
              </tr>
            </thead>
            <tbody>
              {positions.data.map((p) => (
                <tr key={p.symbol}>
                  <td>{p.symbol}</td>
                  <td className="num">{p.quantity}</td>
                  <td className="num">{fmtNum(p.avg_price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card
        title="Open trades"
        actions={<button className="link" onClick={() => void trades.reload()}>Refresh</button>}
      >
        <ErrorBox error={trades.error} />
        {trades.data && (
          <>
            <dl className="kv inline">
              <dt>Unrealized P&amp;L</dt>
              <dd>
                <Pnl value={trades.data.totals.unrealized_pnl} />
                {trades.data.totals.unpriced > 0 && (
                  <span className="muted"> ({trades.data.totals.unpriced} without a price)</span>
                )}
              </dd>
              <dt>Realized (partial exits)</dt>
              <dd>
                <Pnl value={trades.data.totals.realized_pnl} />
              </dd>
            </dl>
            {trades.data.positions.length === 0 ? (
              <Empty>No open trades.</Empty>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Dir</th>
                    <th className="num">Qty</th>
                    <th className="num">Entry</th>
                    <th className="num">Last</th>
                    <th className="num">Unrealized</th>
                    <th>Opened</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.data.positions.map((t) => (
                    <tr key={t.id}>
                      <td>{t.symbol}</td>
                      <td>
                        <Badge tone={t.direction === 'LONG' ? 'good' : 'bad'}>{t.direction}</Badge>
                      </td>
                      <td className="num">{t.quantity}</td>
                      <td className="num">{fmtNum(t.avg_entry_price)}</td>
                      <td className="num">{fmtNum(t.last_price)}</td>
                      <td className="num">
                        <Pnl value={t.unrealized_pnl} />
                      </td>
                      <td>{fmtTime(t.opened_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </Card>
    </div>
  )
}

function FundRow({ label, value }: { label: string; value: unknown }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{typeof value === 'number' ? fmtNum(value) : String(value ?? '—')}</dd>
    </>
  )
}
