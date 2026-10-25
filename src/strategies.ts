// Shared by the strategy list and a strategy's page: loading the catalog and the strategy tester.
import { api, unwrap } from './api/client'
import type { Account, CatalogStrategy, InstrumentSuggestion, Performance, PerformanceMatrix, SizeMode } from './api/types'
import { istDay } from './components/ui'

export const DEFAULT_CAPITAL = 500_000
/** Order size, % of equity: each entry is sized from the capital (compounding), like TradingView. */
export const DEFAULT_SIZE_PCT = 100
export const DEFAULT_RANGE: RangePreset = '1Y'

/** What every strategy is tested on unless the user picks another instrument: NIFTY 50, in the broker's own spelling. */
export function testSymbol(account: Pick<Account, 'broker'>): string {
  return account.broker === 'zerodha' ? 'NSE:NIFTY 50' : 'NSE:NIFTY50-INDEX'
}

/** Start with the strategy's initial timeframe; the user can select any supported timeframe. */
export function testTimeframe(s: CatalogStrategy): string {
  return s.default_timeframe
}

export const RANGE_PRESETS = {
  '1W': { label: 'Last 7 days', days: 7 },
  '1M': { label: 'Last 30 days', days: 30 },
  '3M': { label: 'Last 90 days', days: 91 },
  '6M': { label: 'Last 6 months', days: 182 },
  '1Y': { label: 'Last 12 months', days: 365 },
  '2Y': { label: 'Last 2 years', days: 730 },
} as const
export type RangePreset = keyof typeof RANGE_PRESETS

export interface DateRange {
  /** IST days, YYYY-MM-DD. */
  start: string
  end: string
}

export function presetRange(p: RangePreset, now = new Date()): DateRange {
  const end = istDay(now)
  const start = istDay(new Date(new Date(`${end}T12:00:00+05:30`).getTime() - RANGE_PRESETS[p].days * 86_400_000))
  return { start, end }
}

export function loadCatalog() {
  return unwrap<CatalogStrategy[]>(api.GET('/api/strategies/catalog'))
}

export async function searchInstruments(accountId: number, query: string, signal?: AbortSignal): Promise<InstrumentSuggestion[]> {
  const params = new URLSearchParams({ account_id: String(accountId), q: query, limit: '12' })
  const response = await fetch(`/api/strategies/instruments/search?${params}`, { credentials: 'include', signal })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string } | null
    throw new Error(body?.detail || `Instrument search failed (HTTP ${response.status})`)
  }
  return response.json() as Promise<InstrumentSuggestion[]>
}

/** Backtest order size: `fixedQty` units per entry, or (null) `sizePct` of the equity. */
function sizing(sizePct: number, fixedQty: number | null) {
  return fixedQty ? { size_mode: 'fixed' as const, quantity: fixedQty, size_pct: sizePct } : { size_mode: 'pct' as const, size_pct: sizePct }
}

export function loadPerformance(key: string, accountId: number, symbol: string, timeframe: string, range: DateRange, capital = DEFAULT_CAPITAL, sizePct = DEFAULT_SIZE_PCT, fixedQty: number | null = null) {
  return unwrap<Performance>(
    api.GET('/api/strategies/catalog/{key}/performance', {
      params: { path: { key }, query: { account_id: accountId, symbol, timeframe, start: range.start, end: range.end, capital, ...sizing(sizePct, fixedQty) } },
    }),
  )
}

export function loadMatrix(key: string, accountId: number, symbol: string, range: DateRange, capital = DEFAULT_CAPITAL, sizePct = DEFAULT_SIZE_PCT, fixedQty: number | null = null) {
  return unwrap<PerformanceMatrix>(
    api.GET('/api/strategies/catalog/{key}/performance/matrix', {
      params: { path: { key }, query: { account_id: accountId, symbol, start: range.start, end: range.end, capital, ...sizing(sizePct, fixedQty) } },
    }),
  )
}

/** Position sizing being edited: inputs stay strings until submitted. */
export interface SizingDraft {
  mode: SizeMode
  qty: string
  capital: string
}

export function sizingDraft(i?: { size_mode: SizeMode; fixed_quantity: number | null; capital_per_trade: number | null }): SizingDraft {
  return { mode: i?.size_mode ?? 'fixed', qty: i?.fixed_quantity ? String(i.fixed_quantity) : '', capital: i?.capital_per_trade ? String(i.capital_per_trade) : '' }
}

/** The API fields for a draft. A blank fixed quantity means the strategy's default. */
export function sizingBody(d: SizingDraft) {
  return d.mode === 'capital'
    ? { size_mode: d.mode, capital_per_trade: Number(d.capital) || null }
    : { size_mode: d.mode, fixed_quantity: Math.floor(Number(d.qty)) || null }
}

export function sizingValid(d: SizingDraft): boolean {
  return d.mode === 'fixed' || Number(d.capital) > 0
}
