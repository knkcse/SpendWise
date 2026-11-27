import { useEffect, useState } from 'react'
import { BellRing, CalendarClock } from 'lucide-react'
import { Segmented, Switch } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/toast'
import { useStore } from '@/data/store'
import { getNotifySettings, notificationsSupported, permission, sendTest, setNotifySettings, type NotifySettings, type Permission } from '@/lib/notifications'

/** Budget alerts + payment reminders, shown as rows inside the settings card. */
export function NotificationSettings() {
  const s = useStore(); const toast = useToast()
  const [cfg, setCfg] = useState<NotifySettings>(getNotifySettings)
  const [perm, setPerm] = useState<Permission>('prompt')
  useEffect(() => { void permission().then(setPerm).catch(() => {}) }, [])
  const update = (p: Partial<NotifySettings>) => { const next = { ...cfg, ...p }; setCfg(next); setNotifySettings(next) }
  const test = async () => {
    const ok = await sendTest().catch(() => false)
    setPerm(await permission().catch(() => 'prompt' as Permission))
    toast(ok ? 'Test notification sent' : 'Notifications are blocked. Allow them in Android settings.')
  }

  return (<>
    <div className="flex items-center justify-between gap-3 p-4">
      <div><p className="flex items-center gap-2 text-sm font-medium"><BellRing className="size-4 text-muted-foreground" />Budget alerts</p>
        <p className="mt-0.5 pl-6 text-xs text-muted-foreground">When a budget reaches its alert level or goes over</p></div>
      <Switch checked={s.prefs.budgetAlerts} onCheckedChange={(c) => s.setPrefs({ budgetAlerts: c })} aria-label="Budget alerts" />
    </div>
    <div className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div><p className="flex items-center gap-2 text-sm font-medium"><CalendarClock className="size-4 text-muted-foreground" />Payment reminders</p>
          <p className="mt-0.5 pl-6 text-xs text-muted-foreground">For confirmed recurring payments, at 9 am</p></div>
        <Switch checked={cfg.reminders} onCheckedChange={(c) => update({ reminders: c })} aria-label="Payment reminders" />
      </div>
      {cfg.reminders && <Segmented className="mt-3" value={String(cfg.daysBefore) as '0' | '1' | '3'} onChange={(v) => update({ daysBefore: Number(v) as 0 | 1 | 3 })}
        options={[{ value: '0', label: 'On the day' }, { value: '1', label: '1 day before' }, { value: '3', label: '3 days before' }]} />}
    </div>
    {notificationsSupported ? (
      <div className="flex items-center justify-between gap-3 p-4">
        <p className="text-xs text-muted-foreground">{perm === 'denied' ? 'Notifications are turned off for SpendWise. Turn them on in Android Settings › Apps › SpendWise › Notifications.' : 'Check that notifications reach this phone.'}</p>
        <Button size="sm" variant="secondary" onClick={test}>Send test</Button>
      </div>
    ) : <p className="p-4 text-xs text-muted-foreground">Notifications appear in the Android app only.</p>}
  </>)
}
