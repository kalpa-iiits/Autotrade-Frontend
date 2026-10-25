import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { useAccounts } from './accounts'
import { ReconnectingSocket, type SocketState } from './api/socket'
import type { OrdersMessage } from './api/types'
import { useAuth } from './auth'

// The selected account's /api/accounts/{id}/ws/orders connection: order_update,
// strategy_signal, strategy_status. Switching accounts opens the new account's socket.
const LiveContext = createContext<ReconnectingSocket<OrdersMessage> | null>(null)

export function LiveProvider({ children }: { children: ReactNode }) {
  const { signedOut } = useAuth()
  const accountId = useAccounts().current?.id ?? null
  const socket = useMemo(
    () =>
      accountId === null
        ? null
        : new ReconnectingSocket<OrdersMessage>(`/api/accounts/${accountId}/ws/orders`, {
            onUnauthorized: () => signedOut(),
          }),
    [accountId, signedOut],
  )

  useEffect(() => {
    if (!socket) return
    socket.start()
    return () => socket.stop()
  }, [socket])

  return <LiveContext.Provider value={socket}>{children}</LiveContext.Provider>
}

/** Run `handler` for each message on the selected account's orders socket. */
export function useLive(handler: (msg: OrdersMessage) => void) {
  const socket = useContext(LiveContext)
  useEffect(() => (socket ? socket.subscribe(handler) : undefined), [socket, handler])
}

export function useLiveState(): SocketState {
  const socket = useContext(LiveContext)
  const subscribe = useCallback(
    (onChange: () => void) => (socket ? socket.onState(() => onChange()) : () => {}),
    [socket],
  )
  return useSyncExternalStore(subscribe, () => socket?.state ?? 'closed')
}
