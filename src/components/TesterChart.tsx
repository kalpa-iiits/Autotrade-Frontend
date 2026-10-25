import { useEffect, useId, useMemo, useRef, useState, type MouseEvent } from 'react'
import type { BacktestTrade } from '../api/types'
import { fmtMoney, fmtTime } from './ui'

export interface TesterSeries {
  pnl: boolean
  buyHold: boolean
  excursions: boolean
  drawdowns: boolean
}

const AXIS_W = 96
const STRIP_H = 5
const X_LABELS_H = 22

/** Round numbers for the value axis: about `count` steps between lo and hi. */
function niceTicks(lo: number, hi: number, count = 5): number[] {
  const raw = (hi - lo) / count
  const mag = 10 ** Math.floor(Math.log10(raw || 1))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const out = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.abs(v) < 1e-9 ? 0 : v)
  return out
}

const shortDate = (t: number) => new Date(t).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: '2-digit' })

/**
 * Strategy tester chart, like TradingView's: cumulative P&L per trade (trades evenly spaced
 * along x), each trade's run-up (up, green) and drawdown (down, red) as bars, buy & hold for
 * comparison, the equity's drawdowns from its running peak shaded, and a win/loss strip below.
 */
export function TesterChart({
  trades,
  buyHold,
  start,
  end,
  show,
  height = 380,
}: {
  trades: BacktestTrade[]
  buyHold: { t: string; pnl: number }[]
  start: string
  end: string
  show: TesterSeries
  height?: number
}) {
  const id = useId().replace(/:/g, '')
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(900)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(320, Math.floor(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const plotW = width - AXIS_W
  const plotH = height - X_LABELS_H - STRIP_H - 6
  const n = trades.length

  const geo = useMemo(() => {
    const t0 = new Date(`${start}T09:15:00+05:30`).getTime()
    const t1 = Math.max(new Date(`${end}T15:30:00+05:30`).getTime(), n ? new Date(trades[n - 1].exit_at).getTime() : 0)
    // Trades are evenly spaced; time maps piecewise-linearly between their exits (for buy & hold).
    const slot = plotW / (n + 1)
    const xs = trades.map((_, i) => (i + 1) * slot)
    const anchors: [number, number][] = [[t0, 0], ...trades.map((tr, i) => [new Date(tr.exit_at).getTime(), xs[i]] as [number, number]), [t1, plotW]]
    const xAt = (t: number) => {
      if (t <= anchors[0][0]) return 0
      for (let i = 1; i < anchors.length; i++) {
        const [ta, xa] = anchors[i - 1]
        const [tb, xb] = anchors[i]
        if (t <= tb) return tb === ta ? xb : xa + ((t - ta) / (tb - ta)) * (xb - xa)
      }
      return plotW
    }
    const bh = buyHold.map((p) => ({ x: xAt(new Date(p.t).getTime()), v: p.pnl }))

    const vals = [0]
    if (show.pnl || show.drawdowns) vals.push(...trades.map((t) => t.cum_pnl))
    if (show.excursions) vals.push(...trades.map((t) => t.run_up), ...trades.map((t) => -t.drawdown))
    if (show.buyHold) vals.push(...bh.map((p) => p.v))
    let lo = Math.min(...vals)
    let hi = Math.max(...vals)
    if (hi === lo) {
      hi += 1
      lo -= 1
    }
    const pad = (hi - lo) * 0.06
    lo -= pad
    hi += pad
    const y = (v: number) => 6 + (1 - (v - lo) / (hi - lo)) * (plotH - 6)
    return { t0, t1, slot, xs, bh, y, ticks: niceTicks(lo, hi) }
  }, [trades, buyHold, start, end, show, plotW, plotH, n])

  const { xs, y, slot } = geo
  const y0 = y(0)
  const pts = [[0, 0] as [number, number], ...trades.map((t, i) => [xs[i], t.cum_pnl] as [number, number])]
  const line = pts.map(([x, v], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y(v).toFixed(1)}`).join('')
  const area = `${line}L${pts[pts.length - 1][0].toFixed(1)},${y0}L0,${y0}Z`
  let peak = 0
  const peaks = pts.map(([x, v]) => {
    peak = Math.max(peak, v)
    return [x, peak] as [number, number]
  })
  const ddArea = `${peaks.map(([x, v], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y(v).toFixed(1)}`).join('')}${[...pts].reverse().map(([x, v]) => `L${x.toFixed(1)},${y(v).toFixed(1)}`).join('')}Z`
  const bhLine = geo.bh.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${y(p.v).toFixed(1)}`).join('')
  const barW = Math.max(1, Math.min(9, slot * 0.6))
  const last = n ? trades[n - 1].cum_pnl : 0
  const xLabels = n ? [0, 0.25, 0.5, 0.75, 1].map((f) => Math.min(n - 1, Math.round(f * (n - 1)))).filter((v, i, a) => a.indexOf(v) === i) : []

  function onMove(e: MouseEvent<SVGSVGElement>) {
    if (!n) return
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    const i = Math.round(px / slot) - 1
    setHover(Math.max(0, Math.min(n - 1, i)))
  }

  const h = hover === null ? null : trades[hover]
  const tipX = h ? Math.min(Math.max(xs[hover!] + 12, 0), plotW - 214) : 0
  return (
    <div ref={box} className="tester-chart" style={{ height }}>
      <svg width={width} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label="Strategy performance chart">
        <defs>
          <linearGradient id={`up${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--profit)" stopOpacity={0.22} />
            <stop offset="100%" stopColor="var(--profit)" stopOpacity={0.02} />
          </linearGradient>
          <clipPath id={`above${id}`}><rect x={0} y={0} width={plotW} height={y0} /></clipPath>
          <clipPath id={`below${id}`}><rect x={0} y={y0} width={plotW} height={plotH - y0 + 6} /></clipPath>
        </defs>

        {geo.ticks.map((v) => (
          <g key={v}>
            <line x1={0} x2={plotW} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeDasharray={v === 0 ? undefined : '2 4'} />
            <text x={plotW + 10} y={y(v) + 4} className="axis">{v.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: Math.abs(v) < 10 && v % 1 ? 2 : 0 })}</text>
          </g>
        ))}

        {show.excursions && trades.map((t, i) => (
          <g key={i}>
            {t.run_up > 0 && <rect x={xs[i] - barW / 2} y={y(t.run_up)} width={barW} height={Math.max(1, y0 - y(t.run_up))} fill="var(--profit)" opacity={0.5} />}
            {t.drawdown > 0 && <rect x={xs[i] - barW / 2} y={y0} width={barW} height={Math.max(1, y(-t.drawdown) - y0)} fill="var(--loss)" opacity={0.5} />}
          </g>
        ))}

        {show.drawdowns && n > 0 && <path d={ddArea} fill="var(--loss)" opacity={0.16} />}

        {show.buyHold && geo.bh.length > 1 && <path d={bhLine} fill="none" stroke="var(--muted)" strokeWidth={1.3} strokeDasharray="4 3" />}

        {show.pnl && (
          <>
            <path d={area} fill={`url(#up${id})`} clipPath={`url(#above${id})`} />
            <path d={area} fill="var(--loss)" opacity={0.12} clipPath={`url(#below${id})`} />
            <path d={line} fill="none" stroke="var(--profit)" strokeWidth={1.8} strokeLinejoin="round" clipPath={`url(#above${id})`} />
            <path d={line} fill="none" stroke="var(--loss)" strokeWidth={1.8} strokeLinejoin="round" clipPath={`url(#below${id})`} />
            {n > 0 && (
              <g>
                <rect x={plotW + 4} y={y(last) - 10} width={AXIS_W - 6} height={20} rx={3} fill={last >= 0 ? 'var(--profit)' : 'var(--loss)'} />
                <text x={plotW + 10} y={y(last) + 4} className="badge">{last.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</text>
              </g>
            )}
          </>
        )}

        {/* win / loss strip */}
        {trades.map((t, i) => (
          <rect key={i} x={xs[i] - slot / 2} y={plotH + 6} width={Math.max(1, slot - 1)} height={STRIP_H} fill={t.pnl > 0 ? 'var(--profit)' : 'var(--loss)'} opacity={0.75} />
        ))}

        {xLabels.map((i, k) => (
          <text key={i} x={xs[i]} y={height - 6} className="axis" textAnchor={k === 0 ? 'start' : k === xLabels.length - 1 ? 'end' : 'middle'}>
            {shortDate(new Date(trades[i].exit_at).getTime())}
          </text>
        ))}

        {h && (
          <g pointerEvents="none">
            <line x1={xs[hover!]} x2={xs[hover!]} y1={0} y2={plotH + 6} stroke="var(--border-strong)" />
            {show.pnl && <circle cx={xs[hover!]} cy={y(h.cum_pnl)} r={3.5} fill={h.cum_pnl >= 0 ? 'var(--profit)' : 'var(--loss)'} />}
          </g>
        )}
      </svg>
      {h && (
        <div className="tester-tip" style={{ left: tipX, top: 8 }}>
          <div className="between">
            <b>Trade #{h.number} <span className={h.direction === 'LONG' ? 'long' : 'short'}>{h.direction === 'LONG' ? 'Long' : 'Short'}</span></b>
            <span className="muted">{fmtTime(h.exit_at)}</span>
          </div>
          <dl>
            <dt>Net P&amp;L</dt><dd className={h.pnl >= 0 ? 'pos' : 'neg'}>{fmtMoney(h.pnl, { sign: true })}</dd>
            <dt>Cumulative</dt><dd className={h.cum_pnl >= 0 ? 'pos' : 'neg'}>{fmtMoney(h.cum_pnl, { sign: true })}</dd>
            <dt>Run-up</dt><dd>{fmtMoney(h.run_up)}</dd>
            <dt>Drawdown</dt><dd>{h.drawdown ? `−${fmtMoney(h.drawdown)}` : fmtMoney(0)}</dd>
          </dl>
        </div>
      )}
      {!n && <div className="tester-empty muted">No trades in this range.</div>}
    </div>
  )
}
