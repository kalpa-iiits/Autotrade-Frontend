import type {
  AutoscaleInfo,
  IChartApiBase,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  SeriesType,
  Time,
  UTCTimestamp,
} from 'lightweight-charts'

type Target = Parameters<IPrimitivePaneRenderer['draw']>[0]

/** A forecast's sampled runs, each starting from the last real bar. */
export interface FanData {
  start: { time: UTCTimestamp; close: number }
  times: UTCTimestamp[]
  runs: number[][] // closes, one per time
}

const SHADE = 'rgba(245, 158, 11, 0.05)'
const DIVIDER = 'rgba(251, 113, 133, 0.6)'
const ENVELOPE = 'rgba(245, 158, 11, 0.16)'
const RUN = 'rgba(245, 158, 11, 0.28)'
const LABEL = '#fbbf24'
const LABEL_HALO = 'rgba(16, 20, 27, 0.9)'

/**
 * Draws a Kronos forecast as a fan behind its mean line (attach to that line series): a shaded
 * zone from the last real bar on, a dashed divider there, the band between the lowest and highest
 * run at each step, every run as a thin line, and the highest / lowest final close labelled.
 */
export class ForecastFan implements ISeriesPrimitive<Time> {
  private data: FanData | null = null
  private chart: IChartApiBase<Time> | null = null
  private series: ISeriesApi<SeriesType, Time> | null = null
  private requestUpdate: (() => void) | null = null
  private readonly views: IPrimitivePaneView[] = [{ zOrder: () => 'bottom', renderer: () => this.renderer() }]

  attached({ chart, series, requestUpdate }: SeriesAttachedParameter<Time>) {
    this.chart = chart
    this.series = series
    this.requestUpdate = requestUpdate
  }

  detached() {
    this.chart = this.series = this.requestUpdate = null
  }

  setData(data: FanData | null) {
    this.data = data && data.runs.length && data.times.length ? data : null
    this.requestUpdate?.()
  }

  paneViews() {
    return this.views
  }

  autoscaleInfo(): AutoscaleInfo | null {
    if (!this.data) return null
    const all = this.data.runs.flat()
    return { priceRange: { minValue: Math.min(...all), maxValue: Math.max(...all) } }
  }

  private renderer(): IPrimitivePaneRenderer | null {
    const { data, chart, series } = this
    if (!data || !chart || !series) return null
    const ts = chart.timeScale()
    const x = (t: UTCTimestamp) => ts.timeToCoordinate(t)
    const y = (p: number) => series.priceToCoordinate(p)

    const draw = (target: Target, labels: boolean) =>
      target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
        const x0 = x(data.start.time)
        const y0 = y(data.start.close)
        if (x0 === null || y0 === null) return
        // Each step: x, and the y of every run's close there. Steps off-screen are skipped.
        const steps = data.times.flatMap((t, i) => {
          const xi = x(t)
          const ys = data.runs.map((r) => y(r[i]))
          return xi === null || ys.some((v) => v === null) ? [] : [{ x: xi, ys: ys as number[] }]
        })
        if (!labels) {
          ctx.fillStyle = SHADE
          ctx.fillRect(x0, 0, mediaSize.width - x0, mediaSize.height)
          ctx.save()
          ctx.strokeStyle = DIVIDER
          ctx.setLineDash([4, 4])
          ctx.beginPath()
          ctx.moveTo(Math.round(x0) + 0.5, 0)
          ctx.lineTo(Math.round(x0) + 0.5, mediaSize.height)
          ctx.stroke()
          ctx.restore()
          if (!steps.length) return

          // Envelope: along the top (smallest y = highest price), back along the bottom.
          ctx.fillStyle = ENVELOPE
          ctx.beginPath()
          ctx.moveTo(x0, y0)
          for (const s of steps) ctx.lineTo(s.x, Math.min(...s.ys))
          for (const s of [...steps].reverse()) ctx.lineTo(s.x, Math.max(...s.ys))
          ctx.closePath()
          ctx.fill()

          ctx.strokeStyle = RUN
          ctx.lineWidth = 1
          ctx.lineJoin = 'round'
          for (let r = 0; r < data.runs.length; r++) {
            ctx.beginPath()
            ctx.moveTo(x0, y0)
            for (const s of steps) ctx.lineTo(s.x, s.ys[r])
            ctx.stroke()
          }
          return
        }

        // Labels on top: highest and lowest final close, at the last step.
        const last = steps.at(-1)
        if (!last || steps.length !== data.times.length) return
        const finals = data.runs.map((r) => r.at(-1)!)
        const fmt = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        ctx.font = '600 11px Geist, ui-sans-serif, system-ui, sans-serif'
        ctx.textAlign = 'right'
        ctx.lineJoin = 'round'
        const right = Math.min(last.x, mediaSize.width) - 4
        // Outlined in the card colour so the text stays readable over the runs.
        const label = (text: string, y: number) => {
          ctx.strokeStyle = LABEL_HALO
          ctx.lineWidth = 4
          ctx.strokeText(text, right, y)
          ctx.fillStyle = LABEL
          ctx.fillText(text, right, y)
        }
        ctx.textBaseline = 'bottom'
        label(`highest run ${fmt(Math.max(...finals))}`, Math.max(14, Math.min(...last.ys) - 6))
        ctx.textBaseline = 'top'
        label(`lowest run ${fmt(Math.min(...finals))}`, Math.min(mediaSize.height - 14, Math.max(...last.ys) + 6))
      })

    return { draw: (target) => draw(target, true), drawBackground: (target) => draw(target, false) }
  }
}
