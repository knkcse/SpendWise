import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Info, KeyRound, Loader2, MailCheck, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Segmented } from '@/components/ui/misc'
import { useStore } from '@/data/store'
import { useAuth } from '@/data/auth'
import { EMAIL_CONFIRM_PAGE, backendConfigured, supabase } from '@/lib/supabase'
import { requestPasswordReset, signInWithGoogle } from '@/lib/oauth'

export function Splash() {
  const { ready, profile } = useStore()
  const [done, setDone] = useState(false)
  useEffect(() => { const t = setTimeout(() => setDone(true), 700); return () => clearTimeout(t) }, [])
  if (ready && done) return <Navigate to={profile.onboarded ? '/' : '/login'} replace />
  return (
    <div className="grid h-full place-items-center bg-gradient-to-br from-teal-700 to-emerald-600 text-white">
      <div className="flex flex-col items-center animate-in fade-in zoom-in-95 duration-500">
        <span className="grid size-20 place-items-center rounded-3xl bg-white/15 backdrop-blur"><Wallet className="size-10" /></span>
        <p className="mt-4 text-2xl font-semibold tracking-tight">SpendWise</p>
        <p className="mt-1 text-sm text-white/75">Know where every rupee goes</p>
      </div>
    </div>
  )
}

/** Sign-up confirmation by code typed in the app: no links, so it works on any device. */
function VerifyCode({ email, onBack, onSignIn }: { email: string; onBack: () => void; onSignIn: () => void }) {
  const [showCode, setShowCode] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'error' | 'info'; text: string } | null>(null)
  const [cooldown, setCooldown] = useState(60)
  useEffect(() => { if (cooldown <= 0) return; const t = setTimeout(() => setCooldown(cooldown - 1), 1000); return () => clearTimeout(t) }, [cooldown])

  const verify = async (e: React.FormEvent) => {
    e.preventDefault(); if (!supabase) return
    if (!/^\d{6,10}$/.test(code)) return setMsg({ tone: 'error', text: 'Enter the code from the email.' })
    setBusy(true); setMsg(null)
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'signup' })
    setBusy(false)
    if (error) setMsg({ tone: 'error', text: /expired|invalid/i.test(error.message) ? 'That code is wrong or has expired. Check the latest email, or send a new code.' : error.message })
    // On success the auth listener receives the session and the app opens the dashboard.
  }
  const resend = async () => {
    if (!supabase) return
    const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: EMAIL_CONFIRM_PAGE } })
    if (error) return setMsg({ tone: 'error', text: error.message })
    setCooldown(60); setMsg({ tone: 'info', text: 'Sent again. Check your inbox.' })
  }

  return (
    <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center px-6 py-10">
      <span className="grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground"><MailCheck className="size-7" /></span>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Check your email</h1>
      <p className="mt-1 text-sm text-muted-foreground">We sent a confirmation email to <span className="font-medium text-foreground">{email}</span>. Tap the link in it, then come back here and sign in.</p>
      <Button className="mt-6 w-full" onClick={onSignIn}>I’ve confirmed, sign in</Button>
      {msg && !showCode && <p role={msg.tone === 'error' ? 'alert' : 'status'} className={`mt-3 rounded-xl p-3 text-sm ${msg.tone === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-accent text-accent-foreground'}`}>{msg.text}</p>}
      {!showCode && <button className="mt-4 text-sm text-muted-foreground underline" onClick={() => setShowCode(true)}>Got a code instead of a link?</button>}
      {showCode && <form className="mt-6 space-y-3" onSubmit={verify} noValidate>
        <div><Label htmlFor="otp">Confirmation code</Label>
          <Input id="otp" autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={10} value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="text-center text-2xl font-semibold tracking-[0.4em]" placeholder="••••••" /></div>
        {msg && <p role={msg.tone === 'error' ? 'alert' : 'status'} className={`rounded-xl p-3 text-sm ${msg.tone === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-accent text-accent-foreground'}`}>{msg.text}</p>}
        <Button type="submit" variant="outline" className="w-full" disabled={busy || code.length < 6}>{busy && <Loader2 className="animate-spin" />}Confirm with code</Button>
      </form>}
      <div className="mt-4 flex justify-between text-sm">
        <button className="text-muted-foreground" onClick={onBack}>Use a different email</button>
        <button className="font-medium text-primary disabled:text-muted-foreground" disabled={cooldown > 0} onClick={resend}>{cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend email'}</button>
      </div>
      <p className="mt-6 text-xs text-muted-foreground">Can’t find it? Check spam or promotions. The link expires after an hour.</p>
    </div>
  )
}

