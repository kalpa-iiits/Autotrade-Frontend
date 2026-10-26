import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  LineSeries,
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useCurrentAccount } from '../accounts'
import { api, unwrap } from '../api/client'
import type { Account, Candle } from '../api/types'
import { Sparkline } from '../components/charts'
import { Icon } from '../components/icons'
import { InstrumentInput } from '../components/InstrumentInput'
import { Page } from '../components/Page'
import { MarketPill } from '../components/StatusPills'
import { Card, Empty, ErrorBox, NeedAccount, Pill, Seg, fmtNum, fmtPct, istDay, shortSymbol, symbolKind, useLoad } from '../components/ui'
import { loadDayStats, useQuotes, type DayStats } from '../quotes'
import { useSummary } from '../summary'

// One watchlist per account: symbol formats differ by broker (Kite has no "-EQ").
const watchlistKey = (accountId: number) => `autotrade.watchlist.${accountId}`

function defaultWatchlist(broker: string): string[] {
  return broker === 'zerodha' ? ['NSE:SBIN', 'NSE:RELIANCE', 'NSE:INFY'] : ['NSE:SBIN-EQ', 'NSE:RELIANCE-EQ', 'NSE:INFY-EQ']
}

export function loadWatchlist(account: Pick<Account, 'id' | 'broker'>): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(watchlistKey(account.id)) ?? 'null') as unknown
    if (Array.isArray(saved) && saved.every((s) => typeof s === 'string')) return saved
  } catch {
    /* ignore */
  }
  return defaultWatchlist(account.broker)
}

export default function Market() {
  const account = useCurrentAccount()
  return account ? <AccountMarket key={account.id} account={account} /> : (
    <Page title="Market" band>
      <NeedAccount />
    </Page>
  )
}

function AccountMarket({ account }: { account: Account }) {
  const [params, setParams] = useSearchParams()
  const [watchlist, setWatchlist] = useState<string[]>(() => loadWatchlist(account))
  const [newSymbol, setNewSymbol] = useState('')
  const [selected, setSelected] = useState(() => params.get('symbol') ?? watchlist[0] ?? 'NSE:SBIN-EQ')
  const watched = useMemo(() => (watchlist.includes(selected) ? watchlist : [...watchlist, selected]), [watchlist, selected])
  const { quotes, state, error } = useQuotes(account.id, watched)
  // Day stats (change %, sparkline) need a history request each: load them for the selected
  // symbol only, not the whole watchlist at once (Fyers allows 5 requests a second).
  const [stats, setStats] = useState<Record<string, DayStats | null>>({})
  useEffect(() => {
    let current = true
    loadDayStats(account.id, selected)
      .then((day) => current && setStats((s) => ({ ...s, [selected]: day })))
      .catch(() => current && setStats((s) => ({ ...s, [selected]: null })))
    return () => { current = false }
  }, [account.id, selected])

  // Opened from search (?symbol=...): show it, then clean the URL.
  useEffect(() => {
    const s = params.get('symbol')
    if (!s) return
    setSelected(s)
    setParams({}, { replace: true })
  }, [params, setParams])

  useEffect(() => {
    try {
      localStorage.setItem(watchlistKey(account.id), JSON.stringify(watchlist))
    } catch {
      /* ignore */
    }
  }, [watchlist, account.id])

  function add(symbol: string) {
    const sym = symbol.trim().toUpperCase()
    if (!sym) return
    if (!watchlist.includes(sym)) setWatchlist([...watchlist, sym])
    setSelected(sym)
    setNewSymbol('')
  }

  function remove(sym: string) {
    const next = watchlist.filter((s) => s !== sym)
    setWatchlist(next)
    if (sym === selected && next.length) setSelected(next[0])
  }

  const streaming = state === 'open'
  return (
    <Page
      title="Market"
      sub={`Live prices from ${account.label} · ticks as they arrive`}
      band
      actions={
        <>
          <Pill dot={streaming ? 'good' : state === 'connecting' ? 'warn' : 'bad'}>{streaming ? 'Streaming' : state === 'connecting' ? 'Connecting' : 'Offline'}</Pill>
          <MarketPill />
        </>
      }
    >
      <ErrorBox error={error} />
      <div className="side-left">
        <Card title="Watchlist" actions={<span className="small muted">{watchlist.length} symbols</span>} flush>
          <form onSubmit={(e: FormEvent) => { e.preventDefault(); add(newSymbol) }} style={{ padding: '0 14px 12px' }}>
            <div className="input-wrap">
              <Icon name="plus" size={15} />
              <InstrumentInput accountId={account.id} value={newSymbol} onChange={setNewSymbol} onPick={add} listId="market-add-symbol" placeholder="Add e.g. RELIANCE, INFY" />
            </div>
          </form>
          {watchlist.length === 0 && <Empty>Add a symbol to watch.</Empty>}
          {watchlist.map((sym) => {
            const q = quotes[sym]
            const day = stats[sym]
            const dir = q?.prev === undefined ? '' : q.ltp > q.prev ? 'up' : q.ltp < q.prev ? 'down' : ''
            const change = q && day?.prevClose ? ((q.ltp - day.prevClose) / day.prevClose) * 100 : null
            const spark = [...(day?.closes.slice(0, -1) ?? []), ...(q?.history ?? [])]
            return (
              <div key={sym} className={`watch-row ${sym === selected ? 'on' : ''}`} onClick={() => setSelected(sym)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setSelected(sym)} aria-pressed={sym === selected}>
                <div style={{ minWidth: 0 }}>
                  <div className="ellipsis" style={{ fontWeight: 500, fontSize: 13 }}>{shortSymbol(sym)}</div>
                  <div className="tiny muted">{symbolKind(sym)}</div>
                </div>
                <Sparkline values={spark.slice(-30)} />
                <div style={{ textAlign: 'right' }}>
                  <div className={`mono small tick ${dir}`} key={q?.at}>{fmtNum(q?.ltp)}</div>
                  <div className={`mono tiny ${change === null ? 'muted' : change >= 0 ? 'pos' : 'neg'}`}>
                    {change === null ? '—' : <>{change >= 0 ? '▲' : '▼'} {fmtPct(change)}</>}
                  </div>
                </div>
              </div>
            )
          })}
        </Card>

        <SymbolPanel account={account} symbol={selected} ltp={quotes[selected]?.ltp} day={stats[selected] ?? null} onRemove={watchlist.includes(selected) ? () => remove(selected) : undefined} />
      </div>
    </Page>
  )
}

