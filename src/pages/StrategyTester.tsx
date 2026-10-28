import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { brokerTitle, needsLogin } from '../accounts'
import type { Account, BacktestTrade, CatalogStrategy, InstrumentSuggestion, Performance, TesterStats } from '../api/types'
import { Icon } from '../components/icons'
import { TesterChart, type TesterSeries } from '../components/TesterChart'
import { Empty, ErrorBox, Note, Seg, fmtCompact, fmtDate, fmtMoney, fmtNum, fmtQty, fmtTime, shortSymbol, useDebounced, useLoad } from '../components/ui'
import { DEFAULT_CAPITAL, DEFAULT_RANGE, DEFAULT_SIZE_PCT, RANGE_PRESETS, loadMatrix, loadPerformance, presetRange, searchInstruments, testSymbol, testTimeframe, type DateRange, type RangePreset } from '../strategies'

type View = 'overview' | 'summary' | 'trades'

/** Settings of the tester, kept in the URL so a link reopens the same report. */
function useTesterParams(s: CatalogStrategy, account: Account) {
  const [params, setParams] = useSearchParams()
  const preset = (params.get('range') ?? (params.get('start') ? 'custom' : DEFAULT_RANGE)) as RangePreset | 'custom'
  const fallback = presetRange(DEFAULT_RANGE)
  const range: DateRange =
    preset === 'custom' ? { start: params.get('start') ?? fallback.start, end: params.get('end') ?? fallback.end } : presetRange(preset in RANGE_PRESETS ? preset : DEFAULT_RANGE)
  const defaultCapital = s.backtest_initial_capital ?? DEFAULT_CAPITAL
  const capital = Number(params.get('capital')) > 0 ? Number(params.get('capital')) : defaultCapital
  const size = Number(params.get('size'))
  const qty = Number(params.get('qty'))
  return {
    symbol: params.get('symbol') ?? testSymbol(account),
    timeframe: s.timeframes.includes(params.get('tf') ?? '') ? params.get('tf')! : testTimeframe(s),
    preset,
    range,
    capital,
    sizePct: size > 0 && size <= 100 ? size : DEFAULT_SIZE_PCT,
    /** Fixed units per entry, or null to size from sizePct of the equity. */
    fixedQty: qty > 0 ? Math.floor(qty) : params.get('sizing') === 'pct' ? null : s.backtest_fixed_quantity,
    view: (['overview', 'summary', 'trades'].includes(params.get('view') ?? '') ? params.get('view') : 'overview') as View,
    set(next: Record<string, string | null>) {
      const p = new URLSearchParams(params)
      for (const [k, v] of Object.entries(next)) {
        if (v === null) p.delete(k)
        else p.set(k, v)
      }
      setParams(p, { replace: true })
    },
  }
}

