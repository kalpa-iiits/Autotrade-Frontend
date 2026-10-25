import { api } from './client'

export type SocketState = 'connecting' | 'open' | 'closed'

const MAX_BACKOFF_MS = 30_000
const PING_MS = 25_000

/**
 * A WebSocket to the backend that reconnects with exponential backoff.
 * Close code 1008 (not signed in) stops reconnecting and calls `onUnauthorized`.
 */
export class ReconnectingSocket<M extends { type: string }> {
  state: SocketState = 'closed'

  private path: string
  private onOpen: (socket: ReconnectingSocket<M>) => void
  private onUnauthorized: () => void
  private ws: WebSocket | null = null
  private listeners = new Set<(msg: M) => void>()
  private stateListeners = new Set<(state: SocketState) => void>()
  private attempt = 0
  private stopped = true
  private retryTimer: number | undefined
  private pingTimer: number | undefined

  constructor(
    path: string,
    options: { onOpen?: (socket: ReconnectingSocket<M>) => void; onUnauthorized: () => void },
  ) {
    this.path = path
    this.onOpen = options.onOpen ?? (() => {})
    this.onUnauthorized = options.onUnauthorized
  }

  start() {
    if (!this.stopped) return
    this.stopped = false
    this.connect()
  }

  stop() {
    this.stopped = true
    window.clearTimeout(this.retryTimer)
    window.clearInterval(this.pingTimer)
    this.ws?.close(1000)
    this.ws = null
    this.setState('closed')
  }

  /** Sends if connected; returns false otherwise (callers resend from onOpen). */
  send(message: Record<string, unknown>): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false
    this.ws.send(JSON.stringify(message))
    return true
  }

  subscribe(listener: (msg: M) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  onState(listener: (state: SocketState) => void): () => void {
    this.stateListeners.add(listener)
    return () => this.stateListeners.delete(listener)
  }

  private setState(state: SocketState) {
    this.state = state
    this.stateListeners.forEach((l) => l(state))
  }

  private connect() {
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${scheme}://${location.host}${this.path}`)
    this.ws = ws
    this.setState('connecting')
    let opened = false

    ws.onopen = () => {
      opened = true
      this.attempt = 0
      this.setState('open')
      this.pingTimer = window.setInterval(() => this.send({ action: 'ping' }), PING_MS)
      this.onOpen(this)
    }
    ws.onmessage = (event) => {
      let msg: M
      try {
        msg = JSON.parse(event.data as string) as M
      } catch {
        return
      }
      this.listeners.forEach((l) => l(msg))
    }
    ws.onclose = (event) => {
      window.clearInterval(this.pingTimer)
      if (this.ws !== ws) return // replaced or stopped
      this.ws = null
      this.setState('closed')
      if (this.stopped) return
      if (event.code === 1008) {
        this.stopped = true
        this.onUnauthorized()
        return
      }
      // A rejected handshake (e.g. expired session) shows up as 1006, not 1008. Asking the
      // REST API who we are turns a lost session into a 401, which sends us to the login page.
      if (!opened) void api.GET('/api/auth/me')
      const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.attempt) * (0.75 + Math.random() / 2)
      this.attempt += 1
      this.retryTimer = window.setTimeout(() => {
        if (!this.stopped) this.connect()
      }, delay)
    }
  }
}