type Tf = '1m' | '5m' | '15m' | '1h' | '1D' | '1W'
const TFS: Tf[] = ['1m', '5m', '15m', '1h', '1D', '1W']
// Minutes per bar (intraday, built from 1-minute candles) and days of history to load.
const TF_MIN: Partial<Record<Tf, number>> = { '1m': 1, '5m': 5, '15m': 15, '1h': 60 }
const TF_DAYS: Record<Tf, number> = { '1m': 3, '5m': 7, '15m': 15, '1h': 45, '1D': 365, '1W': 1000 }

function SymbolPanel({ account, symbol, ltp, day, onRemove }: { account: Account; symbol: string; ltp: number | undefined; day: DayStats | null; onRemove?: () => void }) {
  const navigate = useNavigate()
  const { strategies } = useSummary()
  const [tf, setTf] = useState<Tf>('5m')
  const [smas, setSmas] = useState(true)
  const change = ltp !== undefined && day?.prevClose ? ltp - day.prevClose : null
  const on = (strategies.data?.strategies ?? []).filter((s) => s.symbol === symbol)
  const lo = Math.min(day?.low ?? Infinity, ltp ?? Infinity)
  const hi = Math.max(day?.high ?? -Infinity, ltp ?? -Infinity)
  const at = ltp !== undefined && hi > lo ? ((ltp - lo) / (hi - lo)) * 100 : 50

  return (
    <div className="stack">
      <section className="card">
        <div className="between" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="row">
              <h2 style={{ fontSize: 18 }}>{shortSymbol(symbol)}</h2>
              <Pill>{symbolKind(symbol)}</Pill>
              {onRemove && <button className="ghost sm" onClick={onRemove} title="Remove from watchlist">Remove</button>}
            </div>
            <div className="row" style={{ alignItems: 'baseline', marginTop: 6 }}>
              <span className="figure">{fmtNum(ltp ?? day?.closes.at(-1))}</span>
              {change !== null && (
                <span className={`mono small ${change >= 0 ? 'pos' : 'neg'}`}>
                  {change >= 0 ? '▲' : '▼'} {fmtPct((change / day!.prevClose!) * 100)} today
                </span>
              )}
            </div>
          </div>
          <div className="row">
            <button className="buy" style={{ minWidth: 72 }} onClick={() => navigate(`/orders?symbol=${encodeURIComponent(symbol)}&side=BUY`)}>Buy</button>
            <button className="sell" style={{ minWidth: 72 }} onClick={() => navigate(`/orders?symbol=${encodeURIComponent(symbol)}&side=SELL`)}>Sell</button>
          </div>
        </div>
        <div className="between" style={{ margin: '16px 0 10px' }}>
          <Seg label="Timeframe" mono value={tf} onChange={setTf} options={TFS.map((t) => ({ value: t, label: t }))} />
          <div className="row small muted">
            {smas && (
              <>
                <span className="row" style={{ gap: 6 }}><i style={{ width: 12, height: 2, background: '#fbbf24', display: 'inline-block' }} /> SMA 20</span>
                <span className="row" style={{ gap: 6 }}><i style={{ width: 12, height: 2, background: '#7c93ff', display: 'inline-block' }} /> SMA 50</span>
              </>
            )}
            <button className="sm" aria-pressed={smas} onClick={() => setSmas(!smas)}>Indicators</button>
          </div>
        </div>
        <CandleChart accountId={account.id} symbol={symbol} tf={tf} smas={smas} lastPrice={ltp} />
      </section>

      <div className="grid-3">
        <div className="card stat"><div className="caps">Open</div><div className="mono" style={{ fontSize: 16, marginTop: 6 }}>{fmtNum(day?.open)}</div></div>
        <div className="card stat"><div className="caps">Prev close</div><div className="mono" style={{ fontSize: 16, marginTop: 6 }}>{fmtNum(day?.prevClose)}</div></div>
        <div className="card stat">
          <div className="between"><span className="caps">Day range</span><span className="tiny muted">LTP marked</span></div>
          <div className="range-bar"><i style={{ left: `${Math.max(0, Math.min(100, at))}%` }} /></div>
          <div className="between mono small"><span>{isFinite(lo) ? fmtNum(lo) : '—'}</span><span>{isFinite(hi) ? fmtNum(hi) : '—'}</span></div>
        </div>
        <div className="card stat"><div className="caps">Volume</div><div className="mono" style={{ fontSize: 16, marginTop: 6 }}>{day?.volume ? fmtVolume(day.volume) : '—'}</div></div>
        <div className="card stat" style={{ gridColumn: 'span 2' }}>
          <div className="caps">Strategies on it</div>
          <div className="small" style={{ marginTop: 8 }}>
            {on.length ? on.map((s) => `${s.label} · ${s.status}`).join(', ') : <span className="muted">None on this account.</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

function fmtVolume(v: number): string {
  if (v >= 1e7) return `${(v / 1e7).toFixed(2)} Cr`
  if (v >= 1e5) return `${(v / 1e5).toFixed(2)} L`
  return Math.round(v).toLocaleString('en-IN')
}

// The backend sends IST times; lightweight-charts shows UTC, so shift to display IST.
const IST_OFFSET = 5.5 * 3600
const SESSION_START = 9 * 3600 + 15 * 60

/** Bar start (IST-shifted seconds) for a time, for `tf`. Intraday bars count from 09:15. */
function bucket(sec: number, tf: Tf): number {
  const day = Math.floor(sec / 86400) * 86400
  if (tf === '1D') return day
  if (tf === '1W') {
    const weekday = (Math.floor(sec / 86400) + 3) % 7 // 0 = Monday (1970-01-01 was a Thursday)
    return day - weekday * 86400
  }
  const size = TF_MIN[tf]! * 60
  const open = day + SESSION_START
  return sec < open ? sec - (sec % size) : open + Math.floor((sec - open) / size) * size
}

interface Bar extends CandlestickData<UTCTimestamp> {
  volume: number
}

function aggregate(candles: Candle[], tf: Tf): Bar[] {
  const out: Bar[] = []
  for (const c of candles) {
    const t = bucket(Math.floor(new Date(c.time).getTime() / 1000) + IST_OFFSET, tf) as UTCTimestamp
    const last = out[out.length - 1]
    if (last && last.time === t) {
      last.high = Math.max(last.high, c.high)
      last.low = Math.min(last.low, c.low)
      last.close = c.close
      last.volume += c.volume
    } else {
      out.push({ time: t, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume })
    }
  }
  return out
}

function sma(bars: Bar[], n: number) {
  const out: { time: UTCTimestamp; value: number }[] = []
  let sum = 0
  bars.forEach((b, i) => {
    sum += b.close
    if (i >= n) sum -= bars[i - n].close
    if (i >= n - 1) out.push({ time: b.time, value: sum / n })
  })
  return out
}

const UP = '#34d399'
const DOWN = '#fb7185'

function CandleChart({ accountId, symbol, tf, smas, lastPrice }: { accountId: number; symbol: string; tf: Tf; smas: boolean; lastPrice?: number }) {
  const el = useRef<HTMLDivElement>(null)
  const chart = useRef<IChartApi | null>(null)
  const series = useRef<{ candles: ISeriesApi<'Candlestick'>; volume: ISeriesApi<'Histogram'>; sma20: ISeriesApi<'Line'>; sma50: ISeriesApi<'Line'> } | null>(null)
  const lastBar = useRef<Bar | null>(null)
  const intraday = TF_MIN[tf] !== undefined

  const candles = useLoad(() => {
    const end = new Date()
    const start = new Date(end.getTime() - TF_DAYS[tf] * 86_400_000)
    return unwrap<Candle[]>(
      api.GET('/api/accounts/{account_id}/market/candles', {
        params: { path: { account_id: accountId }, query: { symbol, resolution: intraday ? '1' : 'D', start: istDay(start), end: istDay(end) } },
      }),
    )
  }, [symbol, tf])

  useEffect(() => {
    if (!el.current) return
    const c = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#8691a3', fontFamily: 'Geist Mono, ui-monospace, monospace', fontSize: 11 },
      grid: { vertLines: { visible: false }, horzLines: { color: '#1a202b' } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
      crosshair: { vertLine: { color: '#2a3242' }, horzLine: { color: '#2a3242' } },
    })
    const candles = c.addSeries(CandlestickSeries, { upColor: UP, downColor: DOWN, borderVisible: false, wickUpColor: UP, wickDownColor: DOWN })
    const volume = c.addSeries(HistogramSeries, { priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false })
    c.priceScale('vol').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } })
    candles.priceScale().applyOptions({ scaleMargins: { top: 0.06, bottom: 0.24 } })
    const line = { lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false } as const
    const sma20 = c.addSeries(LineSeries, { ...line, color: '#fbbf24' })
    const sma50 = c.addSeries(LineSeries, { ...line, color: '#7c93ff' })
    series.current = { candles, volume, sma20, sma50 }
    chart.current = c
    return () => {
      c.remove()
      chart.current = null
      series.current = null
    }
  }, [])

  useEffect(() => {
    const s = series.current
    if (!s || !candles.data) return
    const bars = aggregate(candles.data, tf)
    s.candles.setData(bars)
    s.volume.setData(bars.map((b) => ({ time: b.time, value: b.volume, color: b.close >= b.open ? 'rgba(52,211,153,0.35)' : 'rgba(251,113,133,0.35)' })))
    s.sma20.setData(smas ? sma(bars, 20) : [])
    s.sma50.setData(smas ? sma(bars, 50) : [])
    lastBar.current = bars.at(-1) ?? null
    const ts = chart.current?.timeScale()
    if (ts && bars.length) ts.setVisibleLogicalRange({ from: Math.max(0, bars.length - 120), to: bars.length + 2 })
  }, [candles.data, tf, smas])

  // Move the last bar with live ticks (intraday timeframes).
  useEffect(() => {
    const s = series.current
    if (lastPrice === undefined || !intraday || !s) return
    const t = bucket(Math.floor(Date.now() / 1000) + IST_OFFSET, tf) as UTCTimestamp
    const last = lastBar.current
    if (last && last.time > t) return
    const bar: Bar =
      last && last.time === t
        ? { ...last, high: Math.max(last.high, lastPrice), low: Math.min(last.low, lastPrice), close: lastPrice }
        : { time: t, open: lastPrice, high: lastPrice, low: lastPrice, close: lastPrice, volume: 0 }
    s.candles.update(bar)
    lastBar.current = bar
  }, [lastPrice, tf, intraday])

  return (
    <>
      <ErrorBox error={candles.error} />
      {candles.data?.length === 0 && <div className="small muted" style={{ padding: '8px 0' }}>No candles for this range.</div>}
      <div className="candles" ref={el} />
    </>
  )
}