export default function StrategyTester({ s, account }: { s: CatalogStrategy; account: Account }) {
  const t = useTesterParams(s, account)
  const blocked = needsLogin(account)
  const perf = useLoad(
    () => (blocked ? Promise.resolve(undefined) : loadPerformance(s.key, account.id, t.symbol, t.timeframe, t.range, t.capital, t.sizePct, t.fixedQty)),
    [s.key, account.id, t.symbol, t.timeframe, t.range.start, t.range.end, t.capital, t.sizePct, t.fixedQty, blocked],
  )
  const d = perf.data

  return (
    <section className="card tester" id="performance">
      <header className="tester-head">
        <h2>Backtest data</h2>
        <span className="small muted">Simulated on the broker’s past prices on {t.timeframe} candles. An estimate, not live results: fills are idealised, with no slippage.</span>
      </header>
      <div className="tester-bar">
        <div className="seg icon-seg" role="group" aria-label="View">
          {([['overview', 'Overview'], ['summary', 'Performance summary'], ['trades', 'List of trades']] as const).map(([v, label]) => (
            <button key={v} className={t.view === v ? 'on' : ''} aria-pressed={t.view === v} onClick={() => t.set({ view: v === 'overview' ? null : v })}>
              {label}
            </button>
          ))}
        </div>
        <SymbolPicker key={t.symbol} account={account} symbol={t.symbol} onPick={(symbol) => t.set({ symbol })} />
        <Dropdown label={<span className="mono">{t.timeframe}</span>} icon="market" title="Timeframe">
          {(close) => (
            <div className="menu-list">
              {s.timeframes.map((tf) => (
                <button key={tf} className={`menu-item ${tf === t.timeframe ? 'active' : ''}`} onClick={() => { t.set({ tf }); close() }}>
                  <span className="mono grow">{tf}</span>
                </button>
              ))}
            </div>
          )}
        </Dropdown>
        <RangePicker key={`${t.range.start}-${t.range.end}`} preset={t.preset} range={t.range} onPick={(preset, range) => t.set(preset === 'custom' ? { range: null, start: range.start, end: range.end } : { range: preset === DEFAULT_RANGE ? null : preset, start: null, end: null })} />
        <CapitalPicker
          key={`${t.capital}-${t.sizePct}-${t.fixedQty}`}
          capital={t.capital}
          sizePct={t.sizePct}
          fixedQty={t.fixedQty}
          commissionPerUnit={s.backtest_commission_per_unit}
          onPick={(c, size, qty) => t.set({
            capital: c === (s.backtest_initial_capital ?? DEFAULT_CAPITAL) ? null : String(c),
            size: size === DEFAULT_SIZE_PCT ? null : String(size),
            qty: qty === null || qty === s.backtest_fixed_quantity ? null : String(qty),
            sizing: qty === null && s.backtest_fixed_quantity ? 'pct' : null,
          })}
        />
        {perf.loading && d && <span className="small muted">Updating…</span>}
      </div>

      {s.backtest_note && <Note tone="warn">{s.backtest_note}</Note>}
      {blocked && <Note tone="warn">Log in to {brokerTitle(account.broker)} on the Accounts page to load its price history for the tester.</Note>}
      {account.broker === 'paper' && <Note tone="warn">Paper-account history is synthetic test data, not NSE market data. Its performance cannot match TradingView; use a connected Fyers or Zerodha account for a market-data comparison.</Note>}
      <ErrorBox error={perf.error} />
      {perf.loading && !d && !blocked && (
        <div className="tester-loading muted small">
          Pulling 1-minute history for {shortSymbol(t.symbol)} from {account.broker === 'paper' ? 'the paper broker' : brokerTitle(account.broker)} and running the strategy on {t.timeframe}…
        </div>
      )}

      {d && (
        <div className="stack" style={{ opacity: perf.loading ? 0.55 : 1, transition: 'opacity .15s' }}>
          {/* a few days' slack: the range may start on a weekend or holiday */}
          {new Date(d.data_from).getTime() > new Date(`${d.start}T00:00:00+05:30`).getTime() + 5 * 86_400_000 && (
            <Note tone="warn">The broker’s 1-minute history for {shortSymbol(d.symbol)} starts {fmtDate(d.data_from)}, so the test begins there.</Note>
          )}
          <KeyStats st={d.summary.all} />
          {t.view === 'overview' && <Overview d={d} s={s} account={account} t={t} />}
          {t.view === 'summary' && <Summary d={d} />}
          {t.view === 'trades' && <Trades d={d} />}
          <div className="tiny muted">
            {shortSymbol(d.symbol)} · {d.timeframe} · {fmtDate(d.data_from)} – {fmtDate(d.data_to)} · {fmtQty(d.candles)} one-minute candles · ₹{fmtQty(d.capital)} capital, {d.fixed_quantity ? `${fmtQty(d.fixed_quantity)} units per trade` : `${d.size_pct}% of equity per trade`}
            {d.commission_per_unit ? ` · ₹${fmtNum(d.commission_per_unit)} per unit per order` : ''}
            {d.blocked_signals ? ` · ${d.blocked_signals} signals blocked by risk limits` : ''}. {d.assumptions.join('. ')}. Past results don’t guarantee future returns.
          </div>
        </div>
      )}
    </section>
  )
}

