import { useEffect, useRef, useState } from 'react'
import { api, unwrap } from './api/client'
import { ReconnectingSocket, type SocketState } from './api/socket'
import type { Candle, TickerMessage } from './api/types'
import { useAuth } from './auth'
import { istDay } from './components/ui'

export interface Quote {
  ltp: number
  /** The tick before, for up/down flashes. */
  prev?: number
  /** Recent ticks this session, oldest first (for sparklines). */
  history: number[]
  at: number
}

const HISTORY = 60

/**
 * Live prices for `symbols` over the account's /ws/tickers socket. Subscribes the whole list on
 * every (re)connect and follows changes to it.
 */
export function useQuotes(accountId: number, symbols: string[]) {
  const { signedOut } = useAuth()
  const [quotes, setQuotes] = useState<Record<string, Quote>>({})
  const [state, setState] = useState<SocketState>('closed')
  const [error, setError] = useState<string | null>(null)
  const wanted = useRef(symbols)
  const key = symbols.join(',')

  const [socket] = useState(
    () =>
      new ReconnectingSocket<TickerMessage>(`/api/accounts/${accountId}/ws/tickers`, {
        onOpen: (s) => wanted.current.length && s.send({ action: 'subscribe', symbols: wanted.current }),
        onUnauthorized: () => signedOut(),
      }),
  )

  useEffect(() => {
    const offState = socket.onState(setState)
    const offMsg = socket.subscribe((msg) => {
      if (msg.type === 'tick') {
        setQuotes((q) => {
          const old = q[msg.symbol]
          const history = [...(old?.history ?? []), msg.ltp].slice(-HISTORY)
          return { ...q, [msg.symbol]: { ltp: msg.ltp, prev: old?.ltp, history, at: Date.now() } }
        })
      } else if (msg.type === 'error') {
        setError(typeof msg.error === 'string' ? msg.error : JSON.stringify(msg.error))
      } else if (msg.type === 'ack') {
        setError(null)
      }
    })
    socket.start()
    return () => {
      offState()
      offMsg()
      socket.stop()
    }
  }, [socket])

  // Follow the symbol list: subscribe new ones, drop removed ones.
  useEffect(() => {
    const before = new Set(wanted.current)
    const now = new Set(symbols)
    wanted.current = symbols
    const added = symbols.filter((s) => !before.has(s))
    const removed = [...before].filter((s) => !now.has(s))
    if (added.length) socket.send({ action: 'subscribe', symbols: added })
    if (removed.length) socket.send({ action: 'unsubscribe', symbols: removed })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, socket])

  return { quotes, state, error }
}

export interface DayStats {
  open: number
  high: number
  low: number
  volume: number
  prevClose: number | null
  /** Recent daily closes, oldest first. */
  closes: number[]
}

/** Today's open/high/low/volume and the previous close, from daily candles. */
export async function loadDayStats(accountId: number, symbol: string): Promise<DayStats | null> {
  const end = new Date()
  const start = new Date(end.getTime() - 20 * 86_400_000)
  const candles = await unwrap<Candle[]>(
    api.GET('/api/accounts/{account_id}/market/candles', {
      params: { path: { account_id: accountId }, query: { symbol, resolution: 'D', start: istDay(start), end: istDay(end) } },
    }),
  )
  if (!candles.length) return null
  const last = candles[candles.length - 1]
  const isToday = istDay(new Date(last.time)) === istDay()
  const prev = isToday ? candles[candles.length - 2] : last
  return {
    open: isToday ? last.open : last.close,
    high: isToday ? last.high : last.close,
    low: isToday ? last.low : last.close,
    volume: isToday ? last.volume : 0,
    prevClose: prev?.close ?? null,
    closes: candles.map((c) => c.close),
  }
}
