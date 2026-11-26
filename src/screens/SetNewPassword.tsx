import { useState } from 'react'
import { Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { useAuth } from '@/data/auth'
import { supabase } from '@/lib/supabase'

/** Shown after a password reset link signs the user in, before the app opens. */
export function SetNewPassword() {
  const { endRecovery } = useAuth()
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!supabase) return
    if (pw.length < 8) return setMsg('Password must be at least 8 characters.')
    if (pw !== pw2) return setMsg('The two passwords don’t match.')
    setBusy(true); setMsg(null)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) return setMsg(/same|different/i.test(error.message) ? 'Choose a password you haven’t used before.' : error.message)
    setDone(true)
  }

  return (
    <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center px-6 py-10">
      <span className="grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground"><KeyRound className="size-7" /></span>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">{done ? 'Password updated' : 'Set a new password'}</h1>
      {done ? (<>
        <p className="mt-1 text-sm text-muted-foreground">You’re signed in. Use this password next time you sign in with email.</p>
        <Button className="mt-6 w-full" onClick={endRecovery}>Continue to SpendWise</Button>
      </>) : (
        <form className="mt-6 space-y-3" onSubmit={submit} noValidate>
          <div><Label htmlFor="npw">New password</Label>
            <div className="relative">
              <Input id="npw" type={show ? 'text' : 'password'} className="pr-12" autoComplete="new-password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 8 characters" />
              <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}
                className="absolute right-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:text-foreground">
                {show ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
              </button>
            </div></div>
          <div><Label htmlFor="npw2">Confirm new password</Label>
            <Input id="npw2" type={show ? 'text' : 'password'} autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
          {msg && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{msg}</p>}
          <Button type="submit" className="w-full" disabled={busy}>{busy && <Loader2 className="animate-spin" />}Save password</Button>
          <button type="button" className="w-full text-sm text-muted-foreground" onClick={endRecovery}>Skip for now</button>
        </form>
      )}
    </div>
  )
}
