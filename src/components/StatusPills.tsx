import { Link } from 'react-router-dom'
import { brokerTitle, needsLogin, useAccounts } from '../accounts'
import { marketStatus } from '../market'
import { Pill, useNow } from './ui'

export function MarketPill() {
  useNow(30_000)
  const m = marketStatus()
  return <Pill dot={m.open ? 'good' : 'idle'}>{m.text}</Pill>
}

/** One pill per broker account with a daily login: green when logged in today, amber when not. */
export function BrokerPills() {
  const { accounts } = useAccounts()
  const daily = (accounts ?? []).filter((a) => a.needs_daily_login)
  return (
    <>
      {daily.map((a) =>
        needsLogin(a) ? (
          <Link key={a.id} to="/accounts" style={{ textDecoration: 'none' }}>
            <Pill tone="warn" dot="warn">
              {brokerTitle(a.broker)} · login needed
            </Pill>
          </Link>
        ) : (
          <Pill key={a.id} dot="good">
            {brokerTitle(a.broker)}
          </Pill>
        ),
      )}
    </>
  )
}

export function openPalette() {
  window.dispatchEvent(new Event('autotrade-palette'))
}
