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
import { api, errorMessage, unwrap, type Schemas } from '../api/client'
import type { Account, Candle } from '../api/types'
import { Sparkline } from '../components/charts'
import { ForecastFan } from '../components/forecastFan'
import { Icon } from '../components/icons'
import { InstrumentInput } from '../components/InstrumentInput'
import { Page } from '../components/Page'
import { MarketPill } from '../components/StatusPills'
import { Card, Empty, ErrorBox, NeedAccount, Pill, Seg, fmtMoney, fmtNum, fmtPct, istDay, shortSymbol, symbolKind, useLoad } from '../components/ui'
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
  const [kronos, setKronos] = useState(false)
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
            {kronos && <span className="row" style={{ gap: 6 }}><i style={{ width: 12, height: 2, background: FORECAST, display: 'inline-block' }} /> Kronos</span>}
            <button className="sm" aria-pressed={smas} onClick={() => setSmas(!smas)}>Indicators</button>
            <button className="sm" aria-pressed={kronos} onClick={() => setKronos(!kronos)} title="Predict the next bars with the Kronos model">Forecast</button>
          </div>
        </div>
        <CandleChart accountId={account.id} symbol={symbol} tf={tf} smas={smas} forecast={kronos} lastPrice={ltp} />
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

// A price the chart can draw: it crashes (blanking the page) on null / NaN.
const drawable = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