// ---------- toolbar ----------

function Dropdown({ label, icon, title, children }: { label: ReactNode; icon?: 'market' | 'orders' | 'trades'; title: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div className="dropdown" ref={ref}>
      <button className="ghost bar-btn" onClick={() => setOpen(!open)} aria-expanded={open} title={title}>
        {icon && <Icon name={icon} size={15} />}
        {label}
        <Icon name="chevrons" size={12} className="muted" />
      </button>
      {open && <div className="dropdown-menu">{children(() => setOpen(false))}</div>}
    </div>
  )
}

function RangePicker({ preset, range, onPick }: { preset: RangePreset | 'custom'; range: DateRange; onPick: (p: RangePreset | 'custom', r: DateRange) => void }) {
  const [start, setStart] = useState(range.start)
  const [end, setEnd] = useState(range.end)
  return (
    <Dropdown title="Date range" icon="orders" label={<span>{fmtDate(range.start)} — {fmtDate(range.end)}</span>}>
      {(close) => (
        <div className="menu-list" style={{ width: 280 }}>
          {(Object.keys(RANGE_PRESETS) as RangePreset[]).map((p) => (
            <button key={p} className={`menu-item ${preset === p ? 'active' : ''}`} onClick={() => { onPick(p, presetRange(p)); close() }}>
              <span className="grow">{RANGE_PRESETS[p].label}</span>
              <span className="mono tiny muted">{p}</span>
            </button>
          ))}
          <form
            className="stack tight"
            style={{ padding: '10px 10px 6px', borderTop: '1px solid var(--border)', marginTop: 4 }}
            onSubmit={(e) => {
              e.preventDefault()
              onPick('custom', { start, end })
              close()
            }}
          >
            <div className="caps tiny">Custom range</div>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input type="date" value={start} max={end} onChange={(e) => setStart(e.target.value)} aria-label="From" required />
              <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} aria-label="To" required />
            </div>
            <button type="submit" className="primary sm">Apply</button>
          </form>
        </div>
      )}
    </Dropdown>
  )
}

function CapitalPicker({ capital, sizePct, fixedQty, commissionPerUnit, onPick }: { capital: number; sizePct: number; fixedQty: number | null; commissionPerUnit: number; onPick: (c: number, sizePct: number, fixedQty: number | null) => void }) {
  const [value, setValue] = useState(String(capital))
  const [mode, setMode] = useState<'pct' | 'fixed'>(fixedQty ? 'fixed' : 'pct')
  const [size, setSize] = useState(String(sizePct))
  const [qty, setQty] = useState(String(fixedQty ?? ''))
  return (
    <Dropdown
      title="Initial capital and order size"
      label={<span><span className="muted">₹</span> {fmtCompact(capital).replace('₹', '')} <span className="tiny muted">INR · {fixedQty ? `${fmtQty(fixedQty)} units per trade` : `${sizePct}% of equity`}</span></span>}
    >
      {(close) => (
        <form
          className="stack tight"
          style={{ padding: 10, width: 260 }}
          onSubmit={(e) => {
            e.preventDefault()
            const s = Number(size)
            const q = Math.floor(Number(qty))
            if (Number(value) > 0 && (mode === 'pct' || q > 0)) onPick(Number(value), s > 0 && s <= 100 ? s : DEFAULT_SIZE_PCT, mode === 'fixed' ? q : null)
            close()
          }}
        >
          <div className="caps tiny">Initial capital (₹)</div>
          <input className="mono" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))} autoFocus />
          <div className="row" style={{ gap: 6 }}>
            {[100_000, 500_000, 1_000_000, 2_500_000].map((v) => (
              <button key={v} type="button" className="sm" onClick={() => setValue(String(v))}>{fmtCompact(v)}</button>
            ))}
          </div>
          <div className="caps tiny" style={{ marginTop: 6 }}>Order size</div>
          <Seg label="Order size" value={mode} onChange={setMode} options={[{ value: 'pct', label: '% of capital' }, { value: 'fixed', label: 'Fixed quantity' }]} />
          {mode === 'fixed' ? <>
            <input className="mono" inputMode="numeric" placeholder="Units per trade" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))} />
            <div className="tiny muted">Every entry trades exactly this many units, whatever the price — like TradingView’s “Contracts”.</div>
          </> : <>
            <input className="mono" inputMode="decimal" value={size} onChange={(e) => setSize(e.target.value.replace(/[^\d.]/g, ''))} />
            <div className="row" style={{ gap: 6 }}>
              {[10, 25, 50, 100].map((v) => (
                <button key={v} type="button" className="sm" onClick={() => setSize(String(v))}>{v}%</button>
              ))}
            </div>
            <div className="tiny muted">Each entry buys as many units as this share of the current equity (capital plus closed P&amp;L) pays for, so results compound.</div>
          </>}
          {commissionPerUnit ? <div className="tiny muted">Commission: ₹{commissionPerUnit} per unit per order.</div> : null}
          <button type="submit" className="primary sm">Apply</button>
        </form>
      )}
    </Dropdown>
  )
}

