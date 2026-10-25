import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { accountName, useCurrentAccount } from '../accounts'
import { api, errorMessage, unwrap } from '../api/client'
import type { Account, HistoryOrder, Order, OrderType, Product, Side } from '../api/types'
import { Icon } from '../components/icons'
import { Page } from '../components/Page'
import { BrokerPills, MarketPill } from '../components/StatusPills'
import {
  Card,
  Empty,
  ErrorBox,
  NeedAccount,
  Note,
  Seg,
  StatusPill,
  fmtClock,
  fmtCompact,
  fmtMoney,
  fmtNum,
  fmtPct,
  fmtQty,
  fmtTime,
  shortSymbol,
  useDebounced,
  useLoad,
} from '../components/ui'
import { loadDayStats, useQuotes } from '../quotes'
import { upsertOrder, useSummary } from '../summary'

export default function Orders() {
  const account = useCurrentAccount()
  return (
    <Page
      title="Orders"
      sub="Place manual orders and track everything your strategies send."
      band
      actions={
        <>
          <MarketPill />
          <BrokerPills />
        </>
      }
    >
      {account ? <AccountOrders key={account.id} account={account} /> : <NeedAccount />}
    </Page>
  )
}

type View = 'all' | 'OPEN' | 'FILLED' | 'CANCELLED'

function AccountOrders({ account }: { account: Account }) {
  const { orders: book, funds } = useSummary()
  const [scope, setScope] = useState<'today' | 'history'>('today')
  const [view, setView] = useState<View>('all')
  const [symbolFilter, setSymbolFilter] = useState('')
  const history = useLoad(
    () =>
      unwrap<HistoryOrder[]>(
        api.GET('/api/accounts/{account_id}/orders/history', { params: { path: { account_id: account.id }, query: { limit: 300 } } }),
      ),
    [book.data?.length],
  )

  // Which strategy placed each order (the broker's book doesn't know).
  const source = useMemo(() => new Map((history.data ?? []).map((o) => [o.id ?? '', o.strategy])), [history.data])
  const all: Order[] = scope === 'today' ? (book.data ?? []) : (history.data ?? [])
  const sorted = [...all].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
  const needle = symbolFilter.trim().toUpperCase()
  const shown = sorted.filter((o) => (view === 'all' || o.status === view || (view === 'CANCELLED' && o.status === 'REJECTED')) && (!needle || o.symbol.includes(needle)))
  const count = (s: string) => all.filter((o) => o.status === s).length
  const turnover = all.filter((o) => o.filled_quantity).reduce((s, o) => s + o.filled_quantity * (o.filled_price ?? 0), 0)

  return (
    <div className="side-right" style={{ gridTemplateColumns: 'minmax(0, 1fr) 320px' }}>
      <div className="stack">
        <div className="grid-4" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
          <MiniStat label="Open" value={count('OPEN')} tone="info" />
          <MiniStat label="Filled" value={count('FILLED')} />
          <MiniStat label="Cancelled" value={count('CANCELLED')} />
          <MiniStat label="Rejected" value={count('REJECTED')} tone={count('REJECTED') ? 'bad' : undefined} />
          <MiniStat label="Turnover" value={fmtCompact(turnover)} />
        </div>

        <Card
          title="Order book"
          flush
          actions={
            <>
              <Seg label="Day" value={scope} onChange={setScope} options={[{ value: 'today', label: 'Today' }, { value: 'history', label: 'History' }]} />
              <Seg
                label="Status"
                value={view}
                onChange={setView}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'OPEN', label: 'Open' },
                  { value: 'FILLED', label: 'Filled' },
                  { value: 'CANCELLED', label: 'Cancelled' },
                ]}
              />
              <div className="input-wrap" style={{ width: 170 }}>
                <Icon name="search" size={14} />
                <input placeholder="Filter symbol" value={symbolFilter} onChange={(e) => setSymbolFilter(e.target.value)} style={{ minHeight: 36 }} />
              </div>
            </>
          }
        >
          <div style={{ padding: '0 18px' }}>
            <ErrorBox error={scope === 'today' ? book.error : history.error} />
          </div>
          {shown.length === 0 ? (
            <Empty>{all.length ? 'No orders match this filter.' : scope === 'today' ? 'No orders today. Place one with the panel on the right.' : 'No orders recorded yet.'}</Empty>
          ) : (
            <OrderTable account={account} orders={shown} source={source} showDate={scope === 'history'} onChanged={(o) => book.setData((list) => upsertOrder(list ?? [], o))} />
          )}
          <div className="table-foot">
            Showing {shown.length} order{shown.length === 1 ? '' : 's'} · {scope === 'today' ? 'today' : 'recent history'}, {accountName(account)}
          </div>
        </Card>
      </div>

      <PlaceOrder account={account} available={funds.data?.cash ?? null} onPlaced={(o) => book.setData((list) => upsertOrder(list ?? [], o))} />
    </div>
  )
}

