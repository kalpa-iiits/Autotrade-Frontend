import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { errorMessage } from '../api/client'

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

const money = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function fmtNum(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : money.format(n)
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'medium' })
}

export function Pnl({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return <span className="muted">—</span>
  const cls = value > 0 ? 'pos' : value < 0 ? 'neg' : ''
  return <span className={cls}>{value > 0 ? '+' : ''}{money.format(value)}</span>
}

export function ErrorBox({ error }: { error: string | null | undefined }) {
  return error ? <div className="error" role="alert">{error}</div> : null
}

export function Card({ title, actions, children }: { title: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      <header className="card-head">
        <h2>{title}</h2>
        {actions && <div className="card-actions">{actions}</div>}
      </header>
      {children}
    </section>
  )
}

export function Badge({ children, tone }: { children: ReactNode; tone?: string }) {
  return <span className={`badge ${tone ?? ''}`}>{children}</span>
}

export function statusTone(status: string): string {
  switch (status) {
    case 'FILLED':
    case 'running':
    case 'filled':
    case 'placed':
    case 'recorded':
      return 'good'
    case 'OPEN':
    case 'stopped':
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

export function Empty({ children }: { children: ReactNode }) {
  return <p className="muted empty">{children}</p>
}
