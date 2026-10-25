import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BrowserRouter, NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { AccountsProvider, brokerTitle, needsLogin, useAccounts } from './accounts'
import { api, errorMessage, unwrap } from './api/client'
import type { Account, OrdersMessage } from './api/types'
import { useAuth } from './auth'
import { AuthProvider } from './auth'
import { Icon, type IconName } from './components/icons'
import { fmtMoney, fmtNum, istDay, shortSymbol } from './components/ui'
import { LiveProvider, useLive } from './live'
import { isIstWeekday } from './market'
import Accounts from './pages/Accounts'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import Market, { loadWatchlist } from './pages/Market'
import Orders from './pages/Orders'
import Settings from './pages/Settings'
import Strategies from './pages/Strategies'
import StrategyDetail from './pages/StrategyDetail'
import Trades from './pages/Trades'
import { loadPrefs, notify } from './reminders'
import { SummaryProvider, accountValue, useSummary } from './summary'

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
    <AccountsProvider>
      <LiveProvider>
        <SummaryProvider>
          <Shell />
        </SummaryProvider>
      </LiveProvider>
    </AccountsProvider>
  )
}

function Shell() {
  return (
    <div className="shell">
      <Sidebar />
      <main className="content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/market" element={<Market />} />
          <Route path="/trades" element={<Trades />} />
          <Route path="/strategies" element={<Strategies />} />
          <Route path="/strategies/:key" element={<StrategyDetail />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Toasts />
      <Palette />
      <LoginReminder />
    </div>
  )
}

// ---------- sidebar ----------

function Sidebar() {
  const { user, logout } = useAuth()
  const { accounts } = useAccounts()
  const { orders, strategies, reload } = useSummary()
  const [stopping, setStopping] = useState(false)
  const running = strategies.data?.strategies.filter((s) => s.status === 'running').length ?? 0
  const loginNeeded = (accounts ?? []).some(needsLogin)

  async function stopAll() {
    if (!window.confirm('Stop ALL your running strategies, on every account? Orders already at the broker are not cancelled.')) return
    setStopping(true)
    try {
      const r = await unwrap<{ stopped: unknown }>(api.POST('/api/strategies/stop-all'))
      const n = Array.isArray(r.stopped) ? r.stopped.length : Number(r.stopped) || 0
      window.alert(n ? `Stopped ${n} strateg${n === 1 ? 'y' : 'ies'}.` : 'No strategy was running.')
      reload()
    } catch (e) {
      window.alert(errorMessage(e))
    } finally {
      setStopping(false)
    }
  }

  const initials = (user?.username ?? '?').slice(0, 2).toUpperCase()
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">
          <Icon name="logo" size={17} />
        </span>
        AutoTrade
      </div>
      <AccountSwitcher />

      <div className="nav-section caps">Overview</div>
      <NavItem to="/" icon="dashboard" label="Dashboard" />
      <div className="nav-section caps">Trade</div>
      <NavItem to="/market" icon="market" label="Market" />
      <NavItem to="/orders" icon="orders" label="Orders" meta={orders.data?.length ? <span className="meta">{orders.data.length}</span> : null} />
      <NavItem to="/trades" icon="trades" label="Trades" />
      <div className="nav-section caps">Automate</div>
      <NavItem
        to="/strategies"
        icon="strategies"
        label="Strategies"
        meta={
          running ? (
            <span className="meta running">
              <span className="dot good" /> {running} running
            </span>
          ) : null
        }
      />
      <div className="nav-section caps">Setup</div>
      <NavItem to="/accounts" icon="accounts" label="Accounts" meta={loginNeeded ? <span className="meta"><span className="dot warn" title="A broker login is needed today" /></span> : null} />
      <NavItem to="/settings" icon="settings" label="Settings" />

      <div className="sidebar-foot">
        <button className="danger block" onClick={() => void stopAll()} disabled={stopping} title="Every running strategy, on all your accounts">
          <Icon name="stop" size={16} /> {stopping ? 'Stopping…' : 'Stop all strategies'}
        </button>
        <div className="user-row">
          <span className="avatar">{initials}</span>
          <span className="grow ellipsis">{user?.username}</span>
          <button className="ghost sm" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </div>
    </aside>
  )
}