function SymbolPicker({ account, symbol, onPick }: { account: Account; symbol: string; onPick: (s: string) => void }) {
  const [draft, setDraft] = useState(symbol)
  const [suggestions, setSuggestions] = useState<InstrumentSuggestion[]>([])
  const query = useDebounced(draft.trim(), 250)
  useEffect(() => {
    if (!query) return
    const controller = new AbortController()
    searchInstruments(account.id, query, controller.signal)
      .then(setSuggestions)
      .catch((err) => {
        if (!(err instanceof DOMException && err.name === 'AbortError')) setSuggestions([])
      })
    return () => controller.abort()
  }, [account.id, query])
  function submit(e: FormEvent) {
    e.preventDefault()
    if (draft.trim() && draft.trim() !== symbol) onPick(draft.trim())
  }
  return (
    <form className="input-wrap symbol-input" onSubmit={submit}>
      <Icon name="search" size={14} />
      <input className="mono" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={submit} aria-label="Instrument" list="tester-symbols" />
      <datalist id="tester-symbols">{suggestions.map((item) => <option key={item.symbol} value={item.symbol}>{item.ticker} — {item.name}</option>)}</datalist>
    </form>
  )
}

// ---------- key stats ----------

function Money({ v, sign, dec = true }: { v: number | null | undefined; sign?: boolean; dec?: boolean }) {
  if (v === null || v === undefined) return <>—</>
  const abs = Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: dec ? 2 : 0, maximumFractionDigits: dec ? 2 : 0 })
  return <>{v < 0 ? '−' : sign && v > 0 ? '+' : ''}{abs}<span className="ccy">INR</span></>
}

const pct = (v: number | null | undefined, sign = false) => (v === null || v === undefined ? '—' : `${sign && v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}%`)

function KeyStats({ st }: { st: TesterStats }) {
  const tone = st.net_pnl > 0 ? 'pos' : st.net_pnl < 0 ? 'neg' : ''
  return (
    <div>
      <h3 className="tester-h">Key stats</h3>
      <div className="key-stats">
        <div>
          <div className="label">Total P&amp;L</div>
          <div className={`value ${tone}`}><Money v={st.net_pnl} sign /> <span className="pct">{pct(st.net_pnl_pct, true)}</span></div>
        </div>
        <div>
          <div className="label">Max drawdown</div>
          <div className="value"><Money v={st.max_drawdown} /> <span className="pct">{pct(st.max_drawdown_pct)}</span></div>
        </div>
        <div>
          <div className="label">Profitable trades</div>
          <div className="value">{pct(st.win_rate)} <span className="pct">{st.wins}/{st.trades}</span></div>
        </div>
        <div>
          <div className="label">Profit factor</div>
          <div className={`value ${st.profit_factor === null ? '' : st.profit_factor >= 1 ? 'pos' : 'neg'}`}>{st.profit_factor?.toFixed(3) ?? '—'}</div>
        </div>
      </div>
    </div>
  )
}

