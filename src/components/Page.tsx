import type { ReactNode } from 'react'
import { brokerTitle, useCurrentAccount } from '../accounts'
import { Icon } from './icons'

/**
 * Page frame: title row, then (with `band`) the selected account's mode band — amber for paper,
 * red for a live broker — so the mode is never ambiguous, then the content.
 */
export function Page({
  title,
  sub,
  actions,
  band,
  children,
}: {
  title: ReactNode
  sub?: ReactNode
  actions?: ReactNode
  band?: boolean
  children: ReactNode
}) {
  const account = useCurrentAccount()
  return (
    <>
      <header className="page-head">
        <div>
          <h1>{title}</h1>
          {sub && <div className="sub">{sub}</div>}
        </div>
        {actions && <div className="head-actions">{actions}</div>}
      </header>
      {band && account && (
        <div className={`mode-band ${account.broker === 'paper' ? 'paper' : 'live'}`}>
          <Icon name={account.broker === 'paper' ? 'info' : 'warn'} size={15} />
          {account.broker === 'paper' ? (
            <span>
              <strong>Paper mode.</strong> Orders are simulated against live prices with virtual cash — nothing is sent to a broker.
            </span>
          ) : (
            <span>
              <strong>Live account.</strong> Orders on {account.label} go to {brokerTitle(account.broker)} with real money.
            </span>
          )}
        </div>
      )}
      <div className="page-body">{children}</div>
    </>
  )
}
