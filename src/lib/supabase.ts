import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Only the public (publishable / anon) key ships in the app. RLS protects every row. */
export const supabase: SupabaseClient | null = url && key
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce', storageKey: 'spendwise.auth' } })
  : null

export const backendConfigured = supabase !== null

/**
 * A throwaway client using the implicit flow, only for password reset emails. With PKCE the
 * reset link works only on the device that asked for it; with the implicit flow Supabase puts a
 * short-lived recovery token in the link, so the hosted page can set the password on any device.
 */
export function implicitAuthClient(): SupabaseClient | null {
  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, flowType: 'implicit', storageKey: 'spendwise.reset' } })
    : null
}

/** Deep link the Android app registers for OAuth (see AndroidManifest.xml). Must be in Supabase's redirect allow-list. */
export const NATIVE_REDIRECT = 'app.spendwise.android://auth-callback'

/** Hosted "email confirmed" page (GitHub Pages, docs/auth). Must be in Supabase's redirect allow-list. */
export const EMAIL_CONFIRM_PAGE = 'https://knkcse.github.io/SpendWise/auth/'
