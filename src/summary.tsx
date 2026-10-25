import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react'
import { useAccounts } from './accounts'
import { api, unwrap } from './api/client'
import type { ClosedTrades, Funds, OpenTrades, Order, OrdersMessage, Position, StrategiesList } from './api/types'
import { istDay, useLoad } from './components/ui'
import { useLive } from './live'

// What the sidebar, the top bar and several pages all show for the selected account: funds,
// today's orders, open positions and strategies. Loaded once here and refreshed after pushes on
// the account's orders socket, instead of by every component.

type Loaded<T> = ReturnType<typeof useLoad<T>>

interface Summary {
  accountId: number | null
  funds: Loaded<Funds>
  orders: Loaded<Order[]>
  positions: Loaded<Position[]>
  trades: Loaded<OpenTrades>
  /** Trades closed today (IST). */
  closedToday: Loaded<ClosedTrades>
  strategies: Loaded<StrategiesList>
  reload(): void
}

const SummaryContext = createContext<Summary | null>(null)

export function SummaryProvider({ children }: { children: ReactNode }) {
  const accountId = useAccounts().current?.id ?? null
  const path = { params: { path: { account_id: accountId ?? 0 } } }
  // No account selected yet (or none at all): nothing to load, and nothing went wrong.
  const none = <T,>() => Promise.resolve(undefined as T)
  const funds = useLoad(() => (accountId ? unwrap<Funds>(api.GET('/api/accounts/{account_id}/funds', path)) : none<Funds>()), [accountId])
  const orders = useLoad(() => (accountId ? unwrap(api.GET('/api/accounts/{account_id}/orders', path)) : none<Order[]>()), [accountId])
  const positions = useLoad(() => (accountId ? unwrap(api.GET('/api/accounts/{account_id}/positions', path)) : none<Position[]>()), [accountId])
  const trades = useLoad(
    () => (accountId ? unwrap<OpenTrades>(api.GET('/api/trades/open', { params: { query: { account_id: accountId } } })) : none<OpenTrades>()),
    [accountId],
  )
  const closedToday = useLoad(
    () =>
      accountId
        ? unwrap<ClosedTrades>(api.GET('/api/trades/closed', { params: { query: { account_id: accountId, since: `${istDay()}T00:00:00+05:30`, limit: 1000 } } }))
        : none<ClosedTrades>(),
    [accountId],
  )
  const strategies = useLoad(
    () => (accountId ? unwrap<StrategiesList>(api.GET('/api/strategies', { params: { query: { account_id: accountId } } })) : none<StrategiesList>()),
    [accountId],
  )

  const reload = useCallback(() => {
    void funds.reload()
    void orders.reload()
    void positions.reload()
    void trades.reload()
    void closedToday.reload()
    void strategies.reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Several updates often arrive together (a fill, then the strategy's status): refresh once.
  const timer = useRef<number | undefined>(undefined)
  const onMessage = useCallback(
    (msg: OrdersMessage) => {
      if (msg.type === 'order_update') {
        orders.setData((list) => upsertOrder(list ?? [], msg.order))
      } else if (msg.type !== 'strategy_signal' && msg.type !== 'strategy_status') {
        return
      }
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(reload, 600)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reload],
  )
  useLive(onMessage)

  // Unrealized P&L moves with prices: refresh open trades every so often.
  useEffect(() => {
    const t = window.setInterval(() => void trades.reload(), 15_000)
    return () => window.clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId])

  return (
    <SummaryContext.Provider value={{ accountId, funds, orders, positions, trades, closedToday, strategies, reload }}>
      {children}
    </SummaryContext.Provider>
  )
}

export function useSummary(): Summary {
  const ctx = useContext(SummaryContext)
  if (!ctx) throw new Error('useSummary outside SummaryProvider')
  return ctx
}

export function upsertOrder(orders: Order[], order: Order): Order[] {
  const i = orders.findIndex((o) => o.id === order.id)
  if (i === -1) return [order, ...orders]
  const copy = orders.slice()
  copy[i] = order
  return copy
}

/**
 * Account value: cash plus open positions at their last price (avg price when no tick yet).
 * For a paper account cash already went down by what positions cost, so this is the
 * mark-to-market value; for broker accounts it is the broker's cash figure plus open P&L.
 */
export function accountValue(broker: string, funds: Funds | undefined, positions: Position[] | undefined, trades: OpenTrades | undefined): number | null {
  if (!funds || funds.cash === null || funds.cash === undefined) return null
  if (broker !== 'paper') return funds.cash + (trades?.totals.unrealized_pnl ?? 0)
  const last = new Map((trades?.positions ?? []).map((t) => [t.symbol, t.last_price]))
  return (positions ?? []).reduce((v, p) => v + p.quantity * (last.get(p.symbol) ?? p.avg_price), funds.cash)
}

/** Today's P&L per strategy label: trades closed today plus open ones (realized + unrealized). */
export function pnlByStrategy(closedToday: ClosedTrades | undefined, open: OpenTrades | undefined): Map<string, number> {
  const m = new Map<string, number>()
  for (const t of [...(closedToday?.positions ?? []), ...(open?.positions ?? [])]) {
    if (!t.strategy) continue
    m.set(t.strategy, (m.get(t.strategy) ?? 0) + t.realized_pnl + (t.unrealized_pnl ?? 0))
  }
  return m
}