function NavItem({ to, icon, label, meta }: { to: string; icon: IconName; label: string; meta?: React.ReactNode }) {
  return (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
      <Icon name={icon} size={17} />
      {label}
      {meta}
    </NavLink>
  )
}

function ModeTag({ account }: { account: Account }) {
  return account.broker === 'paper' ? <span className="tag paper">PAPER</span> : <span className="tag live">LIVE</span>
}

/** Which broker account the trading pages work on; always shows its mode. */
function AccountSwitcher() {
  const { accounts, current, select } = useAccounts()
  const { funds, positions, trades } = useSummary()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  if (!accounts?.length || !current) {
    return (
      <button className="block" onClick={() => navigate('/accounts')}>
        <Icon name="plus" size={15} /> Add a broker account
      </button>
    )
  }
  const value = accountValue(current.broker, funds.data, positions.data, trades.data)
  return (
    <div className="account-switch" ref={ref}>
      <button onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open}>
        <span className="grow">
          <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
            <b className="ellipsis" style={{ fontWeight: 600, fontSize: 13 }}>{current.label}</b>
            <ModeTag account={current} />
          </span>
          <span className="mono small muted">{value === null ? (needsLogin(current) ? 'login needed' : '—') : fmtMoney(value)}</span>
        </span>
        <Icon name="chevrons" size={14} className="muted" />
      </button>
      {open && (
        <div className="menu" role="listbox">
          {accounts.map((a) => (
            <button
              key={a.id}
              role="option"
              aria-selected={a.id === current.id}
              className={`menu-item ${a.id === current.id ? 'active' : ''}`}
              onClick={() => {
                select(a.id)
                setOpen(false)
              }}
            >
              <span className="grow ellipsis">{a.label}</span>
              {needsLogin(a) && <span className="dot warn" title="Login needed today" />}
              <ModeTag account={a} />
            </button>
          ))}
          <button className="menu-item muted" onClick={() => { setOpen(false); navigate('/accounts') }}>
            <Icon name="plus" size={14} /> Manage accounts
          </button>
        </div>
      )}
    </div>
  )
}

// ---------- toasts (and notifications) for pushes on the orders socket ----------

interface Toast {
  id: number
  text: string
  tone: string
}

let toastId = 0