// ---------- overview: the chart and the timeframe comparison ----------

const SERIES: { key: keyof TesterSeries; label: string }[] = [
  { key: 'pnl', label: 'Cumulative P&L' },
  { key: 'buyHold', label: 'Buy and hold' },
  { key: 'excursions', label: 'Trades excursions' },
  { key: 'drawdowns', label: 'Run-ups and drawdowns' },
]

function Overview({ d, s, account, t }: { d: Performance; s: CatalogStrategy; account: Account; t: ReturnType<typeof useTesterParams> }) {
  const [show, setShow] = useState<TesterSeries>({ pnl: true, buyHold: false, excursions: true, drawdowns: false })
  const bh = d.buy_hold.length ? d.buy_hold[d.buy_hold.length - 1].pnl : null
  return (
    <>
      <div>
        <div className="between perf-head" style={{ marginBottom: 8 }}>
          <h3 className="tester-h">Performance</h3>
          {bh !== null && <span className="small muted">Buy &amp; hold over the range: <span className={bh >= 0 ? 'pos' : 'neg'}>{fmtMoney(bh, { sign: true })}</span></span>}
        </div>
        <div className="tester-chart-wrap">
          <div className="legend">
            {SERIES.map(({ key, label }) => (
              <button key={key} className={`legend-item ${show[key] ? '' : 'off'} ${key}`} onClick={() => setShow((x) => ({ ...x, [key]: !x[key] }))} aria-pressed={show[key]}>
                <i />
                {label}
              </button>
            ))}
          </div>
          <TesterChart trades={d.trades} buyHold={d.buy_hold} start={d.start} end={d.end} show={show} />
        </div>
      </div>
      <Compare s={s} account={account} t={t} />
    </>
  )
}

