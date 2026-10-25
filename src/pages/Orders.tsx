import { useCallback, useState, type FormEvent } from 'react'
import { accountName, useCurrentAccount } from '../accounts'
import { api, errorMessage, unwrap } from '../api/client'
import type { Account, HistoryOrder, Order, OrderType, OrdersMessage, Side } from '../api/types'
import { Badge, Card, Empty, ErrorBox, NeedAccount, fmtNum, fmtTime, statusTone, useLoad } from '../components/ui'
import { useLive } from '../live'

export default function Orders() {
  const account = useCurrentAccount()
  if (!account) return <NeedAccount title="Orders" />
  return <AccountOrders key={account.id} account={account} />
}

function AccountOrders({ account }: { account: Account }) {
  const accountPath = { account_id: account.id }
  const book = useLoad(() => unwrap(api.GET('/api/accounts/{account_id}/orders', { params: { path: accountPath } })))
  const [symbolFilter, setSymbolFilter] = useState('')
  const history = useLoad(
    () =>
      unwrap<HistoryOrder[]>(
        api.GET('/api/accounts/{account_id}/orders/history', {
          params: { path: accountPath, query: { symbol: symbolFilter || undefined, limit: 200 } },
        }),
      ),
    [symbolFilter],
  )

  // Live order updates: replace (or add) the order in today's book.
  const onMessage = useCallback(
    (msg: OrdersMessage) => {
      if (msg.type !== 'order_update') return
      book.setData((orders) => upsert(orders ?? [], msg.order))
      void history.reload()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  useLive(onMessage)

  return (
    <div className="stack">
      <PlaceOrder account={account} onPlaced={(o) => book.setData((orders) => upsert(orders ?? [], o))} />

      <Card title="Today's order book" actions={<button className="link" onClick={() => void book.reload()}>Refresh</button>}>
        <ErrorBox error={book.error} />
        {book.data?.length === 0 && <Empty>No orders today.</Empty>}
        {!!book.data?.length && (
          <OrderTable
            accountId={account.id}
            orders={[...book.data].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))}
            onCancelled={(o) => book.setData((orders) => upsert(orders ?? [], o))}
          />
        )}
      </Card>

      <Card
        title="History"
        actions={
          <>
            <input
              className="small"
              placeholder="Filter symbol"
              value={symbolFilter}
              onChange={(e) => setSymbolFilter(e.target.value.trim())}
            />
            <button className="link" onClick={() => void history.reload()}>Refresh</button>
          </>
        }
      >
        <ErrorBox error={history.error} />
        {history.data?.length === 0 && <Empty>No orders.</Empty>}
        {!!history.data?.length && <OrderTable accountId={account.id} orders={history.data} />}
      </Card>
    </div>
  )
}

function upsert(orders: Order[], order: Order): Order[] {
  const i = orders.findIndex((o) => o.id === order.id)
  if (i === -1) return [order, ...orders]
  const copy = orders.slice()
  copy[i] = order
  return copy
}

function PlaceOrder({ account, onPlaced }: { account: Account; onPlaced: (o: Order) => void }) {
  // Kite symbols have no "-EQ" suffix.
  const [symbol, setSymbol] = useState(account.broker === 'zerodha' ? 'NSE:SBIN' : 'NSE:SBIN-EQ')
  const [side, setSide] = useState<Side>('BUY')
  const [quantity, setQuantity] = useState(1)
  const [orderType, setOrderType] = useState<OrderType>('MARKET')
  const [limitPrice, setLimitPrice] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const desc = `${side} ${quantity} ${symbol} ${orderType === 'LIMIT' ? `LIMIT @ ${limitPrice}` : 'at MARKET'}`
    const real = account.broker === 'paper' ? '' : ' This is a REAL order.'
    if (!window.confirm(`Place order on ${accountName(account)}: ${desc}?${real}`)) return
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const order = await unwrap(
        api.POST('/api/accounts/{account_id}/orders', {
          params: { path: { account_id: account.id } },
          body: {
            symbol: symbol.trim(),
            side,
            quantity,
            order_type: orderType,
            limit_price: orderType === 'LIMIT' ? Number(limitPrice) : null,
          },
        }),
      )
      onPlaced(order)
      setResult(`Order ${order.id}: ${order.status}`)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title={`Place order — ${accountName(account)}`}>
      <form className="row-form" onSubmit={submit}>
        <label>
          Symbol
          <input value={symbol} onChange={(e) => setSymbol(e.target.value)} required />
        </label>
        <label>
          Side
          <select value={side} onChange={(e) => setSide(e.target.value as Side)}>
            <option>BUY</option>
            <option>SELL</option>
          </select>
        </label>
        <label>
          Qty
          <input type="number" min={1} step={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} required />
        </label>
        <label>
          Type
          <select value={orderType} onChange={(e) => setOrderType(e.target.value as OrderType)}>
            <option>MARKET</option>
            <option>LIMIT</option>
          </select>
        </label>
        {orderType === 'LIMIT' && (
          <label>
            Limit price
            <input type="number" min={0} step="0.05" value={limitPrice} onChange={(e) => setLimitPrice(e.target.value)} required />
          </label>
        )}
        <button type="submit" className={side === 'BUY' ? 'buy' : 'sell'} disabled={busy}>
          {busy ? 'Placing…' : side}
        </button>
      </form>
      <ErrorBox error={error} />
      {result && <p className="ok">{result}</p>}
    </Card>
  )
}

function OrderTable({
  accountId,
  orders,
  onCancelled,
}: {
  accountId: number
  orders: (Order | HistoryOrder)[]
  onCancelled?: (o: Order) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)

  async function cancel(o: Order) {
    if (!window.confirm(`Cancel order ${o.id} (${o.side} ${o.quantity} ${o.symbol})?`)) return
    setCancelling(o.id ?? null)
    setError(null)
    try {
      const updated = await unwrap(
        api.DELETE('/api/accounts/{account_id}/orders/{order_id}', {
          params: { path: { account_id: accountId, order_id: o.id! } },
        }),
      )
      onCancelled?.(updated)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setCancelling(null)
    }
  }

  return (
    <>
      <ErrorBox error={error} />
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Symbol</th>
              <th>Side</th>
              <th>Type</th>
              <th className="num">Qty</th>
              <th className="num">Filled</th>
              <th className="num">Limit</th>
              <th className="num">Fill price</th>
              <th>Status</th>
              <th>Reason</th>
              {onCancelled && <th />}
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>{fmtTime(o.created_at)}</td>
                <td>{o.symbol}</td>
                <td className={o.side === 'BUY' ? 'pos' : 'neg'}>{o.side}</td>
                <td>{o.order_type}</td>
                <td className="num">{o.quantity}</td>
                <td className="num">{o.filled_quantity}</td>
                <td className="num">{fmtNum(o.limit_price)}</td>
                <td className="num">{fmtNum(o.filled_price)}</td>
                <td>
                  <Badge tone={statusTone(o.status ?? '')}>{o.status}</Badge>
                </td>
                <td className="muted">{o.reason}</td>
                {onCancelled && (
                  <td>
                    {o.status === 'OPEN' && (
                      <button className="small danger" disabled={cancelling === o.id} onClick={() => void cancel(o)}>
                        Cancel
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
