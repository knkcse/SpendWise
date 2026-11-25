import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { BellRing, CalendarDays, ChevronRight, Database, Download, FolderTree, Moon, Repeat, Smartphone, Trash2, BarChart3 } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Card } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { Confirm, Segmented, Switch } from '@/components/ui/misc'
import { useToast } from '@/components/toast'
import { useStore } from '@/data/store'
import { download, toCSV } from '@/lib/csv'

export default function Profile() {
  const s = useStore()
  const nav = useNavigate(); const toast = useToast()
  const [name, setName] = useState(s.profile.fullName)
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
        <Card className="flex items-center gap-3 p-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">{(s.profile.fullName || 'S')[0].toUpperCase()}</span>
          <div className="min-w-0 flex-1">
            <Label htmlFor="pname" className="mb-1">Name</Label>
            <Input id="pname" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== s.profile.fullName && (s.setProfile({ fullName: name.trim() }), toast('Name updated'))} className="h-9" />
          </div>
        </Card>

        <Card className="flex items-start gap-3 p-4 text-sm">
          <Database className="mt-0.5 size-4 shrink-0 text-primary" />
          <p className="text-muted-foreground">{s.repoKind === 'local'
            ? 'Your data is stored only on this device. Cloud sync and sign-in arrive in Phase 2. Download a backup to keep a copy.'
            : `Signed in as ${s.profile.email}. Data syncs securely to your account.`}</p>
        </Card>

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
          <button onClick={() => setDel(true)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm text-destructive"><Trash2 className="size-4" />Delete all my data</button>
        </Card>
        <p className="pb-4 text-center text-xs text-muted-foreground">SpendWise 0.1.0 · Phase 1</p>
      </div>
      <Confirm open={del} onOpenChange={setDel} title="Delete all data?" confirmLabel="Delete everything"
        body={`This permanently removes ${s.transactions.length} transactions, your budgets, categories and settings from this device.`}
        onConfirm={() => { s.resetAll(); nav('/login', { replace: true }) }} />
    </div>
  )
}
