// Response types the OpenAPI schema leaves untyped (the backend returns plain dicts there).
// Typed endpoints (Me, Order, Position, request bodies) come from schema.d.ts via `Schemas`.
import type { Schemas } from './client'

export type Me = Schemas['Me']
export type Order = Schemas['Order']
export type OrderCreate = Schemas['OrderCreate']
export type Position = Schemas['Position']
export type Side = Schemas['Side']
export type OrderType = Schemas['OrderType']

export type Broker = 'fyers' | 'zerodha'

export interface BrokerStatus {
  broker: string
  connected: boolean
  reason: string | null
  logged_in_today: Record<Broker, boolean>
}

export interface Funds {
  cash: number | null
  limits?: Record<string, number | null>
  [key: string]: unknown
}

export interface HistoryOrder extends Order {
  broker: string
}

export interface OrderEvent {
  [key: string]: unknown
}

export interface TradePosition {
  id: number
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
  default_symbol: string
  default_timeframe: string
  timeframes: string[]
}

export interface Instance {
  id: number
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
  last_error: string | null
  position: number | null
  last_price: number | null
  orders_today: number | null
  pending_order_id: string | null
}

export interface StrategiesList {
  live_trading_enabled: boolean
  deployments: Deployment[]
  strategies: Instance[]
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

// WebSocket pushes on /api/ws/orders and /api/ws/tickers.
export type OrdersMessage =
  | { type: 'welcome'; broker: string }
  | { type: 'order_update'; order: Order }
  | { type: 'strategy_signal'; signal: Signal }
  | { type: 'strategy_status'; instance_id: number; status: InstanceStatus; error: string | null }
  | { type: 'ack' | 'error' | 'pong'; action?: string; request_id?: string; [key: string]: unknown }

export type TickerMessage =
  | { type: 'welcome'; broker: string }
  | { type: 'tick'; symbol: string; ltp: number }
  | { type: 'ack' | 'error' | 'pong'; action?: string; request_id?: string; [key: string]: unknown }
