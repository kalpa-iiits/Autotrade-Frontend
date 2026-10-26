import { useEffect, useState } from 'react'
import { errorMessage } from '../api/client'
import type { InstrumentSuggestion } from '../api/types'
import { searchInstruments } from '../strategies'
import { useDebounced } from './ui'

/** A symbol field that suggests the account broker's instruments as the user types.
 *  `onPick` (when given) handles a picked suggestion instead of `onChange`. */
export function InstrumentInput({ accountId, value, onChange, onPick, listId, autoFocus, placeholder = 'Start typing an instrument' }: { accountId: number; value: string; onChange: (symbol: string) => void; onPick?: (symbol: string) => void; listId: string; autoFocus?: boolean; placeholder?: string }) {
  const [open, setOpen] = useState(false)
  const [matches, setMatches] = useState<InstrumentSuggestion[]>([])
  const [error, setError] = useState<string | null>(null)
  const query = useDebounced(value.trim(), 250)
  useEffect(() => {
    if (!query) return
    const controller = new AbortController()
    searchInstruments(accountId, query, controller.signal).then((items) => {
      setMatches(items)
      setError(null)
    }).catch((err) => {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setMatches([])
      setError(errorMessage(err))
    })
    return () => controller.abort()
  }, [accountId, query])

  return (
    <>
      <div className="dropdown">
        <input
          className="mono"
          style={{ width: '100%' }}
          value={value}
          onChange={(e) => {
            const next = e.target.value.toUpperCase()
            onChange(next)
            if (!next.trim()) setMatches([])
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          placeholder={placeholder}
          autoComplete="off"
          autoFocus={autoFocus}
          role="combobox"
          aria-expanded={open && matches.length > 0}
          aria-controls={listId}
          required
        />
        {open && matches.length > 0 && (
          <div className="dropdown-menu menu-list" id={listId} role="listbox" style={{ width: '100%' }}>
            {matches.map((candidate) => (
              <button
                key={candidate.symbol}
                type="button"
                className="menu-item"
                role="option"
                onMouseDown={(e) => {
                  e.preventDefault()
                  if (onPick) onPick(candidate.symbol)
                  else onChange(candidate.symbol)
                  setOpen(false)
                }}
              >
                <span className="grow" style={{ textAlign: 'left' }}>
                  <span className="mono">{candidate.ticker}</span>
                  <span className="tiny muted" style={{ display: 'block' }}>{candidate.name}</span>
                </span>
                <span className="tiny muted">{candidate.kind}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {value.trim() && error && <span className="field-note" style={{ color: 'var(--loss)' }}>{error}</span>}
    </>
  )
}
