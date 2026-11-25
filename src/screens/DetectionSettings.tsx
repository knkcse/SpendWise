import { BellRing, Info, Lock, ShieldCheck, Smartphone } from 'lucide-react'
import { Page, PageHeader } from '@/components/layout/AppShell'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge, Switch } from '@/components/ui/misc'
import { useStore } from '@/data/store'
import { detectionSupported, platform } from '@/lib/platform'

export default function DetectionSettings() {
  const { sources, prefs, setPrefs, setSource } = useStore()
  const detectable = sources.filter((s) => s.code !== 'cash' && s.code !== 'card')

  return (
    <Page>
      <PageHeader title="Payment detection" subtitle="Automatic capture from payment notifications" back />
      <div className="space-y-4 px-4">
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground"><Smartphone className="size-5" /></span>
            <div className="flex-1 text-sm">
              <div className="flex items-center gap-2"><p className="font-medium">Status</p>
                {detectionSupported ? <Badge tone="primary">Available</Badge> : <Badge tone="warning">Not available here</Badge>}</div>
              <p className="mt-1 text-muted-foreground">
                {platform === 'ios' ? 'iOS doesn’t let apps read other apps’ notifications. On iPhone, add expenses manually or import a CSV.'
                  : detectionSupported ? 'SpendWise reads notifications from the apps you enable below, on this phone only.'
                  : platform === 'android' ? 'The native detection module is not in this build yet. It is being built in Phase 7 and must be tested on a real phone before it’s switched on.'
                  : 'You’re using SpendWise in a browser. Notification detection only works in the Android app, and is being built in Phase 7.'}
              </p>
            </div>
          </div>
          <Button className="mt-4 w-full" disabled={!detectionSupported}><BellRing />Grant notification access</Button>
        </Card>

        <Card className="divide-y">
          <div className="flex items-center justify-between p-4">
            <div><p className="text-sm font-medium">Automatic detection</p><p className="text-xs text-muted-foreground">Master switch. Turn off anytime.</p></div>
            <Switch checked={prefs.detectionEnabled} onCheckedChange={(c) => setPrefs({ detectionEnabled: c })} disabled={!detectionSupported && !prefs.detectionEnabled} />
          </div>
          {detectable.map((s) => (
            <div key={s.id} className="flex items-center justify-between p-4">
              <div><p className="text-sm font-medium">{s.displayName}</p><p className="text-xs text-muted-foreground">{s.androidPackage ?? 'Bank app notifications (added per bank)'}</p></div>
              <Switch checked={s.detectionEnabled} onCheckedChange={(c) => setSource(s.id, { detectionEnabled: c })} aria-label={`Detect ${s.displayName}`} />
            </div>
          ))}
        </Card>
        <p className="text-xs text-muted-foreground">Your per-app choices are saved now and will be used by the Android listener once it ships.</p>

        <Card className="space-y-3 p-4 text-sm">
          <p className="flex items-center gap-2 font-medium"><ShieldCheck className="size-4 text-primary" />Privacy</p>
          <ul className="space-y-2 text-muted-foreground">
            <li className="flex gap-2"><Lock className="mt-0.5 size-3.5 shrink-0" />Only notifications from the apps switched on above are looked at. Everything else is ignored without being read.</li>
            <li className="flex gap-2"><Lock className="mt-0.5 size-3.5 shrink-0" />Any notification mentioning an OTP, password, PIN or verification code is dropped immediately.</li>
            <li className="flex gap-2"><Lock className="mt-0.5 size-3.5 shrink-0" />Notification text is parsed on your phone. Only amount, merchant, time, app and reference number are saved, never the full message.</li>
            <li className="flex gap-2"><Info className="mt-0.5 size-3.5 shrink-0" />Failed, pending, refund-request and promotional notifications are skipped.</li>
          </ul>
        </Card>
      </div>
    </Page>
  )
}
