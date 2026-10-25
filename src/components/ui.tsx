import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { errorMessage } from '../api/client'
import { Icon } from './icons'

/** Load data on mount (and on `reload()`), keeping the last good value while reloading. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const loadRef = useRef(load)
  loadRef.current = load
  const seq = useRef(0)

  const reload = useCallback(async () => {
    const mine = ++seq.current
    setLoading(true)
    try {
      const value = await loadRef.current()
      if (mine !== seq.current) return
      setData(value)
      setError(null)
    } catch (e) {
      if (mine === seq.current) setError(errorMessage(e))
    } finally {
      if (mine === seq.current) setLoading(false)
    }
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => void reload(), deps)

  return { data, error, loading, reload, setData }
}

/** Re-render every `ms` (clocks, "x minutes left"). */
export function useNow(ms = 30_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), ms)
    return () => window.clearInterval(t)
  }, [ms])
  return now
}

/** `value`, once it has stopped changing for `ms`. */
export function useDebounced<T>(value: T, ms = 400): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(value), ms)
    return () => window.clearTimeout(t)
  }, [value, ms])
  return settled
}

// ---------- formatting (Indian grouping throughout) ----------

const money = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const whole = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

export function fmtNum(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : money.format(n)
}

/** ₹10,22,256.00; `sign` adds + for gains (and always − for losses). */
export function fmtMoney(n: number | null | undefined, opts: { sign?: boolean; decimals?: boolean } = {}): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  const f = opts.decimals === false ? whole : money
  const s = `₹${f.format(Math.abs(n))}`
  if (n < 0) return `−${s}`
  return opts.sign && n > 0 ? `+${s}` : s
}

/** ₹38.4L, ₹1.2Cr, ₹2.4k. */
export function fmtCompact(n: number | null | undefined, opts: { sign?: boolean } = {}): string {
  if (n === null || n === undefined) return '—'
  const a = Math.abs(n)
  const body = a >= 1e7 ? `${(a / 1e7).toFixed(2)}Cr` : a >= 1e5 ? `${(a / 1e5).toFixed(1)}L` : a >= 1e3 ? `${(a / 1e3).toFixed(1)}k` : a.toFixed(0)
  const sign = n < 0 ? '−' : opts.sign && n > 0 ? '+' : ''
  return `${sign}₹${body}`
}

