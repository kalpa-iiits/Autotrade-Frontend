import { useId, useRef, useState, type MouseEvent } from 'react'

export interface Point {
  /** Epoch ms. */
  t: number
  v: number
}

/** A tiny trend line; green when the last value is at or above the first, red otherwise. */
export function Sparkline({ values, width = 64, height = 22 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return <svg width={width} height={height} aria-hidden="true" />
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const step = width / (values.length - 1)
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`).join('')
  const up = values[values.length - 1] >= values[0]
  return (
    <svg width={width} height={height} aria-hidden="true">
      <path d={d} fill="none" stroke={up ? 'var(--profit)' : 'var(--loss)'} strokeWidth={1.4} strokeLinejoin="round" />
    </svg>
  )
}

/**
 * Filled area chart with three y labels (max, mid, min) on the right and a few dates below.
 * Hovering shows the value under the pointer.
 */
export function AreaChart({
  points,
  height = 220,
  color = 'var(--action)',
  format,
  formatX,
  baseline,
}: {
  points: Point[]
  height?: number
  color?: string
  format: (v: number) => string
  formatX: (t: number) => string
  /** Draw a dashed line here (e.g. 0 for P&L). */
  baseline?: number
}) {
  const id = useId().replace(/:/g, '')
  const ref = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const W = 600
  const padR = 92
  const padB = 26
  const H = height
  if (points.length < 2) {
    return (
      <div className="empty" style={{ height }}>
        Not enough history to draw yet.
      </div>
    )
  }
  const vals = points.map((p) => p.v).concat(baseline === undefined ? [] : [baseline])
  let min = Math.min(...vals)
  let max = Math.max(...vals)
  if (min === max) {
    min -= 1
    max += 1
  }
  const pad = (max - min) * 0.08
  min -= pad
  max += pad
  const t0 = points[0].t
  const t1 = points[points.length - 1].t
  const x = (t: number) => ((t - t0) / (t1 - t0 || 1)) * (W - padR)
  const y = (v: number) => 8 + (1 - (v - min) / (max - min)) * (H - padB - 8)
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('')
  const area = `${line}L${x(t1).toFixed(1)},${H - padB}L0,${H - padB}Z`
  const ticks = [max - pad, (max + min) / 2, min + pad]
  const labels = 5
  const xTicks = Array.from({ length: labels }, (_, i) => t0 + ((t1 - t0) * i) / (labels - 1))

  function onMove(e: MouseEvent<SVGSVGElement>) {
    const box = ref.current?.getBoundingClientRect()
    if (!box) return
    const px = ((e.clientX - box.left) / box.width) * W
    const t = t0 + (px / (W - padR)) * (t1 - t0)
    let best = 0
    for (let i = 1; i < points.length; i++) if (Math.abs(points[i].t - t) < Math.abs(points[best].t - t)) best = i
    setHover(best)
  }

  const hp = hover === null ? null : points[hover]
  return (
    <svg
      ref={ref}
      className="chart-svg"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ height }}
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
      role="img"
    >
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={0} x2={W - padR} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <text x={W - padR + 8} y={y(v) + 4}>
            {format(v)}
          </text>
        </g>
      ))}
      {baseline !== undefined && (
        <line x1={0} x2={W - padR} y1={y(baseline)} y2={y(baseline)} stroke="var(--faint)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
      )}
      <path d={area} fill={`url(#g${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.8} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      {xTicks.map((t, i) => (
        <text key={t} x={x(t)} y={H - 6} textAnchor={i === 0 ? 'start' : i === labels - 1 ? 'end' : 'middle'}>
          {formatX(t)}
        </text>
      ))}
      {hp && (
        <g>
          <line x1={x(hp.t)} x2={x(hp.t)} y1={8} y2={H - padB} stroke="var(--border-strong)" vectorEffect="non-scaling-stroke" />
          <circle cx={x(hp.t)} cy={y(hp.v)} r={3.5} fill={color} />
          <text x={Math.min(x(hp.t) + 8, W - padR - 120)} y={20} style={{ fill: 'var(--text)' }}>
            {formatX(hp.t)} · {format(hp.v)}
          </text>
        </g>
      )}
    </svg>
  )
}

/** Win rate ring. */
export function Ring({ value, size = 40 }: { value: number; size?: number }) {
  const r = size / 2 - 4
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--idle)" strokeWidth={4} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--profit)"
        strokeWidth={4}
        strokeDasharray={`${c * Math.max(0, Math.min(1, value))} ${c}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  )
}
