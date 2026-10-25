import {
  CandlestickSeries,
  ColorType,
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { accountName, useCurrentAccount } from '../accounts'
import { api, unwrap } from '../api/client'
import { ReconnectingSocket, type SocketState } from '../api/socket'
import type { Account, Candle, TickerMessage } from '../api/types'
import { useAuth } from '../auth'
import { Card, Empty, ErrorBox, NeedAccount, fmtNum, useLoad } from '../components/ui'

// One watchlist per account: symbol formats differ by broker (Kite has no "-EQ").
const watchlistKey = (accountId: number) => `autotrade.watchlist.${accountId}`

function defaultWatchlist(broker: string): string[] {
  return broker === 'zerodha' ? ['NSE:SBIN', 'NSE:RELIANCE', 'NSE:INFY'] : ['NSE:SBIN-EQ', 'NSE:RELIANCE-EQ', 'NSE:INFY-EQ']
}

function loadWatchlist(account: Account): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(watchlistKey(account.id)) ?? 'null') as unknown
    if (Array.isArray(saved) && saved.every((s) => typeof s === 'string')) return saved
  } catch {
    /* ignore */
  }
  return defaultWatchlist(account.broker)
}

interface Quote {
  ltp: number
  prev?: number
  first: number
  at: number
}

export default function Market() {
  const account = useCurrentAccount()
  if (!account) return <NeedAccount title="Market" />
  // Keyed by account: its own tickers socket, watchlist and chart.
  return <AccountMarket key={account.id} account={account} />
}