function aggregate(candles: Candle[], tf: Tf): Bar[] {
  const out: Bar[] = []
  // Oldest first: the chart's production build doesn't check the order, and out-of-order bars
  // crash it while drawing ("Value is null"). Sorted, the bars below come out in order too.
  const sorted = candles
    .map((c) => ({ c, sec: Math.floor(new Date(c.time).getTime() / 1000) }))
    .filter(({ sec }) => Number.isFinite(sec))
    .sort((a, b) => a.sec - b.sec)
  for (const { c, sec } of sorted) {
    if (![c.open, c.high, c.low, c.close].every(drawable)) continue  // e.g. an unfinished candle
    const volume = drawable(c.volume) ? c.volume : 0
    const t = bucket(sec + IST_OFFSET, tf) as UTCTimestamp
    const last = out[out.length - 1]
    if (last && last.time === t) {
      last.high = Math.max(last.high, c.high)
      last.low = Math.min(last.low, c.low)
      last.close = c.close
      last.volume += volume
    } else {
      out.push({ time: t, open: c.open, high: c.high, low: c.low, close: c.close, volume })
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
const FORECAST = '#f59e0b'
// Bars Kronos predicts, sampled runs (drawn as a fan around their mean; they also give the stats), and the most bars it reads (Kronos-small's context; the backend trims too).
const HORIZON = 24
const RUNS = 30
const LOOKBACK = 512

type Forecast = Schemas['ForecastResponse']

function CandleChart({ accountId, symbol, tf, smas, forecast, lastPrice }: { accountId: number; symbol: string; tf: Tf; smas: boolean; forecast: boolean; lastPrice?: number }) {
  const el = useRef<HTMLDivElement>(null)
  const chart = useRef<IChartApi | null>(null)
  const series = useRef<{
    candles: ISeriesApi<'Candlestick'>
    volume: ISeriesApi<'Histogram'>
    sma20: ISeriesApi<'Line'>
    sma50: ISeriesApi<'Line'>
    mean: ISeriesApi<'Line'>
    fan: ForecastFan
  } | null>(null)
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
  const bars = useMemo(() => (candles.data ? aggregate(candles.data, tf) : null), [candles.data, tf])
  const [predicted, setPredicted] = useState<{ key: string; data?: Forecast; error?: string } | null>(null)
  // One forecast per loaded series: live ticks don't ask again, the next candle load does. Not
  // while loading: `bars` is then the previous timeframe's candles regrouped. Kronos needs 32+.
  const forecastKey = !candles.loading && bars && bars.length >= 32 ? `${symbol}|${tf}|${bars.at(-1)!.time}|${bars.length}` : null

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
    // The forecast: the runs' mean as a line (with its price on the axis), the runs behind it.
    const mean = c.addSeries(LineSeries, { color: FORECAST, lineWidth: 3, priceLineVisible: false, lastValueVisible: true })
    const fan = new ForecastFan()
    mean.attachPrimitive(fan)
    series.current = { candles, volume, sma20, sma50, mean, fan }
    chart.current = c
    return () => {
      c.remove()
      chart.current = null
      series.current = null
    }
  }, [])

  useEffect(() => {
    const s = series.current
    if (!s || !bars) return
    s.candles.setData(bars)
    s.sma20.setData(smas ? sma(bars, 20) : [])
    s.sma50.setData(smas ? sma(bars, 50) : [])
    lastBar.current = bars.at(-1) ?? null
    const ts = chart.current?.timeScale()
    if (ts && bars.length) ts.setVisibleLogicalRange({ from: Math.max(0, bars.length - 120), to: bars.length + 2 })
  }, [bars, smas])

  // Kronos forecast of the next HORIZON bars (POST /api/forecast), drawn after the last bar.
  useEffect(() => {
    if (!forecast || !forecastKey || !bars || predicted?.key === forecastKey) return
    let current = true
    unwrap(api.POST('/api/forecast', {
      body: {
        bars: bars.slice(-LOOKBACK).map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume })),
        timeframe: tf,
        horizon: HORIZON,
        samples: RUNS,
      },
    }))
      .then((data) => current && setPredicted({ key: forecastKey, data }))
      .catch((e) => current && setPredicted({ key: forecastKey, error: errorMessage(e) }))
    return () => { current = false }
  }, [forecast, forecastKey, bars, tf, predicted?.key])

  const shown = forecast && predicted?.key === forecastKey ? predicted.data : undefined
  // Volume (real, then the forecast's mean volume in amber) and the forecast fan from the last bar.
  useEffect(() => {
    const s = series.current
    if (!s || !bars) return
    const points = shown?.points ?? []
    const last = bars.at(-1)
    const start = last && points.length ? [{ time: last.time, value: last.close }] : []
    s.volume.setData([
      ...bars.map((b) => ({ time: b.time, value: b.volume, color: b.close >= b.open ? 'rgba(52,211,153,0.35)' : 'rgba(251,113,133,0.35)' })),
      ...points.map((p) => ({ time: p.time as UTCTimestamp, value: p.volume, color: 'rgba(245,158,11,0.45)' })),
    ])
    s.mean.setData([...start, ...points.map((p) => ({ time: p.time as UTCTimestamp, value: p.close }))])
    s.fan.setData(last && shown && points.length ? {
      start: { time: last.time, close: last.close },
      times: points.map((p) => p.time as UTCTimestamp),
      runs: shown.runs,
    } : null)
    const n = bars.length
    // Zoom to the forecast: about as many real bars before it as it predicts.
    if (points.length && n) chart.current?.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - Math.max(30, points.length)), to: n + points.length + 3 })
  }, [shown, bars])

  // Move the last bar with live ticks (intraday timeframes).
  useEffect(() => {
    const s = series.current
    if (!drawable(lastPrice) || !intraday || !s) return
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
      {forecast && !candles.loading && bars && bars.length < 32 && <div className="small muted" style={{ padding: '4px 0 8px' }}>Too few bars to forecast.</div>}
      {forecast && forecastKey && <ForecastNote state={predicted?.key === forecastKey ? predicted : null} last={bars?.at(-1)?.close} />}
      {candles.data?.length === 0 && <div className="small muted" style={{ padding: '8px 0' }}>No candles for this range.</div>}
      <div className="chart-wrap">
        <div className="candles" ref={el} />
        {shown && bars && <ForecastCaption forecast={shown} last={bars.at(-1)!.close} />}
      </div>
      {shown && bars && <ForecastStats forecast={shown} bars={bars} />}
    </>
  )
}

function ForecastNote({ state, last }: { state: { data?: Forecast; error?: string } | null; last?: number }) {
  if (state?.error) return <ErrorBox error={`Forecast: ${state.error}`} />
  const points = state?.data?.points
  if (!points?.length) return <ForecastProgress />
  const end = points.at(-1)!
  const move = last ? ((end.close - last) / last) * 100 : null
  return (
    <div className="small muted" style={{ padding: '4px 0 8px' }}>
      {state!.data!.model.split('/').at(-1)} · mean of {state!.data!.runs.length} runs, next {points.length} bars: close <span className="mono">{fmtNum(end.close)}</span>
      {move !== null && <span className={`mono ${move >= 0 ? 'pos' : 'neg'}`}> {move >= 0 ? '▲' : '▼'} {fmtPct(move)}</span>}
      {' '}· a model forecast, not advice
    </div>
  )
}

