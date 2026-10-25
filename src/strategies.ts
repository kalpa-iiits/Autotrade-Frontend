// Shared by the strategy list and a strategy's page: loading the catalog and the strategy tester.
import { api, unwrap } from './api/client'
import type { CatalogStrategy, Instance, Performance, PerformanceMatrix } from './api/types'
import { istDay } from './components/ui'

export const DEFAULT_CAPITAL = 500_000

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

export function loadPerformance(key: string, accountId: number, symbol: string, timeframe: string, range: DateRange, capital = DEFAULT_CAPITAL) {
  return unwrap<Performance>(
    api.GET('/api/strategies/catalog/{key}/performance', {
      params: { path: { key }, query: { account_id: accountId, symbol, timeframe, start: range.start, end: range.end, capital } },
    }),
  )
}

export function loadMatrix(key: string, accountId: number, symbol: string, range: DateRange, capital = DEFAULT_CAPITAL) {
  return unwrap<PerformanceMatrix>(
    api.GET('/api/strategies/catalog/{key}/performance/matrix', {
      params: { path: { key }, query: { account_id: accountId, symbol, start: range.start, end: range.end, capital } },
    }),
  )
}

/** The symbol a strategy is shown on: the user's own instance of it if there is one, else the code default. */
export function preferredSymbol(s: CatalogStrategy, instances: Instance[] | undefined): string {
  return instances?.find((i) => i.deployment_key === s.key)?.symbol ?? s.default_symbol
}
