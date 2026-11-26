import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { NATIVE_REDIRECT, supabase } from './supabase'

const native = Capacitor.isNativePlatform()

/** Where Supabase sends the user back after Google sign-in or an email confirmation link. */
export function authRedirectUrl(): string {
  return native ? NATIVE_REDIRECT : window.location.origin + window.location.pathname
}

/**
 * Google sign-in through Supabase (PKCE). On Android the Google page opens in a
 * Custom Tab; Google returns to Supabase, which redirects to our deep link with
 * a one-time code that we exchange for a session.
 */
export async function signInWithGoogle(): Promise<void> {
  if (!supabase) throw new Error('Sign-in is not configured in this build.')
  const redirectTo = authRedirectUrl()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
  })
  if (error) throw error
  if (native) await Browser.open({ url: data.url, presentationStyle: 'popover' })
  else window.location.assign(data.url)
}

async function finish(url: string) {
  if (!supabase) return
  const u = new URL(url)
  const err = u.searchParams.get('error_description') ?? new URLSearchParams(u.hash.slice(1)).get('error_description')
  if (err) throw new Error(/expired|invalid/i.test(err) ? 'This link has expired or was already used. Sign in, or create the account again to get a new link.' : err)
  const code = u.searchParams.get('code')
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    // The link was already checked by Supabase, so the email is confirmed even if
    // this device can't finish the sign-in (e.g. sign-up was started elsewhere).
    if (error) throw new Error('Your email is confirmed. Please sign in with your email and password.')
  }
}

/** Call once at startup. Handles the deep link (Android) or ?code= on the web. */
export function listenForOAuthReturn(onError: (msg: string) => void) {
  if (native) {
    // Cold start: the app may have been launched by the redirect itself.
    void App.getLaunchUrl().then((r) => { if (r?.url?.startsWith(NATIVE_REDIRECT)) finish(r.url).catch((e) => onError((e as Error).message)) })
    void App.addListener('appUrlOpen', async ({ url }) => {
      if (!url.startsWith(NATIVE_REDIRECT)) return
      await Browser.close().catch(() => {})
      finish(url).catch((e) => onError((e as Error).message))
    })
  } else if (new URLSearchParams(window.location.search).has('code') || window.location.search.includes('error_description')) {
    const url = window.location.href
    window.history.replaceState(null, '', window.location.pathname + window.location.hash)
    finish(url).catch((e) => onError((e as Error).message))
  }
}