function AccountMarket({ account }: { account: Account }) {
  const { signedOut } = useAuth()
  const [watchlist, setWatchlist] = useState<string[]>(() => loadWatchlist(account))
  const [quotes, setQuotes] = useState<Record<string, Quote>>({})
  const [socketState, setSocketState] = useState<SocketState>('closed')
  const [socketError, setSocketError] = useState<string | null>(null)
  const [newSymbol, setNewSymbol] = useState('')
  const [chartSymbol, setChartSymbol] = useState(watchlist[0] ?? 'NSE:SBIN-EQ')
  const watchRef = useRef(watchlist)

  const [socket] = useState(
    () =>
      new ReconnectingSocket<TickerMessage>(`/api/accounts/${account.id}/ws/tickers`, {
        // Resubscribe the whole watchlist on every (re)connect.
        onOpen: (s) => s.send({ action: 'subscribe', symbols: watchRef.current }),
        onUnauthorized: () => signedOut(),
      }),
  )

  useEffect(() => {
    const offState = socket.onState(setSocketState)
    const offMsg = socket.subscribe((msg) => {
      if (msg.type === 'tick') {
        setQuotes((q) => {
          const old = q[msg.symbol]
          return { ...q, [msg.symbol]: { ltp: msg.ltp, prev: old?.ltp, first: old?.first ?? msg.ltp, at: Date.now() } }
        })
      } else if (msg.type === 'error') {
        setSocketError(typeof msg.error === 'string' ? msg.error : JSON.stringify(msg.error))
      } else if (msg.type === 'ack') {
        setSocketError(null)
      }
    })
    socket.start()
    return () => {
      offState()
      offMsg()
      socket.stop()
    }
  }, [socket])

  useEffect(() => {
    watchRef.current = watchlist
    try {
      localStorage.setItem(watchlistKey(account.id), JSON.stringify(watchlist))
    } catch {
      /* ignore */
    }
  }, [watchlist, account.id])

  function add(e: FormEvent) {
    e.preventDefault()
    const sym = newSymbol.trim().toUpperCase()
    if (!sym || watchlist.includes(sym)) return
    setWatchlist([...watchlist, sym])
    socket.send({ action: 'subscribe', symbols: [sym] })
    setNewSymbol('')
  }

  function remove(sym: string) {
    setWatchlist(watchlist.filter((s) => s !== sym))
    socket.send({ action: 'unsubscribe', symbols: [sym] })
    setQuotes((q) => Object.fromEntries(Object.entries(q).filter(([s]) => s !== sym)))
  }

  return (
    <div className="stack">
      <Card
        title={
          <>
            Watchlist — {accountName(account)} <span className={`live ${socketState}`}>● {socketState === 'open' ? 'live' : socketState}</span>
          </>
        }
        actions={
          <form className="inline-form" onSubmit={add}>
            <input className="small" placeholder="NSE:TCS-EQ" value={newSymbol} onChange={(e) => setNewSymbol(e.target.value)} />
            <button type="submit" className="small">Add</button>
          </form>
        }
      >
        <ErrorBox error={socketError} />
        {watchlist.length === 0 ? (
          <Empty>Add a symbol to watch.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Symbol</th>
                <th className="num">LTP</th>
                <th className="num">Change since page opened</th>
                <th>Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {watchlist.map((sym) => {
                const q = quotes[sym]
                const dir = q?.prev === undefined ? '' : q.ltp > q.prev ? 'up' : q.ltp < q.prev ? 'down' : ''
                const change = q ? q.ltp - q.first : null
                return (
                  <tr key={sym} className={sym === chartSymbol ? 'selected' : ''}>
                    <td>
                      <button className="link" onClick={() => setChartSymbol(sym)}>
                        {sym}
                      </button>
                    </td>
                    <td className={`num tick ${dir}`} key={q?.at}>
                      {fmtNum(q?.ltp)}
                    </td>
                    <td className={`num ${change && change > 0 ? 'pos' : change && change < 0 ? 'neg' : ''}`}>
                      {change === null ? '—' : `${change > 0 ? '+' : ''}${fmtNum(change)} (${((change / q!.first) * 100).toFixed(2)}%)`}
                    </td>
                    <td className="muted">{q ? new Date(q.at).toLocaleTimeString() : '—'}</td>
                    <td>
                      <button className="small" onClick={() => remove(sym)} title="Remove">
                        ✕
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>

      <CandleChart accountId={account.id} symbol={chartSymbol} onSymbol={setChartSymbol} lastPrice={quotes[chartSymbol]?.ltp} />
    </div>
  )
}

// The backend sends IST times; lightweight-charts shows UTC, so shift to display IST.
const IST_OFFSET = 5.5 * 3600

function toBar(c: Candle): CandlestickData<UTCTimestamp> {
  return {
    time: (Math.floor(new Date(c.time).getTime() / 1000) + IST_OFFSET) as UTCTimestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  }
}

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10)
}

function CandleChart({
  accountId,
  symbol,
  onSymbol,
  lastPrice,
}: {
  accountId: number
  symbol: string
  onSymbol: (s: string) => void
  lastPrice?: number
}) {
  const [resolution, setResolution] = useState<'1' | 'D'>('1')
  const [draft, setDraft] = useState(symbol)
  const [days, setDays] = useState(3)
  const el = useRef<HTMLDivElement>(null)
  const chart = useRef<IChartApi | null>(null)
  const series = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const lastBar = useRef<CandlestickData<UTCTimestamp> | null>(null)

  // Follow symbol changes from the watchlist (adjusting state during render, not in an effect).
  const [shownSymbol, setShownSymbol] = useState(symbol)
  if (symbol !== shownSymbol) {
    setShownSymbol(symbol)
    setDraft(symbol)
  }

  const candles = useLoad(() => {
    const end = new Date()
    const start = new Date(end.getTime() - days * 86400_000)
    return unwrap<Candle[]>(
      api.GET('/api/accounts/{account_id}/market/candles', {
        params: { path: { account_id: accountId }, query: { symbol, resolution, start: isoDay(start), end: isoDay(end) } },
      }),
    )
  }, [symbol, resolution, days])

  useEffect(() => {
    if (!el.current) return
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const c = createChart(el.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: dark ? '#c9d1d9' : '#24292f',
      },
      grid: {
        vertLines: { color: dark ? '#21262d' : '#eaeef2' },
        horzLines: { color: dark ? '#21262d' : '#eaeef2' },
      },
      timeScale: { timeVisible: true, secondsVisible: false },
    })
    series.current = c.addSeries(CandlestickSeries, {
      upColor: '#1a7f37',
      downColor: '#cf222e',
      borderVisible: false,
      wickUpColor: '#1a7f37',
      wickDownColor: '#cf222e',
    })
    chart.current = c
    return () => {
      c.remove()
      chart.current = null
      series.current = null
    }
  }, [])

  useEffect(() => {
    if (!series.current || !candles.data) return
    const bars = candles.data.map(toBar)
    series.current.setData(bars)
    lastBar.current = bars.at(-1) ?? null
    chart.current?.timeScale().fitContent()
  }, [candles.data])

  // Move the last bar with live ticks for this symbol (1-minute bars only).
  useEffect(() => {
    if (lastPrice === undefined || resolution !== '1' || !series.current) return
    const now = (Math.floor(Date.now() / 60_000) * 60 + IST_OFFSET) as UTCTimestamp
    const last = lastBar.current
    const bar =
      last && last.time === now
        ? { ...last, high: Math.max(last.high, lastPrice), low: Math.min(last.low, lastPrice), close: lastPrice }
        : last && last.time > now
          ? null
          : { time: now, open: lastPrice, high: lastPrice, low: lastPrice, close: lastPrice }
    if (!bar) return
    series.current.update(bar)
    lastBar.current = bar
  }, [lastPrice, resolution])

  return (
    <Card
      title={`Chart — ${symbol}`}
      actions={
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (draft.trim()) onSymbol(draft.trim().toUpperCase())
          }}
        >
          <input className="small" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <select className="small" value={resolution} onChange={(e) => {
              const r = e.target.value as '1' | 'D'
              setResolution(r)
              setDays(r === 'D' ? 365 : 3)
            }}>
            <option value="1">1 minute</option>
            <option value="D">Daily</option>
          </select>
          <select className="small" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={1}>1 day</option>
            <option value={3}>3 days</option>
            <option value={7}>1 week</option>
            <option value={30}>1 month</option>
            <option value={365}>1 year</option>
          </select>
          <button type="submit" className="small">Load</button>
        </form>
      }
    >
      <ErrorBox error={candles.error} />
      {candles.data?.length === 0 && <Empty>No candles for this range.</Empty>}
      <div className="chart" ref={el} />
    </Card>
  )
}
