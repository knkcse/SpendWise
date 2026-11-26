import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Info, Loader2, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Segmented } from '@/components/ui/misc'
import { useStore } from '@/data/store'
import { useAuth } from '@/data/auth'
import { backendConfigured, supabase } from '@/lib/supabase'

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

export function Login() {
  const { setProfile, profile } = useStore()
  const { session } = useAuth()
  const nav = useNavigate()
  const [mode, setMode] = useState<'signin' | 'register'>('signin')
  const [name, setName] = useState(profile.fullName)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'error' | 'info'; text: string } | null>(null)

  if (session) return <Navigate to="/" replace />

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
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: fullName.trim() || null } } })
        if (error) throw error
        if (data.session) nav('/', { replace: true })
        else { setMode('signin'); setPassword(''); setMsg({ tone: 'info', text: `We sent a confirmation link to ${email.trim()}. Open it, then sign in here.` }) }
      }
    } catch (err) {
      const m = (err as Error).message
      setMsg({ tone: 'error', text: /invalid login/i.test(m) ? 'Email or password is incorrect.' : /not confirmed/i.test(m) ? 'Confirm your email first using the link we sent you.' : m })
    } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center px-6 py-10">
      <span className="grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground"><Wallet className="size-7" /></span>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Welcome to SpendWise</h1>
      <p className="mt-1 text-sm text-muted-foreground">Track every UPI, card and cash payment in one place.</p>

      <Segmented className="mt-6" value={mode} onChange={(m) => { setMode(m); setMsg(null) }} options={[{ value: 'signin', label: 'Sign in' }, { value: 'register', label: 'Create account' }]} />
      <form className="mt-4 space-y-3" onSubmit={submit} noValidate>
        {mode === 'register' && <div><Label htmlFor="rname">Full name</Label><Input id="rname" disabled={!backendConfigured} autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={60} /></div>}
        <div><Label htmlFor="email">Email</Label><Input id="email" type="email" inputMode="email" autoComplete="email" disabled={!backendConfigured} value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><Label htmlFor="pw">Password</Label><Input id="pw" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} disabled={!backendConfigured} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === 'register' ? 'At least 8 characters' : undefined} /></div>
        {msg && <p role={msg.tone === 'error' ? 'alert' : 'status'} className={`rounded-xl p-3 text-sm ${msg.tone === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-accent text-accent-foreground'}`}>{msg.text}</p>}
        <Button type="submit" className="w-full" disabled={!backendConfigured || busy}>{busy ? <Loader2 className="animate-spin" /> : null}{mode === 'signin' ? 'Sign in' : 'Create account'}</Button>
      </form>
      {!backendConfigured && (
        <p className="mt-3 flex gap-2 rounded-xl bg-muted p-3 text-xs text-muted-foreground"><Info className="size-4 shrink-0" />This build has no backend configured, so only device-only mode is available.</p>
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
