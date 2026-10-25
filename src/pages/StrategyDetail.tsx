import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useCurrentAccount } from '../accounts'
import { api, errorMessage, unwrap } from '../api/client'
import type { Account, CatalogStrategy, Instance, RuleKind } from '../api/types'
import { Icon, type IconName } from '../components/icons'
import { Page } from '../components/Page'
import { Card, Empty, ErrorBox, NeedAccount, Note, Pill, Seg, fmtQty, shortSymbol, symbolKind, useLoad } from '../components/ui'
import StrategyTester from './StrategyTester'
import { useSummary } from '../summary'
import { sizingBody, sizingDraft, sizingValid, type SizingDraft } from '../strategies'
import { InstrumentInput } from '../components/InstrumentInput'
import { SizingFields } from '../components/SizingFields'

const RULE_LOOK: Record<RuleKind, { icon: IconName; color: string }> = {
  entry_long: { icon: 'market', color: 'var(--profit)' },
  entry_short: { icon: 'trades', color: 'var(--loss)' },
  exit: { icon: 'arrow', color: 'var(--action)' },
  risk: { icon: 'shield', color: 'var(--paper)' },
  filter: { icon: 'info', color: 'var(--muted)' },
}

export default function StrategyDetail() {
  const { key = '' } = useParams()
  const account = useCurrentAccount()
  const item = useLoad(() => unwrap<CatalogStrategy>(api.GET('/api/strategies/catalog/{key}', { params: { path: { key } } })), [key])
  const s = item.data

  return (
    <Page
      title={
        <span className="row" style={{ gap: 10 }}>
          <Link to="/strategies" className="muted" style={{ textDecoration: 'none', fontWeight: 400 }}>Strategies</Link>
          <span className="faint" style={{ fontWeight: 400 }}>/</span>
          <span className="mono">{s?.label ?? key}</span>
        </span>
      }
      sub={s ? `${s.strategy} · ${s.timeframes.join(' · ')}` : undefined}
      band
    >
      <ErrorBox error={item.error} />
      {!s && !item.error && <div className="muted">Loading…</div>}
      {s && (
        <>
          {account && <DeployPanel s={s} account={account} />}
          <Overview s={s} />
          {account ? <StrategyTester key={`${account.id}-${s.key}`} s={s} account={account} /> : <NeedAccount />}
          <div className="split even" style={{ alignItems: 'start' }}>
            <Rules s={s} />
            <Params s={s} />
          </div>
        </>
      )}
    </Page>
  )
}

function Overview({ s }: { s: CatalogStrategy }) {
  return (
    <section className="card stack" style={{ gap: 14 }}>
      <div className="row" style={{ gap: 8 }}>
        <Pill tone={s.mode === 'live' ? 'bad' : 'info'} dot={s.mode === 'live' ? 'bad' : 'info'}>{s.mode === 'live' ? 'Live orders' : 'Signals only'}</Pill>
        {s.tags.map((t) => <Pill key={t}>{t}</Pill>)}
      </div>
      <p style={{ fontSize: 15, maxWidth: 820 }}>{s.description}</p>
      <div className="inset kv-grid" style={{ '--cols': 4 } as React.CSSProperties}>
        <div><div className="k">Timeframes</div><div className="v" title={s.timeframes.join(', ')}>{s.timeframes.join(' ')}</div></div>
        <div><div className="k">Live qty / trade</div><div className="v">{fmtQty(s.quantity)}</div></div>
        <div><div className="k">Max position</div><div className="v">{fmtQty(s.max_position)}</div></div>
        <div><div className="k">Orders / day</div><div className="v">{s.max_orders_per_day}</div></div>
      </div>
    </section>
  )
}

