import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, setUnauthorizedHandler, unwrap } from './api/client'
import type { Me } from './api/types'

interface AuthState {
  /** undefined while checking the session on load, null when signed out. */
  user: Me | null | undefined
  login(username: string, password: string): Promise<void>
  logout(): Promise<void>
  /** Drop the local session (after a 401 or a socket closed with 1008). */
  signedOut(): void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null | undefined>(undefined)

  const signedOut = useCallback(() => setUser(null), [])

  useEffect(() => {
    setUnauthorizedHandler(signedOut)
    // Not signed in (401) or backend unreachable: either way, show the login page.
    unwrap(api.GET('/api/auth/me'))
      .then(setUser)
      .catch(() => setUser(null))
  }, [signedOut])

  const login = useCallback(async (username: string, password: string) => {
    setUser(await unwrap(api.POST('/api/auth/login', { body: { username, password } })))
  }, [])

  const logout = useCallback(async () => {
    try {
      await unwrap(api.POST('/api/auth/logout'))
    } finally {
      setUser(null)
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, login, logout, signedOut }}>{children}</AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}
