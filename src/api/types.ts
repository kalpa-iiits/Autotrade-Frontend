// Response types the OpenAPI schema leaves untyped (the backend returns plain dicts there).
// Typed endpoints (Me, Order, Position, request bodies) come from schema.d.ts via `Schemas`.
import type { Schemas } from './client'

export type Me = Schemas['Me']
export type Order = Schemas['Order']
export type OrderCreate = Schemas['OrderCreate']
export type Position = Schemas['Position']
export type Side = Schemas['Side']
export type OrderType = Schemas['OrderType']
export type Product = Schemas['Product']

export type BrokerName = 'paper' | 'fyers' | 'zerodha'

/** What each broker needs (GET /api/accounts/brokers), for the "add account" form. */
export interface BrokerSpec {
  credentials: string[]
  options: Record<string, { type?: string; enum?: string[]; default?: unknown; description?: string; title?: string }>
  daily_login: boolean
}
export type BrokerSpecs = Record<BrokerName, BrokerSpec>

/** One account's live connection (owner only). */
export interface Connection {
  broker: {
    name: string
    connected: boolean
    reason: string | null
    last_resync_at: string | null
    last_resync_error: string | null
    resynced_orders: number
    ticks_received?: number
    last_tick_at?: string | null
    stream_error?: string | null
  }
  ledger: { healthy: boolean; unsaved_orders: number; last_error: string | null }
  websockets: { orders: number; tickers: number }
}

/** A broker account as the API shows it: never any secrets. */
export interface Account {
  id: number
  broker: BrokerName
  label: string
  options: Record<string, unknown>
  /** Field -> masked identifier, "set", or null (missing). null for brokers without credentials. */
  credentials: Record<string, string | null> | null
  credentials_error: string | null
  needs_daily_login: boolean
  logged_in_today: boolean | null
  /** IST day (YYYY-MM-DD) of the last broker login; null if never or no daily login. */
  last_login_date: string | null
  created_at: string
  connection: Connection | null
}

export interface ApiTokenInfo {
  id: number
  name: string
  prefix: string
  created_at: string
  last_used_at: string | null
}

export interface Funds {
  cash: number | null
  limits?: Record<string, number | null>
  [key: string]: unknown
}

export interface HistoryOrder extends Order {
  account_id: number
  broker: string
  /** Label of the strategy instance that placed it; null when placed by hand. */
  strategy: string | null
}

export interface OrderEvent {
  [key: string]: unknown
}

export interface TradePosition {
  id: number
  account_id: number
  broker: string
  symbol: string
  direction: 'LONG' | 'SHORT'
  status: 'OPEN' | 'CLOSED'
  quantity: number
  entry_quantity: number
  avg_entry_price: number
  exit_quantity: number
  avg_exit_price: number | null
  realized_pnl: number
  opened_at: string
  closed_at: string | null
  /** Label of the strategy instance whose order opened it; null when opened by hand. */
  strategy: string | null
  last_price?: number | null
  unrealized_pnl?: number | null
}

export interface OpenTrades {
  positions: TradePosition[]
  totals: { count: number; unrealized_pnl: number | null; unpriced: number; realized_pnl: number }
}

export interface ClosedTrades {
  positions: TradePosition[]
  totals: { count: number; realized_pnl: number; wins: number; losses: number; win_rate: number | null }
}

export type Mode = 'signal' | 'live'
export type InstanceStatus = 'stopped' | 'running' | 'error' | 'archived' | 'removed' | (string & {})

export interface Deployment {
  key: string
  strategy: string
  description: string
  mode: Mode
  default_symbol: string | null
  default_timeframe: string
  timeframes: string[]
}

export type SizeMode = 'fixed' | 'capital'

export interface Instance {
  id: number
  account_id: number
  deployment_key: string
  strategy: string
  description: string
  label: string
  symbol: string
  timeframe: string
  timeframes: string[]
  params: Record<string, unknown>
  mode: Mode
  status: InstanceStatus
  quantity: number
  max_order_qty: number
  max_position: number
  max_orders_per_day: number
  /** Position sizing chosen in the app; the code's max_order_qty and max_position cap both. */
  size_mode: SizeMode
  /** Units per trade in fixed mode; null = the strategy's default `quantity`. */
  fixed_quantity: number | null
  /** Rupees per trade in capital mode. */
  capital_per_trade: number | null
  /** False when the strategy can only be sized by fixed quantity. */
  capital_sizing: boolean
  /** Units the next entry would trade at the last price; null while capital sizing has no price. */
  sized_quantity: number | null
  last_error: string | null
  position: number | null
  last_price: number | null
  orders_today: number | null
  pending_order_id: string | null
  dropped_ticks: number | null
}

