import { useCallback, useState } from 'react'
import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import type { OrdersMessage } from './api/types'
import { AuthProvider, useAuth } from './auth'
import { fmtNum } from './components/ui'
import { LiveProvider, useLive, useLiveState } from './live'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import Market from './pages/Market'
import Orders from './pages/Orders'
import Settings from './pages/Settings'
import Strategies from './pages/Strategies'
import Trades from './pages/Trades'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Gate />
      </BrowserRouter>
    </AuthProvider>
  )
}

function Gate() {
  const { user } = useAuth()
  if (user === undefined) return <div className="center muted">Loading…</div>
  if (user === null) return <Login />
  return (
    <LiveProvider>
      <Shell />
    </LiveProvider>
  )
}

const NAV = [
  ['/', 'Dashboard'],
  ['/orders', 'Orders'],
  ['/market', 'Market'],
  ['/trades', 'Trades'],
  ['/strategies', 'Strategies'],
  ['/settings', 'Settings'],
] as const

function Shell() {
  const { user, logout } = useAuth()
  const live = useLiveState()
  return (
    <div className="shell">
      <nav className="nav">
        <span className="brand">AutoTrade</span>
        {NAV.map(([to, label]) => (
          <NavLink key={to} to={to} end={to === '/'}>
            {label}
          </NavLink>
        ))}
        <span className="spacer" />
        <span className={`live ${live}`} title={`Order updates socket: ${live}`}>
          ● {live === 'open' ? 'live' : live}
        </span>
        <span className="muted">{user?.username}</span>
        <button className="link" onClick={() => void logout()}>
          Sign out
        </button>
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/market" element={<Market />} />
          <Route path="/trades" element={<Trades />} />
          <Route path="/strategies" element={<Strategies />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Toasts />
    </div>
  )
}

interface Toast {
  id: number
  text: string
  tone: string
}

let toastId = 0

/** Short notices for pushes on the orders socket. */
function Toasts() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const onMessage = useCallback((msg: OrdersMessage) => {
    let toast: Omit<Toast, 'id'> | null = null
    if (msg.type === 'order_update') {
      const o = msg.order
      const price = o.filled_price ?? o.limit_price
      toast = {
        text: `${o.side} ${o.quantity} ${o.symbol} — ${o.status}${price ? ` @ ${fmtNum(price)}` : ''}${o.reason ? ` (${o.reason})` : ''}`,
        tone: o.status === 'REJECTED' ? 'bad' : o.status === 'FILLED' ? 'good' : 'info',
      }
    } else if (msg.type === 'strategy_signal') {
      const s = msg.signal
      toast = { text: `Signal #${s.instance_id}: ${s.side} ${s.quantity} ${s.symbol} — ${s.outcome}`, tone: 'info' }
    } else if (msg.type === 'strategy_status') {
      toast = {
        text: `Strategy #${msg.instance_id} ${msg.status}${msg.error ? `: ${msg.error}` : ''}`,
        tone: msg.status === 'error' ? 'bad' : 'info',
      }
    }
    if (!toast) return
    const id = ++toastId
    const next = { ...toast, id }
    setToasts((t) => [...t.slice(-4), next])
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000)
  }, [])
  useLive(onMessage)

  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`}>
          {t.text}
        </div>
      ))}
    </div>
  )
}
