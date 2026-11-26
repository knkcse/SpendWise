import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Only the public (publishable / anon) key ships in the app. RLS protects every row. */
export const supabase: SupabaseClient | null = url && key
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce', storageKey: 'spendwise.auth' } })
  : null

export const backendConfigured = supabase !== null

/** Deep link the Android app registers for OAuth (see AndroidManifest.xml). Must be in Supabase's redirect allow-list. */
export const NATIVE_REDIRECT = 'app.spendwise.android://auth-callback'