/** The same range on every timeframe, so the user sees where the strategy holds up. */
function Compare({ s, account, t }: { s: CatalogStrategy; account: Account; t: ReturnType<typeof useTesterParams> }) {
  const [asked, setAsked] = useState(false)
  const m = useLoad(
    () => (asked ? loadMatrix(s.key, account.id, t.symbol, t.range, t.capital, t.sizePct, t.fixedQty) : Promise.resolve(undefined)),
    [asked, s.key, account.id, t.symbol, t.range.start, t.range.end, t.capital, t.sizePct, t.fixedQty],
  )
  return (
    <div className="inset" style={{ padding: 0 }}>
      <div className="between compare-head" style={{ padding: '14px 16px 8px' }}>
        <div>
          <div style={{ fontWeight: 600 }}>Compare timeframes</div>
          <div className="small muted" style={{ marginTop: 2 }}>The same {shortSymbol(t.symbol)} range on every timeframe. Click a row to open it.</div>
        </div>
        {!asked && <button className="sm" onClick={() => setAsked(true)}>Run on all {s.timeframes.length} timeframes</button>}
      </div>
      <ErrorBox error={m.error} />
      {asked && !m.data && !m.error && <div className="small muted" style={{ padding: '4px 16px 16px' }}>Backtesting {s.timeframes.join(', ')}…</div>}
      {m.data && (
        <div className="table-wrap">
          <table className="matrix">
            <thead>
              <tr>
                <th>Timeframe</th>
                <th className="num">Total P&amp;L</th>
                <th className="num">Max drawdown</th>
                <th className="num">Profitable</th>
                <th className="num">Trades</th>
                <th className="num">Profit factor</th>
              </tr>
            </thead>
            <tbody>
              {s.timeframes.map((tf) => {
                const c = m.data!.timeframes[tf]
                if (!c) return null
                return (
                  <tr key={tf} className={`cell ${tf === t.timeframe ? 'on' : ''}`} onClick={() => t.set({ tf })}>
                    <td className="mono">{tf}</td>
                    <td className={`num ${c.net_pnl > 0 ? 'pos' : c.net_pnl < 0 ? 'neg' : ''}`}>{fmtMoney(c.net_pnl, { sign: true })}<div className="sub">{pct(c.net_pnl_pct, true)}</div></td>
                    <td className="num">{fmtMoney(c.max_drawdown)}<div className="sub">{pct(c.max_drawdown_pct)}</div></td>
                    <td className="num">{pct(c.win_rate)}<div className="sub">{c.wins}/{c.trades}</div></td>
                    <td className="num">{c.trades}</td>
                    <td className={`num ${c.profit_factor === null ? '' : c.profit_factor >= 1 ? 'pos' : 'neg'}`}>{c.profit_factor?.toFixed(3) ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------- performance summary: all / long / short ----------

function fmtMinutes(m: number | null): string {
  if (m === null) return '—'
  if (m < 60) return `${Math.round(m)}m`
  if (m < 1440) return `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`
  return `${Math.floor(m / 1440)}d ${Math.round((m % 1440) / 60)}h`
}

function Summary({ d }: { d: Performance }) {
  const cols = [d.summary.all, d.summary.long, d.summary.short]
  const money = (v: number | null, p?: number | null, sign = false) => (
    <>
      <span className={sign && v ? (v > 0 ? 'pos' : 'neg') : ''}><Money v={v} sign={sign} /></span>
      {p !== undefined && <div className="sub">{pct(p, sign)}</div>}
    </>
  )
  const rows: { label: string; cell: (st: TesterStats) => ReactNode }[] = [
    { label: 'Net profit', cell: (st) => money(st.net_pnl, st.net_pnl_pct, true) },
    { label: 'Gross profit', cell: (st) => money(st.gross_profit) },
    { label: 'Gross loss', cell: (st) => money(st.gross_loss ? -st.gross_loss : 0) },
    { label: 'Max run-up', cell: (st) => money(st.max_run_up, st.max_run_up_pct) },
    { label: 'Max drawdown', cell: (st) => money(st.max_drawdown, st.max_drawdown_pct) },
    { label: 'Profit factor', cell: (st) => st.profit_factor?.toFixed(3) ?? '—' },
    { label: 'Total trades', cell: (st) => st.trades },
    { label: 'Winning trades', cell: (st) => st.wins },
    { label: 'Losing trades', cell: (st) => st.losses },
    { label: 'Percent profitable', cell: (st) => pct(st.win_rate) },
    { label: 'Avg P&L per trade', cell: (st) => money(st.avg_trade, undefined, true) },
    { label: 'Avg winning trade', cell: (st) => money(st.avg_win) },
    { label: 'Avg losing trade', cell: (st) => money(st.avg_loss) },
    { label: 'Ratio avg win / avg loss', cell: (st) => st.ratio_avg_win_loss?.toFixed(3) ?? '—' },
    { label: 'Largest winning trade', cell: (st) => money(st.best) },
    { label: 'Largest losing trade', cell: (st) => money(st.worst) },
    { label: 'Avg holding time', cell: (st) => fmtMinutes(st.avg_hold_minutes) },
    { label: 'Longest losing streak', cell: (st) => st.max_consecutive_losses },
    { label: 'Days with a trade', cell: (st) => st.trading_days },
  ]
  return (
    <div>
      <h3 className="tester-h">Performance summary</h3>
      <div className="table-wrap tester-table">
        <table>
          <thead>
            <tr>
              <th>Metric</th>
              <th className="num">All</th>
              <th className="num">Long</th>
              <th className="num">Short</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td>{r.label}</td>
                {cols.map((st, i) => <td key={i} className="num">{st.trades || r.label === 'Total trades' ? r.cell(st) : '—'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------- list of trades ----------

function csv(trades: BacktestTrade[]): string {
  const head = ['Trade #', 'Type', 'Signal', 'Date/Time', 'Price INR', 'Quantity', 'Net P&L INR', 'Net P&L %', 'Run-up INR', 'Drawdown INR', 'Cumulative P&L INR']
  const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const rows = trades.flatMap((t) => [
    [t.number, `Exit ${t.direction.toLowerCase()}`, t.exit_reason, t.exit_at, t.exit_price, t.quantity, t.pnl, t.return_pct, t.run_up, t.drawdown, t.cum_pnl],
    [t.number, `Entry ${t.direction.toLowerCase()}`, t.entry_reason, t.entry_at, t.entry_price, t.quantity, t.pnl, t.return_pct, t.run_up, t.drawdown, t.cum_pnl],
  ])
  return [head, ...rows].map((r) => r.map(q).join(',')).join('\n')
}

function Trades({ d }: { d: Performance }) {
  const [newestFirst, setNewestFirst] = useState(true)
  const [limit, setLimit] = useState(50)
  const ordered = useMemo(() => (newestFirst ? [...d.trades].reverse() : d.trades), [d.trades, newestFirst])
  const shown = ordered.slice(0, limit)

  function download() {
    const url = URL.createObjectURL(new Blob([csv(d.trades)], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${d.deployment_key}_${shortSymbol(d.symbol)}_${d.timeframe}_${d.start}_${d.end}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="between" style={{ marginBottom: 8 }}>
        <h3 className="tester-h">List of trades</h3>
        <button className="sm" onClick={download} disabled={!d.trades.length} title="Download as CSV">
          <Icon name="download" size={14} /> CSV
        </button>
      </div>
      {!d.trades.length ? (
        <Empty>No trades in this range.</Empty>
      ) : (
        <div className="table-wrap tester-table trade-list">
          <table>
            <thead>
              <tr>
                <th>
                  <button className="link" onClick={() => setNewestFirst(!newestFirst)} style={{ color: 'inherit' }}>
                    Trade # {newestFirst ? '↓' : '↑'}
                  </button>
                </th>
                <th>Type</th>
                <th>Date and time</th>
                <th>Signal</th>
                <th className="num">Price</th>
                <th className="num">Size</th>
                <th className="num">Net P&amp;L</th>
                <th className="num">Run-up</th>
                <th className="num">Drawdown</th>
                <th className="num">Cumulative P&amp;L</th>
              </tr>
            </thead>
            {shown.map((tr) => (
              <tbody key={tr.number} className="trade">
                <tr>
                  <td rowSpan={2} className="trade-no">
                    {tr.number} <span className={tr.direction === 'LONG' ? 'long' : 'short'}>{tr.direction === 'LONG' ? 'Long' : 'Short'}</span>
                  </td>
                  <td>Exit</td>
                  <td className="mono small">{fmtTime(tr.exit_at)}</td>
                  <td className="small muted signal" title={tr.exit_reason ?? ''}>{tr.exit_reason}</td>
                  <td className="num">{fmtNum(tr.exit_price)}</td>
                  <td rowSpan={2} className="num">{fmtQty(tr.quantity)}<div className="sub">{fmtCompact(tr.notional).replace('₹', '')} INR</div></td>
                  <td rowSpan={2} className={`num ${tr.pnl > 0 ? 'pos' : tr.pnl < 0 ? 'neg' : ''}`}><Money v={tr.pnl} sign /><div className="sub">{pct(tr.return_pct, true)}</div></td>
                  <td rowSpan={2} className="num"><Money v={tr.run_up} /></td>
                  <td rowSpan={2} className="num">{tr.drawdown ? <Money v={-tr.drawdown} /> : <Money v={0} />}</td>
                  <td rowSpan={2} className={`num ${tr.cum_pnl > 0 ? 'pos' : tr.cum_pnl < 0 ? 'neg' : ''}`}><Money v={tr.cum_pnl} sign /></td>
                </tr>
                <tr>
                  <td>Entry</td>
                  <td className="mono small">{fmtTime(tr.entry_at)}</td>
                  <td className="small muted signal" title={tr.entry_reason ?? ''}>{tr.entry_reason}</td>
                  <td className="num">{fmtNum(tr.entry_price)}</td>
                </tr>
              </tbody>
            ))}
          </table>
        </div>
      )}
      {ordered.length > shown.length && (
        <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
          <button className="sm" onClick={() => setLimit(limit + 100)}>Show more ({ordered.length - shown.length} left)</button>
        </div>
      )}
    </div>
  )
}