export function fmtPct(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || !isFinite(n)) return '—'
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(digits)}%`
}

export function fmtQty(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : whole.format(n)
}

const IST = 'Asia/Kolkata'

/** 11:42 (IST). */
export function fmtClock(iso: string | Date | null | undefined): string {
  if (!iso) return '—'
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('en-GB', { timeZone: IST, hour: '2-digit', minute: '2-digit' })
}

/** 23 Oct 11:42 (IST). */
export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('en-GB', { timeZone: IST, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** 12 Oct 2026. */
export function fmtDate(iso: string | Date | null | undefined): string {
  if (!iso) return '—'
  const d = typeof iso === 'string' ? new Date(iso.length === 10 ? `${iso}T00:00:00+05:30` : iso) : iso
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { timeZone: IST, day: 'numeric', month: 'short', year: 'numeric' })
}

/** "3 days ago", "just now". */
export function fmtAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'never'
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  const d = Math.floor(s / 86400)
  return d === 1 ? 'yesterday' : `${d} days ago`
}

/** Held for: "33m", "1h 45m", "2d 3h". */
export function fmtDuration(fromIso: string, toIso: string | null): string {
  const ms = (toIso ? new Date(toIso).getTime() : Date.now()) - new Date(fromIso).getTime()
  const m = Math.max(0, Math.round(ms / 60_000))
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

/** "NSE:SBIN-EQ" -> "SBIN-EQ". */
export function shortSymbol(symbol: string): string {
  return symbol.includes(':') ? symbol.slice(symbol.indexOf(':') + 1) : symbol
}

/** "NSE · Equity", "NFO · Futures" — a guess from the symbol's shape. */
export function symbolKind(symbol: string): string {
  const [ex, name = ''] = symbol.includes(':') ? symbol.split(':') : ['NSE', symbol]
  if (/FUT$/.test(name)) return `${ex === 'NSE' ? 'NFO' : ex} · Futures`
  if (/\d(CE|PE)$/.test(name)) return `${ex === 'NSE' ? 'NFO' : ex} · Options`
  if (/-INDEX$|^NIFTY|^BANKNIFTY|^SENSEX/.test(name)) return `${ex} · Index`
  return `${ex} · Equity`
}

/** Today's IST day, YYYY-MM-DD. */
export function istDay(d: Date = new Date()): string {
  return d.toLocaleDateString('en-CA', { timeZone: IST })
}

// ---------- components ----------

export function Pnl({ value, compact, className = '' }: { value: number | null | undefined; compact?: boolean; className?: string }) {
  if (value === null || value === undefined) return <span className={`muted ${className}`}>—</span>
  const cls = value > 0 ? 'pos' : value < 0 ? 'neg' : 'muted'
  return <span className={`mono ${cls} ${className}`}>{compact ? fmtCompact(value, { sign: true }) : fmtMoney(value, { sign: true })}</span>
}

export function ErrorBox({ error }: { error: string | null | undefined }) {
  return error ? (
    <div className="alert bad" role="alert">
      <Icon name="warn" size={15} />
      <div className="grow">{error}</div>
    </div>
  ) : null
}

export function Note({ tone = 'good', children, onClose }: { tone?: 'good' | 'warn' | 'bad'; children: ReactNode; onClose?: () => void }) {
  return (
    <div className={`alert ${tone}`} role="status">
      <Icon name={tone === 'good' ? 'check' : 'warn'} size={15} />
      <div className="grow">{children}</div>
      {onClose && (
        <button className="link" onClick={onClose}>
          Dismiss
        </button>
      )}
    </div>
  )
}

export function Card({
  title,
  count,
  actions,
  children,
  flush,
  className = '',
}: {
  title?: ReactNode
  count?: ReactNode
  actions?: ReactNode
  children: ReactNode
  flush?: boolean
  className?: string
}) {
  return (
    <section className={`card ${flush ? 'flush' : ''} ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          <h2>
            {title}
            {count !== undefined && <span className="count">· {count}</span>}
          </h2>
          {actions && <div className="row">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

export function Pill({ children, tone, dot }: { children: ReactNode; tone?: 'good' | 'bad' | 'info' | 'warn' | 'muted'; dot?: 'good' | 'bad' | 'warn' | 'info' | 'idle' }) {
  return (
    <span className={`pill ${tone ?? ''}`}>
      {dot && <span className={`dot ${dot === 'idle' ? '' : dot}`} />}
      {children}
    </span>
  )
}

/** Order / strategy status as a pill with a dot. */
export function StatusPill({ status }: { status: string }) {
  const tone = statusTone(status)
  const label = status.charAt(0) + status.slice(1).toLowerCase()
  return (
    <Pill tone={tone === 'good' ? 'good' : tone === 'bad' ? 'bad' : tone === 'info' ? 'info' : 'muted'} dot={tone === 'good' ? 'good' : tone === 'bad' ? 'bad' : tone === 'info' ? 'info' : 'idle'}>
      {label}
    </Pill>
  )
}

export function statusTone(status: string): 'good' | 'bad' | 'info' | '' {
  switch (status) {
    case 'FILLED':
    case 'running':
    case 'placed':
    case 'recorded':
      return 'good'
    case 'OPEN':
    case 'signal_only':
      return 'info'
    case 'REJECTED':
    case 'error':
    case 'blocked':
    case 'rejected':
      return 'bad'
    default:
      return ''
  }
}

export function Switch({ on, onChange, disabled, label }: { on: boolean; onChange: (on: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`switch ${on ? 'on' : ''}`}
      disabled={disabled}
      onClick={() => onChange(!on)}
    />
  )
}

export function Seg<T extends string>({
  value,
  options,
  onChange,
  mono,
  fill,
  label,
}: {
  value: T
  options: { value: T; label: ReactNode; count?: number }[]
  onChange: (v: T) => void
  mono?: boolean
  /** Stretch to the full width, equal columns. */
  fill?: boolean
  label: string
}) {
  return (
    <div className={`seg ${mono ? 'mono' : ''} ${fill ? 'fill' : ''}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className={o.value === value ? 'on' : ''} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
          {o.count !== undefined && <span className="n">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div>{children}</div>
      {action}
    </div>
  )
}

/** Shown by pages that work on a broker account when the user has none yet. */
export function NeedAccount() {
  return (
    <Card>
      <Empty
        action={
          <Link to="/accounts">
            <button className="primary">Add a broker account</button>
          </Link>
        }
      >
        <p>Add a broker account first: a paper account to try things out, or your own Fyers / Zerodha app.</p>
      </Empty>
    </Card>
  )
}

export function Modal({ title, onClose, children, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2 style={{ fontSize: 15 }}>{title}</h2>
          <button className="ghost icon" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}