/** Asks Supabase to email a reset link. Supabase answers the same whether or not the email has an account. */
function ForgotPassword({ initialEmail, onBack }: { initialEmail: string; onBack: () => void }) {
  const [email, setEmail] = useState(initialEmail)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setMsg('Enter a valid email address.')
    setBusy(true); setMsg(null)
    try { await requestPasswordReset(email.trim()); setSent(true) } catch (err) {
      const m = (err as Error).message
      setMsg(/rate|seconds|too many/i.test(m) ? 'Please wait a minute before asking for another email.' : m)
    } finally { setBusy(false) }
  }
  return (
    <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center px-6 py-10">
      <span className="grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground"><KeyRound className="size-7" /></span>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">{sent ? 'Check your email' : 'Reset your password'}</h1>
      {sent ? (<>
        <p className="mt-1 text-sm text-muted-foreground">If <span className="font-medium text-foreground">{email.trim()}</span> has a SpendWise account, we’ve sent a reset link to it.</p>
        <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Open the email on any phone or computer and tap <span className="font-medium text-foreground">Reset password</span>.</li>
          <li>Choose a new password on the page that opens.</li>
          <li>Come back here and sign in with it.</li>
        </ol>
        <p className="mt-4 text-xs text-muted-foreground">Can’t find it? Check spam or promotions. The link expires after an hour.</p>
        <Button variant="outline" className="mt-6 w-full" onClick={onBack}>Back to sign in</Button>
      </>) : (
        <form className="mt-4 space-y-3" onSubmit={send} noValidate>
          <p className="text-sm text-muted-foreground">Enter your account email and we’ll send you a link to set a new password. This also works if you signed up with Google and want to add a password.</p>
          <div><Label htmlFor="femail">Email</Label><Input id="femail" type="email" inputMode="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          {msg && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{msg}</p>}
          <Button type="submit" className="w-full" disabled={busy}>{busy && <Loader2 className="animate-spin" />}Send reset link</Button>
          <button type="button" className="w-full text-sm text-muted-foreground" onClick={onBack}>Back to sign in</button>
        </form>
      )}
    </div>
  )
}

const ALREADY_REGISTERED = 'This email already has a SpendWise account. Sign in with your password, use Continue with Google if you signed up that way, or tap Forgot password.'

