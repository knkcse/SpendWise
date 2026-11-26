import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { listenForOAuthReturn } from '@/lib/oauth'
import { LocalRepository } from './localRepository'
import { SupabaseRepository } from './supabaseRepository'
import { StoreProvider } from './store'

interface AuthCtx { session: Session | null; loading: boolean; oauthError: string | null; clearOAuthError: () => void }
const Ctx = createContext<AuthCtx>({ session: null, loading: false, oauthError: null, clearOAuthError: () => {} })
export const useAuth = () => useContext(Ctx)

/** Picks the storage for the current user: Supabase when signed in, the device otherwise. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(!!supabase)
  const [oauthError, setOAuthError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    listenForOAuthReturn(setOAuthError)
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id ?? null
  const email = session?.user.email ?? null
  const repo = useMemo(() => (userId && supabase ? new SupabaseRepository(supabase, userId, email) : new LocalRepository()), [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return null
  return (
    <Ctx.Provider value={{ session, loading, oauthError, clearOAuthError: () => setOAuthError(null) }}>
      <StoreProvider key={userId ?? 'local'} repo={repo}>{children}</StoreProvider>
    </Ctx.Provider>
  )
}