/** While a forecast runs (20–40 s; the first one also loads the model): what it's doing and for how long. */
function ForecastProgress() {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setSeconds((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="fc-progress" role="status" aria-live="polite">
      <div className="between small">
        <span className="row" style={{ gap: 8 }}><span className="fc-pulse" /> Forecasting in progress · {RUNS} runs × next {HORIZON} candles</span>
        <span className="mono muted">{seconds}s</span>
      </div>
      <div className="fc-track"><span /></div>
      <div className="tiny muted">Usually 20–40 seconds; the first forecast after a restart also loads the model.</div>
    </div>
  )
}

/** One line over the chart: how the runs end against the last close. */
function ForecastCaption({ forecast, last }: { forecast: Forecast; last: number }) {
  const finals = forecast.runs.map((r) => r.at(-1)!).filter((c) => c !== undefined)
  if (!finals.length) return null
  const up = finals.filter((c) => c > last).length
  return (
    <div className="fc-caption small">
      <b className="fc-em">{up} of {finals.length}</b> runs end higher and <b className="fc-em">{finals.length - up}</b> end lower than {fmtMoney(last)};
      range <b className="fc-em">{fmtMoney(Math.min(...finals))}</b> to <b className="fc-em">{fmtMoney(Math.max(...finals))}</b>.
    </div>
  )
}

/** Standard deviation of bar-to-bar returns. */
function swing(closes: number[]): number {
  const r = closes.slice(1).map((c, i) => c / closes[i] - 1)
  const mean = r.reduce((a, b) => a + b, 0) / r.length
  return Math.sqrt(r.reduce((a, b) => a + (b - mean) ** 2, 0) / r.length)
}

/** How the sampled runs end: direction, swing against the last real bars, mean and spread. */
function ForecastStats({ forecast, bars }: { forecast: Forecast; bars: Bar[] }) {
  const runs = forecast.runs
  const n = runs[0]?.length ?? 0
  if (!runs.length || !n) return null
  const last = bars.at(-1)!.close
  const finals = runs.map((r) => r.at(-1)!)
  const up = finals.filter((c) => c > last).length
  const real = swing(bars.slice(-(n + 1)).map((b) => b.close))
  const wilder = runs.filter((r) => swing([last, ...r]) > real).length
  const mean = finals.reduce((a, b) => a + b, 0) / finals.length
  const upPct = (up / runs.length) * 100
  const wildPct = (wilder / runs.length) * 100
  return (
    <div className="fc-grid">
      <div className="fc-cell wide">
        <div className="caps">Direction of the runs · next {n} candles</div>
        <div style={{ marginTop: 6 }}>
          <div className="between small" style={{ fontWeight: 600 }}><span className="pos">▲ Up</span><span className="neg">Down ▼</span></div>
          <div className="between"><span className="figure pos">{upPct.toFixed(0)}%</span><span className="figure neg">{(100 - upPct).toFixed(0)}%</span></div>
        </div>
        <div className="fc-split"><span style={{ width: `${upPct}%` }} /></div>
        <div className="small muted"><b className="fc-em">{up} of {runs.length}</b> runs ended above the last close of {fmtMoney(last)}; <b className="fc-em">{runs.length - up} of {runs.length}</b> ended at or below it.</div>
      </div>
      <div className="fc-cell wide">
        <div className="caps">Volatility amplification</div>
        <div className="figure fc-amber" style={{ marginTop: 6 }}>{wildPct.toFixed(0)}%</div>
        <div className="fc-meter"><span style={{ width: `${wildPct}%` }} /></div>
        <div className="small muted"><b className="fc-em">{wilder} of {runs.length}</b> runs swing harder over the next {n} candles than the last {n} real ones did.</div>
      </div>
      <div className="fc-cell">
        <div className="caps">Mean forecast</div>
        <div className="figure md fc-amber" style={{ marginTop: 6 }}>{fmtMoney(mean)}</div>
        <div className="small muted"><span className={mean >= last ? 'pos' : 'neg'}>{fmtPct(((mean - last) / last) * 100)}</span> after {n} candles</div>
      </div>
      <div className="fc-cell">
        <div className="caps">Full range</div>
        <div className="mono fc-amber" style={{ fontSize: 17, fontWeight: 500, marginTop: 6 }}>{fmtMoney(Math.min(...finals))} – {fmtMoney(Math.max(...finals))}</div>
        <div className="small muted">lowest to highest run, {n} candles out</div>
      </div>
      <div className="tiny muted" style={{ gridColumn: '1 / -1' }}>{forecast.model.split('/').at(-1)} · {runs.length} sampled runs. A model forecast, not advice.</div>
    </div>
  )
}