export interface StrategiesList {
  live_trading_enabled: boolean
  deployments: Deployment[]
  strategies: Instance[]
}

/** A broker-native NSE search result. `symbol` is ready to send back to that broker. */
export interface InstrumentSuggestion {
  symbol: string
  ticker: string
  name: string
  kind: 'stock' | 'index'
}

export type RuleKind = 'entry_long' | 'entry_short' | 'exit' | 'risk' | 'filter'

/** A strategy's trigger conditions in plain words, with its params filled in. */
export interface StrategyRule {
  kind: RuleKind
  title: string
  conditions: string[]
}

export interface StrategyParam {
  name: string
  title: string
  description: string | null
  value: unknown
  default: unknown
}

/** A strategy defined in code, for the strategy list and its page (GET /api/strategies/catalog). */
export interface CatalogStrategy {
  key: string
  label: string
  strategy: string
  description: string
  tags: string[]
  rules: StrategyRule[]
  params: StrategyParam[]
  mode: Mode
  default_symbol: string | null
  default_timeframe: string
  timeframes: string[]
  quantity: number
  max_order_qty: number
  max_position: number
  max_orders_per_day: number
  backtest_initial_capital: number | null
  /** Shown above its tester results when the backtest differs from live trading. */
  backtest_note: string | null
  /** False when it can only be sized by fixed quantity (e.g. it trades option lots). */
  capital_sizing: boolean
  backtest_fixed_quantity: number | null
  backtest_commission_per_unit: number
}

export interface TesterStats {
  trades: number
  wins: number
  losses: number
  win_rate: number | null
  net_pnl: number
  /** Net P&L as % of the starting capital. */
  net_pnl_pct: number
  gross_profit: number
  gross_loss: number
  profit_factor: number | null
  avg_trade: number | null
  avg_win: number | null
  avg_loss: number | null
  ratio_avg_win_loss: number | null
  best: number | null
  worst: number | null
  max_drawdown: number
  max_drawdown_pct: number
  max_run_up: number
  max_run_up_pct: number
  avg_hold_minutes: number | null
  max_consecutive_losses: number
  trading_days: number
}

export interface BacktestTrade {
  number: number
  direction: 'LONG' | 'SHORT'
  quantity: number
  entry_at: string
  entry_price: number
  exit_at: string
  exit_price: number
  /** Entry price × quantity. */
  notional: number
  pnl: number
  return_pct: number | null
  /** Most it was in profit / in loss while open (positive amounts). */
  run_up: number
  drawdown: number
  commission: number
  cum_pnl: number
  entry_reason: string | null
  exit_reason: string | null
}

/** GET /api/strategies/catalog/{key}/performance: the strategy tester on one timeframe and range. */
export interface Performance {
  deployment_key: string
  symbol: string
  timeframe: string
  capital: number
  /** Order size, % of equity per entry; ignored when fixed_quantity is set. */
  size_pct: number
  fixed_quantity: number | null
  commission_per_unit: number
  start: string
  end: string
  data_from: string
  data_to: string
  candles: number
  blocked_signals: number
  assumptions: string[]
  generated_at: string
  summary: { all: TesterStats; long: TesterStats; short: TesterStats }
  trades: BacktestTrade[]
  /** Daily closes and what holding `capital` worth from the first one would have made. */
  buy_hold: { t: string; close: number; pnl: number }[]
}

export interface PerformanceMatrix {
  symbol: string
  timeframes: Record<string, TesterStats>
}

export interface Signal {
  id: number
  instance_id: number
  at: string
  symbol: string
  side: Side
  quantity: number
  price: number | null
  reason: string | null
  mode: Mode
  outcome: string
  message: string | null
  order_id: string | null
}

export interface Candle {
  time: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

// WebSocket pushes on an account's /api/accounts/{id}/ws/orders and /ws/tickers.
export type OrdersMessage =
  | { type: 'welcome'; account_id: number; broker: string }
  | { type: 'order_update'; account_id: number; order: Order }
  | { type: 'strategy_signal'; account_id: number; signal: Signal }
  | { type: 'strategy_status'; account_id: number; instance_id: number; status: InstanceStatus; error: string | null }
  | { type: 'ack' | 'error' | 'pong'; action?: string; request_id?: string; [key: string]: unknown }

export type TickerMessage =
  | { type: 'welcome'; account_id: number; broker: string }
  | { type: 'tick'; account_id: number; symbol: string; ltp: number }
  | { type: 'ack' | 'error' | 'pong'; action?: string; request_id?: string; [key: string]: unknown }
