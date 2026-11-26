import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { BellRing, CalendarDays, ChevronRight, Cloud, CloudOff, Download, LogOut, RefreshCw, Smartphone as Phone, FolderTree, Moon, Repeat, Smartphone, Trash2, BarChart3 } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Card } from '@/components/ui/card'
import { Confirm, Segmented, Switch } from '@/components/ui/misc'
import { useToast } from '@/components/toast'
import { useStore } from '@/data/store'
import { Avatar } from '@/components/Avatar'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { download, toCSV } from '@/lib/csv'

export default function Profile() {
  const s = useStore()
  const nav = useNavigate(); const toast = useToast()
  const [del, setDel] = useState(false)

  const exportAll = () => {
    const { profile, transactions, categories, sources, budgets, recurring, rules, prefs } = s
    download(`spendwise-backup-${format(new Date(), 'yyyy-MM-dd')}.json`, JSON.stringify({ version: 1, profile, transactions, categories, sources, budgets, recurring, rules, prefs }, null, 2), 'application/json')
    toast('Backup downloaded')
  }

  const links = [
    { to: '/categories', label: 'Categories', icon: FolderTree },
    { to: '/recurring', label: 'Recurring payments', icon: Repeat },
    { to: '/settings/detection', label: 'Payment detection', icon: Smartphone },
    { to: '/reports/weekly', label: 'Weekly report', icon: CalendarDays },
    { to: '/reports/monthly', label: 'Monthly report', icon: BarChart3 },
  ]

  return (
    <div>
      <PageHeader title="Profile & settings" />
      <div className="space-y-4 px-4">
        <Link to="/profile/edit" className="flex items-center gap-3 rounded-2xl border bg-card p-4 active:bg-muted/60">
          <Avatar url={s.profile.avatarUrl} name={s.profile.fullName} className="size-14" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{s.profile.fullName || 'Add your name'}</p>
            <p className="truncate text-xs text-muted-foreground">{s.profile.email ?? 'Device-only mode'}</p>
          </div>
          <span className="text-xs font-medium text-primary">Edit</span>
        </Link>

        <AccountCard />

        <Card className="divide-y">
          {links.map(({ to, label, icon: I }) => (
            <Link key={to} to={to} className="flex items-center gap-3 px-4 py-3.5 text-sm active:bg-muted/60"><I className="size-4 text-muted-foreground" /><span className="flex-1">{label}</span><ChevronRight className="size-4 text-muted-foreground" /></Link>
          ))}
        </Card>

        <Card className="divide-y">
          <div className="p-4"><p className="mb-2 flex items-center gap-2 text-sm font-medium"><Moon className="size-4 text-muted-foreground" />Theme</p>
            <Segmented value={s.prefs.theme} onChange={(theme) => s.setPrefs({ theme })} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'System' }]} /></div>
          <div className="p-4"><p className="mb-2 flex items-center gap-2 text-sm font-medium"><CalendarDays className="size-4 text-muted-foreground" />Week starts on</p>
            <Segmented value={String(s.prefs.weekStartsOn) as '0' | '1'} onChange={(v) => s.setPrefs({ weekStartsOn: Number(v) as 0 | 1 })} options={[{ value: '1', label: 'Monday' }, { value: '0', label: 'Sunday' }]} /></div>
          <div className="flex items-center justify-between p-4"><p className="flex items-center gap-2 text-sm font-medium"><BellRing className="size-4 text-muted-foreground" />Budget alerts</p>
            <Switch checked={s.prefs.budgetAlerts} onCheckedChange={(c) => s.setPrefs({ budgetAlerts: c })} /></div>
        </Card>

        <Card className="divide-y">
          <button onClick={exportAll} className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm"><Download className="size-4 text-muted-foreground" />Download all my data (JSON)</button>
          <button disabled={!s.transactions.length} onClick={() => { download(`spendwise-transactions-${format(new Date(), 'yyyy-MM-dd')}.csv`, toCSV(s.transactions, s.categories, s.sources)); toast('CSV exported') }} className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm disabled:opacity-50"><Download className="size-4 text-muted-foreground" />Export transactions (CSV)</button>
          <button onClick={() => setDel(true)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm text-destructive"><Trash2 className="size-4" />{s.repoKind === 'supabase' ? 'Delete my account and data' : 'Delete all my data'}</button>
        </Card>
        <p className="pb-4 text-center text-xs text-muted-foreground">SpendWise 0.2.0 · Phase 2</p>
      </div>
      <Confirm open={del} onOpenChange={setDel} title="Delete all data?" confirmLabel="Delete everything"
        body={s.repoKind === 'supabase' ? `This permanently deletes your SpendWise account and all ${s.transactions.length} transactions, budgets, categories and settings stored in it.` : `This permanently removes ${s.transactions.length} transactions, your budgets, categories and settings from this device.`}
        onConfirm={async () => {
          if (s.repoKind === 'supabase' && supabase) {
            const { error } = await supabase.rpc('delete_my_account')
            if (error) return toast(`Couldn’t delete account: ${error.message}`)
            await supabase.auth.signOut()
          } else s.resetAll()
          nav('/login', { replace: true })
        }} />
    </div>
  )
}

function AccountCard() {
  const s = useStore()
  const nav = useNavigate()
  if (s.repoKind === 'local') return (
    <Card className="space-y-3 p-4 text-sm">
      <p className="flex items-center gap-2 font-medium"><Phone className="size-4 text-muted-foreground" />Device-only mode</p>
      <p className="text-muted-foreground">Your data is stored only on this phone and isn’t backed up. Sign in or create an account to back it up and use it on other devices; you can bring this data with you.</p>
      {supabase && <Button className="w-full" onClick={() => nav('/login')}>Sign in or create account</Button>}
    </Card>
  )
  const { state, pending, message, lastSyncedAt } = s.sync
  const label = state === 'syncing' ? 'Syncing…' : state === 'offline' ? 'Offline. Changes are saved on this phone and will sync later.'
    : state === 'error' ? `Sync failed: ${message ?? 'unknown error'}. Will retry.` : pending ? 'Changes waiting to sync' : `All changes synced${lastSyncedAt ? ` · ${format(new Date(lastSyncedAt), 'h:mm a')}` : ''}`
  return (
    <Card className="space-y-3 p-4 text-sm">
      <p className="flex items-center gap-2 font-medium">{state === 'offline' || state === 'error' ? <CloudOff className="size-4 text-warning" /> : <Cloud className="size-4 text-primary" />}Signed in as {s.profile.email}</p>
      <p className={`flex items-center gap-2 text-xs ${state === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>{state === 'syncing' && <RefreshCw className="size-3 animate-spin" />}{label}</p>
      <Button variant="outline" className="w-full" onClick={async () => { await supabase?.auth.signOut(); nav('/login', { replace: true }) }}><LogOut />Sign out</Button>
    </Card>
  )
}