function Toasts() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const onMessage = useCallback((msg: OrdersMessage) => {
    const prefs = loadPrefs()
    let toast: Omit<Toast, 'id'> | null = null
    if (msg.type === 'order_update') {
      const o = msg.order
      const price = o.filled_price ?? o.limit_price
      const text = `${o.side} ${o.quantity} ${shortSymbol(o.symbol)} — ${o.status.toLowerCase()}${price ? ` @ ${fmtNum(price)}` : ''}${o.reason ? ` (${o.reason})` : ''}`
      toast = { text, tone: o.status === 'REJECTED' ? 'bad' : o.status === 'FILLED' ? 'good' : 'info' }
      if (o.status === 'FILLED' && prefs.fills) notify('Order filled', text, `fill-${o.id}`)
      if (o.status === 'REJECTED' && prefs.errors) notify('Order rejected', text, `rej-${o.id}`)
    } else if (msg.type === 'strategy_signal') {
      const s = msg.signal
      toast = { text: `Signal: ${s.side} ${s.quantity} ${shortSymbol(s.symbol)} — ${s.outcome.replace('_', ' ')}`, tone: 'info' }
    } else if (msg.type === 'strategy_status') {
      toast = {
        text: `Strategy #${msg.instance_id} ${msg.status}${msg.error ? `: ${msg.error}` : ''}`,
        tone: msg.status === 'error' ? 'bad' : 'info',
      }
      if (msg.status === 'error' && prefs.errors) notify('Strategy stopped', toast.text, `st-${msg.instance_id}`)
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

/** 08:45 IST on weekdays: a notification if a broker account still needs today's login. */
function LoginReminder() {
  const { accounts } = useAccounts()
  useEffect(() => {
    const check = () => {
      const pending = (accounts ?? []).filter(needsLogin)
      if (!pending.length || !loadPrefs().login) return
      const now = new Date()
      const t = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })
      if (t < '08:45' || t >= '15:30' || !isIstWeekday(now)) return
      const key = `autotrade.reminded.${istDay(now)}`
      if (localStorage.getItem(key)) return
      localStorage.setItem(key, '1')
      notify('Broker login needed', `Log in to ${pending.map((a) => `${brokerTitle(a.broker)} (${a.label})`).join(', ')} before 09:15.`, 'login')
    }
    check()
    const timer = window.setInterval(check, 60_000)
    return () => window.clearInterval(timer)
  }, [accounts])
  return null
}

// ---------- ⌘K ----------

interface Item {
  group: string
  label: string
  hint?: string
  go: () => void
}

function Palette() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const navigate = useNavigate()
  const { current } = useAccounts()
  const { strategies } = useSummary()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setQ('')
        setActive(0)
        setOpen((o) => !o)
      } else if (e.key === 'Escape') setOpen(false)
    }
    const onOpen = () => {
      setQ('')
      setActive(0)
      setOpen(true)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('autotrade-palette', onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('autotrade-palette', onOpen)
    }
  }, [])

  const items = useMemo<Item[]>(() => {
    if (!open) return []
    const go = (to: string) => () => {
      navigate(to)
      setOpen(false)
    }
    const pages: Item[] = [
      ['/', 'Dashboard'],
      ['/market', 'Market'],
      ['/orders', 'Orders'],
      ['/trades', 'Trades'],
      ['/strategies', 'Strategies'],
      ['/accounts', 'Accounts'],
      ['/settings', 'Settings'],
    ].map(([to, label]) => ({ group: 'Pages', label, go: go(to) }))
    const strats: Item[] = (strategies.data?.strategies ?? []).map((s) => ({
      group: 'Strategies',
      label: s.label,
      hint: `${shortSymbol(s.symbol)} · ${s.timeframe} · ${s.status}`,
      go: go(`/strategies/${s.deployment_key}`),
    }))
    const symbols: Item[] = (current ? loadWatchlist(current) : []).map((s) => ({
      group: 'Symbols',
      label: shortSymbol(s),
      hint: s,
      go: go(`/market?symbol=${encodeURIComponent(s)}`),
    }))
    const needle = q.trim().toLowerCase()
    const all = [...pages, ...strats, ...symbols].filter((i) => !needle || `${i.label} ${i.hint ?? ''}`.toLowerCase().includes(needle))
    if (needle.includes(':')) {
      const sym = q.trim().toUpperCase()
      all.push({ group: 'Symbols', label: `Open ${sym}`, hint: 'chart and quote', go: go(`/market?symbol=${encodeURIComponent(sym)}`) })
    }
    return all
  }, [open, q, strategies.data, current, navigate])

  if (!open) return null
  let lastGroup = ''
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="modal palette" role="dialog" aria-modal="true" aria-label="Search">
        <div className="input-wrap">
          <Icon name="search" size={16} />
          <input
            autoFocus
            placeholder="Search pages, strategies, symbols… (type NSE:XYZ to open any symbol)"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setActive(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((a) => Math.min(items.length - 1, a + 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((a) => Math.max(0, a - 1))
              } else if (e.key === 'Enter') items[active]?.go()
            }}
          />
        </div>
        <div className="results">
          {items.length === 0 && <div className="empty">Nothing matches. Type a symbol like NSE:TCS-EQ to open it.</div>}
          {items.map((item, i) => {
            const head = item.group !== lastGroup
            lastGroup = item.group
            return (
              <div key={`${item.group}-${item.label}-${i}`}>
                {head && <div className="group caps">{item.group}</div>}
                <button className={`menu-item ${i === active ? 'active' : ''}`} onMouseEnter={() => setActive(i)} onClick={item.go}>
                  <span className="grow">{item.label}</span>
                  {item.hint && <span className="small muted mono">{item.hint}</span>}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
