import type { SizingDraft } from '../strategies'
import { Seg, fmtQty } from './ui'

/** Fixed quantity or capital per trade, with the strategy's hard cap spelled out. */
export function SizingFields({ draft, onChange, defaultQty, cap, allowCapital = true }: { draft: SizingDraft; onChange: (d: SizingDraft) => void; defaultQty: number; cap: number; allowCapital?: boolean }) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>Position size</span>
      <div className="row" style={{ gap: 10, alignItems: 'center' }}>
        <Seg
          label="Position size"
          value={draft.mode}
          onChange={(mode) => onChange({ ...draft, mode })}
          options={allowCapital ? [{ value: 'fixed', label: 'Fixed quantity' }, { value: 'capital', label: 'Capital per trade' }] : [{ value: 'fixed', label: 'Fixed quantity' }]}
        />
        {draft.mode === 'fixed' ? (
          <input
            className="mono"
            style={{ width: 130 }}
            inputMode="numeric"
            aria-label="Units per trade"
            placeholder={`${fmtQty(defaultQty)} units`}
            value={draft.qty}
            onChange={(e) => onChange({ ...draft, qty: e.target.value.replace(/\D/g, '') })}
          />
        ) : (
          <input
            className="mono"
            style={{ width: 160 }}
            inputMode="decimal"
            aria-label="Capital per trade (₹)"
            placeholder="₹ per trade"
            value={draft.capital}
            onChange={(e) => onChange({ ...draft, capital: e.target.value.replace(/[^\d.]/g, '') })}
          />
        )}
      </div>
      <span className="field-note">
        {draft.mode === 'fixed'
          ? `Every entry trades this many units (blank: the strategy’s ${fmtQty(defaultQty)}). At most ${fmtQty(cap)}.`
          : `Each entry buys as many units as this pays for at the entry price, in whole lots, up to ${fmtQty(cap)} unit${cap === 1 ? '' : 's'} (the strategy’s limit).`}
      </span>
    </div>
  )
}
