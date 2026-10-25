import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, errorMessage, unwrap } from './api/client'
import type { Account } from './api/types'

const SELECTED_KEY = 'autotrade.account'

interface AccountsState {
  /** undefined while loading. */
  accounts: Account[] | undefined
  error: string | null
  /** The account the trading pages (and the live socket) work on; null if the user has none. */
  current: Account | null
  select(id: number): void
  reload(): Promise<void>
  /** Set by a broker login coming back (?broker_login=... or ?broker_login_error=...). */
  returned: { ok: boolean; text: string } | null
  clearReturned(): void
}

const AccountsContext = createContext<AccountsState | null>(null)

function savedId(): number | null {
  try {
    const n = Number(localStorage.getItem(SELECTED_KEY))
    return Number.isInteger(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

export function AccountsProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<Account[] | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<number | null>(savedId)
  const [returned, setReturned] = useState<{ ok: boolean; text: string } | null>(null)
  const [params, setParams] = useSearchParams()

  const reload = useCallback(async () => {
    try {
      setAccounts(await unwrap<Account[]>(api.GET('/api/accounts')))
      setError(null)
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [])

  const select = useCallback((id: number) => {
    setSelected(id)
    try {
      localStorage.setItem(SELECTED_KEY, String(id))
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => void reload(), [reload])

  // Coming back from a broker login: ?broker_login=fyers&account_id=3 or ?broker_login_error=...
  useEffect(() => {
    const ok = params.get('broker_login')
    const err = params.get('broker_login_error')
    if (!ok && !err) return
    const id = Number(params.get('account_id'))
    if (id) select(id)
    setReturned(ok ? { ok: true, text: `Logged in to ${ok}.` } : { ok: false, text: `Broker login failed: ${err}` })
    setParams({}, { replace: true })
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const current = accounts?.find((a) => a.id === selected) ?? accounts?.[0] ?? null

  return (
    <AccountsContext.Provider
      value={{ accounts, error, current, select, reload, returned, clearReturned: () => setReturned(null) }}
    >
      {children}
    </AccountsContext.Provider>
  )
}

export function useAccounts(): AccountsState {
  const ctx = useContext(AccountsContext)
  if (!ctx) throw new Error('useAccounts outside AccountsProvider')
  return ctx
}

/** The selected account; pages that need one render <NeedAccount /> when it is null. */
export function useCurrentAccount(): Account | null {
  return useAccounts().current
}

export function accountName(a: Pick<Account, 'id' | 'label' | 'broker'>): string {
  return `${a.label} (${a.broker})`
}
