import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { LocalRepository } from './localRepository'
import { SupabaseRepository } from './supabaseRepository'
import { StoreProvider } from './store'

interface AuthCtx { session: Session | null; loading: boolean }
const Ctx = createContext<AuthCtx>({ session: null, loading: false })
export const useAuth = () => useContext(Ctx)

/** Picks the storage for the current user: Supabase when signed in, the device otherwise. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(!!supabase)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id ?? null
  const email = session?.user.email ?? null
  const repo = useMemo(() => (userId && supabase ? new SupabaseRepository(supabase, userId, email) : new LocalRepository()), [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return null
  return (
    <Ctx.Provider value={{ session, loading }}>
      <StoreProvider key={userId ?? 'local'} repo={repo}>{children}</StoreProvider>
    </Ctx.Provider>
  )
}
