import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Info, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Segmented } from '@/components/ui/misc'
import { useStore } from '@/data/store'

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

const backendConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)

export function Login() {
  const { setProfile, profile } = useStore()
  const nav = useNavigate()
  const [mode, setMode] = useState<'signin' | 'register'>('signin')
  const [name, setName] = useState(profile.fullName)
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('')

  return (
    <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center px-6 py-10">
      <span className="grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground"><Wallet className="size-7" /></span>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Welcome to SpendWise</h1>
      <p className="mt-1 text-sm text-muted-foreground">Track every UPI, card and cash payment in one place.</p>

      <Segmented className="mt-6" value={mode} onChange={setMode} options={[{ value: 'signin', label: 'Sign in' }, { value: 'register', label: 'Create account' }]} />
      <form className="mt-4 space-y-3" onSubmit={(e) => e.preventDefault()}>
        {mode === 'register' && <div><Label htmlFor="rname">Full name</Label><Input id="rname" disabled={!backendConfigured} autoComplete="name" /></div>}
        <div><Label htmlFor="email">Email</Label><Input id="email" type="email" autoComplete="email" disabled={!backendConfigured} value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><Label htmlFor="pw">Password</Label><Input id="pw" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} disabled={!backendConfigured} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <Button type="submit" className="w-full" disabled={!backendConfigured}>{mode === 'signin' ? 'Sign in' : 'Create account'}</Button>
      </form>
      {!backendConfigured && (
        <p className="mt-3 flex gap-2 rounded-xl bg-muted p-3 text-xs text-muted-foreground"><Info className="size-4 shrink-0" />Account sign-in needs the Supabase backend, which is connected in Phase 2. You can use SpendWise on this device now; your data stays on the phone.</p>
      )}

      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
      <form onSubmit={(e) => { e.preventDefault(); setProfile({ fullName: name.trim(), onboarded: true }); nav('/', { replace: true }) }} className="space-y-3">
        <div><Label htmlFor="lname">Your name</Label><Input id="lname" value={name} onChange={(e) => setName(e.target.value)} placeholder="So we can greet you" maxLength={60} /></div>
        <Button type="submit" variant="outline" className="w-full">Continue on this device</Button>
      </form>
    </div>
  )
}
