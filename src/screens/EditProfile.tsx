import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { Camera, Loader2, Trash2 } from 'lucide-react'
import { Page, PageHeader } from '@/components/layout/AppShell'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Avatar } from '@/components/Avatar'
import { useToast } from '@/components/toast'
import { useStore } from '@/data/store'
import { useAuth } from '@/data/auth'
import { removeOldAvatars, uploadAvatar } from '@/lib/avatar'
import { EMAIL_CONFIRM_PAGE, supabase } from '@/lib/supabase'

export default function EditProfile() {
  const s = useStore()
  const { session } = useAuth()
  const nav = useNavigate(); const toast = useToast()
  const file = useRef<HTMLInputElement>(null)
  const cloud = s.repoKind === 'supabase' && !!session
  const providers: string[] = (session?.user.app_metadata?.providers as string[] | undefined) ?? []
  const googleOnly = providers.includes('google') && !providers.includes('email')

  const [fullName, setFullName] = useState(s.profile.fullName)
  const [phone, setPhone] = useState(s.profile.phone ?? '')
  const [dob, setDob] = useState(s.profile.dateOfBirth ?? '')
  const [city, setCity] = useState(s.profile.city ?? '')
  const [occupation, setOccupation] = useState(s.profile.occupation ?? '')
  const [email, setEmail] = useState(s.profile.email ?? '')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const onPhoto = async (f: File) => {
    if (!session) return
    setUploading(true); setError('')
    try { const url = await uploadAvatar(session.user.id, f); s.setProfile({ avatarUrl: url }); toast('Photo updated') }
    catch (e) { setError((e as Error).message) }
    finally { setUploading(false); if (file.current) file.current.value = '' }
  }

  const save = async () => {
    setError('')
    const ph = phone.replace(/[\s-]/g, '')
    if (ph && !/^\+?\d{7,15}$/.test(ph)) return setError('Enter a valid phone number, e.g. +91 98765 43210.')
    if (dob && (dob > format(new Date(), 'yyyy-MM-dd') || dob < '1900-01-02')) return setError('Enter a valid date of birth.')
    const newEmail = email.trim().toLowerCase()
    if (cloud && newEmail !== (s.profile.email ?? '').toLowerCase() && !/^\S+@\S+\.\S+$/.test(newEmail)) return setError('Enter a valid email address.')
    setSaving(true)
    try {
      s.setProfile({ fullName: fullName.trim(), phone: phone.replace(/-/g, ' ').replace(/\s+/g, ' ').trim() || null, dateOfBirth: dob || null, city: city.trim() || null, occupation: occupation.trim() || null })
      if (cloud && supabase && newEmail && newEmail !== (s.profile.email ?? '').toLowerCase()) {
        const { error } = await supabase.auth.updateUser({ email: newEmail }, { emailRedirectTo: EMAIL_CONFIRM_PAGE })
        if (error) throw error
        toast(`Confirm the change using the links sent to ${s.profile.email} and ${newEmail}`)
      } else toast('Profile saved')
      nav(-1)
    } catch (e) { setError((e as Error).message) } finally { setSaving(false) }
  }

  return (
    <Page>
      <PageHeader title="Edit profile" back />
      <div className="space-y-4 px-4">
        <div className="flex flex-col items-center gap-3 py-2">
          <div className="relative">
            <Avatar url={s.profile.avatarUrl} name={fullName} className="size-24 text-3xl" />
            {cloud && (
              <button onClick={() => file.current?.click()} disabled={uploading} aria-label="Change photo"
                className="absolute -bottom-1 -right-1 grid size-9 place-items-center rounded-full border-2 border-background bg-primary text-primary-foreground">
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
              </button>
            )}
          </div>
          <input ref={file} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && onPhoto(e.target.files[0])} />
          {cloud ? (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => file.current?.click()} disabled={uploading}>Change photo</Button>
              {s.profile.avatarUrl && <Button size="sm" variant="ghost" onClick={async () => { await removeOldAvatars(session!.user.id).catch(() => {}); s.setProfile({ avatarUrl: null }); toast('Photo removed') }}><Trash2 />Remove</Button>}
            </div>
          ) : <p className="text-xs text-muted-foreground">Sign in to add a profile photo.</p>}
        </div>

        <Card className="space-y-3 p-4">
          <div><Label htmlFor="ep-name">Full name</Label><Input id="ep-name" autoComplete="name" maxLength={60} value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
          <div><Label htmlFor="ep-dob">Date of birth</Label><Input id="ep-dob" type="date" max={format(new Date(), 'yyyy-MM-dd')} value={dob} onChange={(e) => setDob(e.target.value)} /></div>
          <div><Label htmlFor="ep-phone">Phone</Label><Input id="ep-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+91 98765 43210" maxLength={18} value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="ep-city">City</Label><Input id="ep-city" autoComplete="address-level2" maxLength={80} value={city} onChange={(e) => setCity(e.target.value)} /></div>
            <div><Label htmlFor="ep-occ">Occupation</Label><Input id="ep-occ" maxLength={80} value={occupation} onChange={(e) => setOccupation(e.target.value)} /></div>
          </div>
        </Card>

        {cloud && (
          <Card className="space-y-2 p-4">
            <Label htmlFor="ep-email">Email</Label>
            <Input id="ep-email" type="email" inputMode="email" autoComplete="email" value={email} disabled={googleOnly} onChange={(e) => setEmail(e.target.value)} />
            <p className="text-xs text-muted-foreground">{googleOnly
              ? 'You sign in with Google, so your email comes from your Google account.'
              : 'Changing it sends a confirmation link to both your old and new address. The change takes effect once confirmed.'}</p>
          </Card>
        )}

        {error && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        <Button size="lg" className="w-full" onClick={save} disabled={saving || uploading}>{saving && <Loader2 className="animate-spin" />}Save</Button>
        <p className="text-center text-xs text-muted-foreground">Your details are visible only to you.</p>
      </div>
    </Page>
  )
}