export function Login() {
  const { setProfile, profile } = useStore()
  const { session, oauthError, clearOAuthError } = useAuth()
  const nav = useNavigate()
  const [mode, setMode] = useState<'signin' | 'register'>('signin')
  const [name, setName] = useState(profile.fullName)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'error' | 'info'; text: string } | null>(null)
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null)
  const [forgot, setForgot] = useState(false)

  if (session) return <Navigate to="/" replace />
  if (verifyEmail) return <VerifyCode email={verifyEmail} onBack={() => setVerifyEmail(null)} onSignIn={() => { setVerifyEmail(null); setMode('signin'); setMsg(null) }} />

  if (forgot) return <ForgotPassword initialEmail={email} onBack={() => { setForgot(false); setMode('signin'); setMsg(null) }} />

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!supabase) return
    setMsg(null)
    if (!/^\S+@\S+\.\S+$/.test(email)) return setMsg({ tone: 'error', text: 'Enter a valid email address.' })
    if (password.length < 8) return setMsg({ tone: 'error', text: 'Password must be at least 8 characters.' })
    setBusy(true)
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
        nav('/', { replace: true })
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: fullName.trim() || null }, emailRedirectTo: EMAIL_CONFIRM_PAGE } })
        if (error) throw error
        // Supabase doesn't reveal existing accounts as an error: it returns a user with no identities.
        if (data.user && !data.user.identities?.length) {
          setMode('signin'); setPassword('')
          return setMsg({ tone: 'error', text: ALREADY_REGISTERED })
        }
        if (data.session) nav('/', { replace: true })
        else setVerifyEmail(email.trim())
      }
    } catch (err) {
      const m = (err as Error).message
      if (/not confirmed/i.test(m)) {
        await supabase.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: EMAIL_CONFIRM_PAGE } }).catch(() => {})
        return setVerifyEmail(email.trim())
      }
      if (/already registered|already exists/i.test(m)) { setMode('signin'); setPassword(''); return setMsg({ tone: 'error', text: ALREADY_REGISTERED }) }
      setMsg({ tone: 'error', text: /invalid login/i.test(m) ? 'Email or password is incorrect. If you signed up with Google, use Continue with Google, or tap Forgot password to set one.' : m })
    } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center px-6 py-10">
      <span className="grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground"><Wallet className="size-7" /></span>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Welcome to SpendWise</h1>
      <p className="mt-1 text-sm text-muted-foreground">Track every UPI, card and cash payment in one place.</p>

      <Button variant="outline" className="mt-6 w-full" disabled={!backendConfigured || busy} onClick={async () => {
        setMsg(null); clearOAuthError(); setBusy(true)
        try { await signInWithGoogle() } catch (e) { setMsg({ tone: 'error', text: (e as Error).message }) } finally { setBusy(false) }
      }}><GoogleIcon />Continue with Google</Button>
      {oauthError && <p role="alert" className="mt-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{oauthError}</p>}
      <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or use email<span className="h-px flex-1 bg-border" /></div>

      <Segmented value={mode} onChange={(m) => { setMode(m); setMsg(null) }} options={[{ value: 'signin', label: 'Sign in' }, { value: 'register', label: 'Create account' }]} />
      <form className="mt-4 space-y-3" onSubmit={submit} noValidate>
        {mode === 'register' && <div><Label htmlFor="rname">Full name</Label><Input id="rname" disabled={!backendConfigured} autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={60} /></div>}
        <div><Label htmlFor="email">Email</Label><Input id="email" type="email" inputMode="email" autoComplete="email" disabled={!backendConfigured} value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><Label htmlFor="pw">Password</Label>
          <div className="relative">
            <Input id="pw" type={showPw ? 'text' : 'password'} className="pr-12" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} disabled={!backendConfigured} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === 'register' ? 'At least 8 characters' : undefined} />
            <button type="button" onClick={() => setShowPw(!showPw)} aria-label={showPw ? 'Hide password' : 'Show password'} aria-pressed={showPw}
              className="absolute right-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:text-foreground">
              {showPw ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
            </button>
          </div></div>
        {msg && <p role={msg.tone === 'error' ? 'alert' : 'status'} className={`rounded-xl p-3 text-sm ${msg.tone === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-accent text-accent-foreground'}`}>{msg.text}</p>}
        <Button type="submit" className="w-full" disabled={!backendConfigured || busy}>{busy ? <Loader2 className="animate-spin" /> : null}{mode === 'signin' ? 'Sign in' : 'Create account'}</Button>
        {mode === 'signin' && backendConfigured && <button type="button" className="w-full text-sm font-medium text-primary" onClick={() => { setMsg(null); setForgot(true) }}>Forgot password?</button>}
      </form>
      {!backendConfigured && (
        <p className="mt-3 flex gap-2 rounded-xl bg-muted p-3 text-xs text-muted-foreground"><Info className="size-4 shrink-0" />Sign-in isn’t available in this web preview. Install the Android app to use your account.</p>
      )}

      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
      <form onSubmit={(e) => { e.preventDefault(); setProfile({ fullName: name.trim(), onboarded: true }); nav('/', { replace: true }) }} className="space-y-3">
        <div><Label htmlFor="lname">Your name</Label><Input id="lname" value={name} onChange={(e) => setName(e.target.value)} placeholder="So we can greet you" maxLength={60} /></div>
        <Button type="submit" variant="outline" className="w-full">Use without an account</Button>
        <p className="text-center text-xs text-muted-foreground">Data stays on this phone only and isn’t backed up. You can move it into an account later.</p>
      </form>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}
