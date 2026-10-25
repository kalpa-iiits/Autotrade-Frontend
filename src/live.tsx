import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { ReconnectingSocket, type SocketState } from './api/socket'
import type { OrdersMessage } from './api/types'
import { useAuth } from './auth'

// The app's single /api/ws/orders connection: order_update, strategy_signal, strategy_status.
const LiveContext = createContext<ReconnectingSocket<OrdersMessage> | null>(null)

export function LiveProvider({ children }: { children: ReactNode }) {
  const { signedOut } = useAuth()
  const [socket] = useState(
    () => new ReconnectingSocket<OrdersMessage>('/api/ws/orders', { onUnauthorized: () => signedOut() }),
  )

  useEffect(() => {
    socket.start()
    return () => socket.stop()
  }, [socket])

  return <LiveContext.Provider value={socket}>{children}</LiveContext.Provider>
}

function useSocket() {
  const socket = useContext(LiveContext)
  if (!socket) throw new Error('useLive outside LiveProvider')
  return socket
}

/** Run `handler` for each message on the orders socket. */
export function useLive(handler: (msg: OrdersMessage) => void) {
  const socket = useSocket()
  useEffect(() => socket.subscribe(handler), [socket, handler])
}

export function useLiveState(): SocketState {
  const socket = useSocket()
  const [state, setState] = useState(socket.state)
  useEffect(() => socket.onState(setState), [socket])
  return state
}