function MiniStat({ label, value, tone }: { label: string; value: number | string; tone?: 'info' | 'bad' }) {
  return (
    <div className="card stat" style={{ padding: '14px 16px' }}>
      <div className="label">{label}</div>
      <div className="figure md" style={{ color: tone === 'info' ? 'var(--action)' : tone === 'bad' ? 'var(--loss)' : undefined }}>
        {value}
      </div>
    </div>
  )
}

function typeText(o: Order): string {
  if (o.order_type === 'MARKET') return 'Market'
  if (o.order_type === 'LIMIT') return `Limit · ${fmtNum(o.limit_price)}`
  if (o.order_type === 'SL') return `SL · ${fmtNum(o.trigger_price)} → ${fmtNum(o.limit_price)}`
  return `SL-M · ${fmtNum(o.trigger_price)}`
}

function OrderTable({
  account,
  orders,
  source,
  showDate,
  onChanged,
}: {
  account: Account
  orders: Order[]
  source: Map<string, string | null>
  showDate: boolean
  onChanged: (o: Order) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)

  async function cancel(o: Order) {
    if (!window.confirm(`Cancel ${o.side} ${o.quantity} ${shortSymbol(o.symbol)} (${typeText(o)})?`)) return
    setCancelling(o.id ?? null)
    setError(null)
    try {
      onChanged(await unwrap(api.DELETE('/api/accounts/{account_id}/orders/{order_id}', { params: { path: { account_id: account.id, order_id: o.id! } } })))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setCancelling(null)
    }
  }

  return (
    <>
      <div style={{ padding: '0 18px' }}>
        <ErrorBox error={error} />
      </div>
      <div className="table-wrap" style={{ marginTop: 10 }}>
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Instrument</th>
              <th>Side</th>
              <th>Type</th>
              <th className="num">Qty</th>
              <th className="num">Price</th>
              <th>Source</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const strategy = (o as HistoryOrder).strategy ?? source.get(o.id ?? '')
              return (
                <tr key={o.id}>
                  <td className="mono small muted">{showDate ? fmtTime(o.created_at) : fmtClock(o.created_at)}</td>
                  <td style={{ fontWeight: 500 }}>{shortSymbol(o.symbol)}</td>
                  <td>
                    <span className={`tag ${o.side === 'BUY' ? 'buy' : 'sell'}`}>{o.side}</span>
                  </td>
                  <td className="small">{typeText(o)}</td>
                  <td className="num">
                    {fmtQty(o.filled_quantity)} <span className="muted">/ {fmtQty(o.quantity)}</span>
                  </td>
                  <td className="num">{o.filled_price ? fmtNum(o.filled_price) : '—'}</td>
                  <td className="small muted ellipsis" style={{ maxWidth: 140 }} title={strategy ?? 'Placed by hand'}>
                    {strategy ?? 'Manual'}
                  </td>
                  <td>
                    <div className="row" style={{ flexWrap: 'nowrap' }}>
                      <StatusPill status={o.status ?? ''} />
                      {o.status === 'OPEN' && (
                        <button className="link danger small" disabled={cancelling === o.id} onClick={() => void cancel(o)}>
                          Cancel
                        </button>
                      )}
                    </div>
                    {o.reason && o.status === 'REJECTED' && <div className="sub" style={{ whiteSpace: 'normal', maxWidth: 220 }}>{o.reason}</div>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

const TYPES: { value: OrderType; label: string }[] = [
  { value: 'MARKET', label: 'Market' },
  { value: 'LIMIT', label: 'Limit' },
  { value: 'SL', label: 'SL' },
  { value: 'SL-M', label: 'SL-M' },
]

function PlaceOrder({ account, available, onPlaced }: { account: Account; available: number | null; onPlaced: (o: Order) => void }) {
  const [params, setParams] = useSearchParams()
  // Kite symbols have no "-EQ" suffix.
  const [symbol, setSymbol] = useState(params.get('symbol') ?? (account.broker === 'zerodha' ? 'NSE:SBIN' : 'NSE:SBIN-EQ'))
  const [side, setSide] = useState<Side>(params.get('side') === 'SELL' ? 'SELL' : 'BUY')
  const [product, setProduct] = useState<Product>('INTRADAY')
  const [orderType, setOrderType] = useState<OrderType>('MARKET')
  const [quantity, setQuantity] = useState(1)
  const [price, setPrice] = useState('')
  const [trigger, setTrigger] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const qtyRef = useRef<HTMLInputElement>(null)

  // Prefilled from the Market page (?symbol=&side=): use once, then clean the URL.
  useEffect(() => {
    if (params.get('symbol') || params.get('side')) setParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Shift+B / Shift+S pick the side when not typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      if (typing || !e.shiftKey || e.metaKey || e.ctrlKey) return
      if (e.key === 'B') setSide('BUY')
      else if (e.key === 'S') setSide('SELL')
      else return
      qtyRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const sym = symbol.trim().toUpperCase()
  const watched = useDebounced(sym, 500)
  const { quotes } = useQuotes(account.id, watched.includes(':') ? [watched] : [])
  const day = useLoad(() => (watched.includes(':') ? loadDayStats(account.id, watched) : Promise.resolve(null)), [watched])
  const ltp = quotes[sym]?.ltp
  const change = ltp !== undefined && day.data?.prevClose ? ((ltp - day.data.prevClose) / day.data.prevClose) * 100 : null

  const needsPrice = orderType === 'LIMIT' || orderType === 'SL'
  const needsTrigger = orderType === 'SL' || orderType === 'SL-M'
  const refPrice = needsPrice ? Number(price) || 0 : needsTrigger ? Number(trigger) || ltp || 0 : ltp ?? 0
  const estimate = refPrice * quantity
  const typeLabel = TYPES.find((t) => t.value === orderType)!.label
  const productLabel = product === 'INTRADAY' ? 'Intraday' : 'Delivery'
  const summary = `${side === 'BUY' ? 'Buy' : 'Sell'} ${fmtQty(quantity)} ${shortSymbol(sym).replace(/-EQ$/, '')} · ${typeLabel} · ${productLabel}`

  async function submit(e: FormEvent) {
    e.preventDefault()
    const at = [needsTrigger && `trigger ${trigger}`, needsPrice && `limit ${price}`].filter(Boolean).join(', ')
    const real = account.broker === 'paper' ? '' : '\n\nThis is a REAL order.'
    if (!window.confirm(`${summary}${at ? ` (${at})` : ''} on ${accountName(account)}?${real}`)) return
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const order = await unwrap(
        api.POST('/api/accounts/{account_id}/orders', {
          params: { path: { account_id: account.id } },
          body: {
            symbol: sym,
            side,
            quantity,
            order_type: orderType,
            product,
            limit_price: needsPrice ? Number(price) : null,
            trigger_price: needsTrigger ? Number(trigger) : null,
          },
        }),
      )
      onPlaced(order)
      setResult(order.status === 'REJECTED' ? `Rejected: ${order.reason ?? 'no reason given'}` : `Order ${order.status.toLowerCase()}${order.filled_price ? ` @ ${fmtNum(order.filled_price)}` : ''}.`)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card stack" style={{ position: 'sticky', top: 20, gap: 14 }} onSubmit={submit}>
      <h2 style={{ fontSize: 15 }}>New order</h2>
      <div className="seg" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: 4 }}>
        <button type="button" className={side === 'BUY' ? 'buy' : ''} style={{ minHeight: 42 }} onClick={() => setSide('BUY')} aria-pressed={side === 'BUY'}>
          Buy
        </button>
        <button type="button" className={side === 'SELL' ? 'sell' : ''} style={{ minHeight: 42 }} onClick={() => setSide('SELL')} aria-pressed={side === 'SELL'}>
          Sell
        </button>
      </div>

      <label className="field">
        Instrument
        <div className="input-wrap plain">
          <input className="mono" value={symbol} onChange={(e) => setSymbol(e.target.value)} required style={{ paddingRight: 130 }} />
          <span className="suffix mono small">
            {ltp !== undefined ? fmtNum(ltp) : ''} {change !== null && <span className={change >= 0 ? 'pos' : 'neg'}>{fmtPct(change)}</span>}
          </span>
        </div>
      </label>
      {day.data && (
        <div className="between tiny muted mono" style={{ marginTop: -6 }}>
          <span>Prev close {fmtNum(day.data.prevClose)}</span>
          <span>Day {fmtNum(day.data.low)} – {fmtNum(day.data.high)}</span>
        </div>
      )}

      <div className="field">
        <span className="small muted">Product</span>
        <div className="choice-row">
          <button type="button" className={`choice ${product === 'INTRADAY' ? 'on' : ''}`} onClick={() => setProduct('INTRADAY')}>
            Intraday <span className="hint">Squared off same day</span>
          </button>
          <button type="button" className={`choice ${product === 'DELIVERY' ? 'on' : ''}`} onClick={() => setProduct('DELIVERY')}>
            Delivery <span className="hint">Hold overnight</span>
          </button>
        </div>
      </div>

      <div className="field">
        <span className="small muted">Order type</span>
        <Seg label="Order type" fill value={orderType} onChange={setOrderType} options={TYPES} />
      </div>

      <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-end' }}>
        <label className="field grow">
          Quantity
          <div className="stepper">
            <button type="button" aria-label="Less" onClick={() => setQuantity((q) => Math.max(1, q - 1))}>−</button>
            <input ref={qtyRef} type="number" min={1} step={1} value={quantity} onChange={(e) => setQuantity(Math.max(1, Math.floor(Number(e.target.value) || 1)))} required />
            <button type="button" aria-label="More" onClick={() => setQuantity((q) => q + 1)}>+</button>
          </div>
        </label>
      </div>
      {(needsTrigger || needsPrice) && (
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          {needsTrigger && (
            <label className="field grow">
              Trigger
              <input className="mono" type="number" min={0} step="0.05" value={trigger} onChange={(e) => setTrigger(e.target.value)} placeholder={ltp ? fmtNum(ltp) : ''} required />
            </label>
          )}
          {needsPrice && (
            <label className="field grow">
              {orderType === 'SL' ? 'Limit price' : 'Price'}
              <input className="mono" type="number" min={0} step="0.05" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={ltp ? fmtNum(ltp) : ''} required />
            </label>
          )}
        </div>
      )}
      {orderType === 'MARKET' && <div className="field-note" style={{ marginTop: -6 }}>At market price</div>}

      <dl className="kv inset">
        <dt>Est. value</dt>
        <dd>{refPrice ? fmtMoney(estimate) : '—'}</dd>
        <dt>Available</dt>
        <dd>{fmtMoney(available)}</dd>
      </dl>

      <button type="submit" className={`lg block ${side === 'BUY' ? 'buy' : 'sell'}`} disabled={busy || !sym}>
        {busy ? 'Placing…' : summary}
      </button>
      <div className="tiny muted" style={{ textAlign: 'center', marginTop: -6 }}>
        You’ll review before it’s placed · <span className="kbd">Shift+B</span> / <span className="kbd">S</span>
      </div>
      <ErrorBox error={error} />
      {result && <Note tone={result.startsWith('Rejected') ? 'bad' : 'good'} onClose={() => setResult(null)}>{result}</Note>}
    </form>
  )
}