function Rules({ s }: { s: CatalogStrategy }) {
  return (
    <Card title="Trigger conditions">
      {s.rules.length === 0 && <Empty>This strategy doesn’t describe its rules yet.</Empty>}
      <div className="stack" style={{ gap: 12 }}>
        {s.rules.map((r, i) => {
          const look = RULE_LOOK[r.kind] ?? RULE_LOOK.filter
          return (
            <div key={i} className="inset rule" style={{ borderLeftColor: look.color }}>
              <div className="row" style={{ gap: 8, marginBottom: 8 }}>
                <span style={{ color: look.color, display: 'inline-flex' }}><Icon name={look.icon} size={15} /></span>
                <b>{r.title}</b>
              </div>
              <ul>
                {r.conditions.map((c) => <li key={c}>{c}</li>)}
              </ul>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function paramText(v: unknown): string {
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (typeof v === 'string' && /^\d\d:\d\d:\d\d$/.test(v)) return v.slice(0, 5)
  return v === null || v === undefined ? '—' : String(v)
}

function Params({ s }: { s: CatalogStrategy }) {
  return (
    <Card title="Parameters" count={s.params.length} flush>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Setting</th>
              <th className="num">Value</th>
            </tr>
          </thead>
          <tbody>
            {s.params.map((p) => (
              <tr key={p.name}>
                <td style={{ whiteSpace: 'normal' }}>
                  <span className="mono small">{p.name}</span>
                  {p.description && <div className="sub">{p.description}</div>}
                </td>
                <td className="num">
                  {paramText(p.value)}
                  {paramText(p.value) !== paramText(p.default) && <div className="sub">default {paramText(p.default)}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-foot">Set in backend code (app/strategies/deployments.py); the same for every instance.</div>
    </Card>
  )
}

// ---------- deploy ----------

function DeployPanel({ s, account }: { s: CatalogStrategy; account: Account }) {
  const { strategies, reload } = useSummary()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const mine = (strategies.data?.strategies ?? []).filter((i) => i.deployment_key === s.key)
  const [symbol, setSymbol] = useState(mine[0]?.symbol ?? s.default_symbol ?? '')
  const requestedTimeframe = params.get('tf')
  const [timeframe, setTimeframe] = useState(requestedTimeframe && s.timeframes.includes(requestedTimeframe) ? requestedTimeframe : s.default_timeframe)
  const [sizing, setSizing] = useState<SizingDraft>(sizingDraft())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      const inst = await unwrap<Instance & { warning?: string | null }>(
        api.POST('/api/strategies', { body: { deployment_key: s.key, account_id: account.id, symbol: symbol.trim(), timeframe, ...sizingBody(sizing) } }),
      )
      setNote(`Added on ${shortSymbol(inst.symbol)} ${inst.timeframe}, stopped. Start it from My strategies when you’re ready.${inst.warning ? ` Warning: ${inst.warning}` : ''}`)
      reload()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card" id="deploy">
      <div className="side-right" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
        <div className="stack tight">
          <h2 style={{ fontSize: 17 }}>Deploy on {account.label}</h2>
          <p className="small muted">Added stopped, in {s.mode} mode — {s.mode === 'live' ? 'it places real orders once started.' : 'it records signals without placing orders.'}</p>
          <form className="stack tight" onSubmit={submit} style={{ marginTop: 6 }}>
            <div className="row" style={{ alignItems: 'flex-end', gap: 12 }}>
              <label className="field grow" style={{ minWidth: 200 }}>
                Instrument
                <InstrumentInput accountId={account.id} value={symbol} onChange={setSymbol} listId={`deploy-instruments-${s.key}`} />
              </label>
              <div className="stack" style={{ gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>Timeframe</span>
                <Seg label="Timeframe" mono value={timeframe} onChange={setTimeframe} options={s.timeframes.map((t) => ({ value: t, label: t }))} />
              </div>
              <button type="submit" className="primary" disabled={busy || !symbol.trim() || !sizingValid(sizing)}>{busy ? 'Adding…' : 'Add strategy'}</button>
            </div>
            {symbol && <span className="field-note">{symbolKind(symbol)}</span>}
            <SizingFields draft={sizing} onChange={setSizing} defaultQty={s.quantity} cap={Math.min(s.max_order_qty, s.max_position)} />
          </form>
          <ErrorBox error={error} />
          {note && <Note onClose={() => setNote(null)}>{note}</Note>}
        </div>
        <div className="inset" style={{ padding: 0 }}>
          <div className="caps tiny" style={{ padding: '14px 16px 6px' }}>On this account · {mine.length}</div>
          {mine.length === 0 && <div className="small muted" style={{ padding: '6px 16px 16px' }}>Not running anywhere on {account.label} yet.</div>}
          {mine.map((i) => (
            <button key={i.id} className="list-row instance-row" onClick={() => navigate('/my-strategies')}>
              <span className={`dot ${i.status === 'running' ? 'good' : i.status === 'error' ? 'bad' : ''}`} />
              <span className="mono grow ellipsis" style={{ textAlign: 'left' }}>{shortSymbol(i.symbol)} · {i.timeframe}</span>
              <span className="small muted">{i.status}</span>
              <Icon name="arrow" size={14} className="muted" />
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
