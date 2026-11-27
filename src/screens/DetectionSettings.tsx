import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BellRing, CalendarClock, Check, CircleAlert, Copy, Info, Lock, MessageSquareText, ShieldCheck, Smartphone, Trash2, X } from 'lucide-react'
import { App as CapApp } from '@capacitor/app'
import { Page, PageHeader } from '@/components/layout/AppShell'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { Badge, Switch } from '@/components/ui/misc'
import { useToast } from '@/components/toast'
import { useStore } from '@/data/store'
import { platform } from '@/lib/platform'
import { formatINR } from '@/lib/format'
import { parseNotification, type Parsed } from '@/lib/detect/parse'
import { appendLog, clearLog, plan, readLog, type LogEntry } from '@/lib/detect/ingest'
import { detectionAvailable, PaymentDetection, type DetectionStatus } from '@/lib/detect/plugin'

const ICON: Record<LogEntry['kind'], JSX.Element> = {
  recorded: <Check className="size-4 text-success" />, duplicate: <Copy className="size-4 text-muted-foreground" />,
  upcoming: <CalendarClock className="size-4 text-warning" />, ignored: <X className="size-4 text-muted-foreground" />,
  unknown: <CircleAlert className="size-4 text-destructive" />,
}
const LABEL: Record<string, string> = { bank: 'Bank SMS', gpay: 'Google Pay', phonepe: 'PhonePe', paytm: 'Paytm', cred: 'CRED' }

export default function DetectionSettings() {
  const { sources, prefs, setPrefs, setSource } = useStore()
  const toast = useToast()
  const available = detectionAvailable()
  const [st, setSt] = useState<DetectionStatus | null>(null)
  const [log, setLog] = useState<LogEntry[]>(readLog)
  const refresh = useCallback(() => { if (available) void PaymentDetection.status().then(setSt).catch(() => {}); setLog(readLog()) }, [available])
  useEffect(() => {
    refresh()
    const on = () => setLog(readLog())
    window.addEventListener('spendwise:detection', on)
    const h = available ? CapApp.addListener('appStateChange', (x) => { if (x.isActive) refresh() }) : null
    return () => { window.removeEventListener('spendwise:detection', on); void h?.then((x) => x.remove()) }
  }, [available, refresh])

  const detectable = sources.filter((s) => s.code !== 'cash' && s.code !== 'card')
  const granted = !!st?.accessGranted
  const lite = st?.listenerInBuild === false
  const on = prefs.detectionEnabled && granted

  return (
    <Page>
      <PageHeader title="Payment detection" subtitle="Adds payments from your bank SMS automatically" back />
      <div className="space-y-4 px-4">
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground"><Smartphone className="size-5" /></span>
            <div className="flex-1 text-sm">
              <div className="flex items-center gap-2"><p className="font-medium">Status</p>
                {!available ? <Badge tone="warning">Not available here</Badge> : lite ? <Badge>Share to add</Badge> : on ? <Badge tone="success">On</Badge> : granted ? <Badge>Off</Badge> : <Badge tone="warning">Needs access</Badge>}</div>
              <p className="mt-1 text-muted-foreground">
                {platform === 'ios' ? 'iOS doesn’t let apps read notifications. On iPhone, add expenses manually or import a CSV.'
                  : !available ? 'Detection works only in the SpendWise Android app.'
                  : lite ? 'This version doesn’t read notifications, so it installs on phones whose work policy blocks that. To add a payment: in your Messages app, long-press the bank SMS › Share › SpendWise. It’s read and added straight away.'
                  : on ? 'New bank messages are added to Transactions as they arrive. If the app is closed, they’re added the next time you open it.'
                  : granted ? 'Notification access is allowed. Turn on “Automatic detection” below.'
                  : 'Step 1: allow SpendWise to read notifications. Android shows a warning; that is normal for this permission.'}
              </p>
            </div>
          </div>
          {available && !lite && !granted && (<>
            <Button className="mt-4 w-full" onClick={() => void PaymentDetection.openAccessSettings()}><BellRing />Allow notification access</Button>
            <p className="mt-3 text-xs text-muted-foreground">If the SpendWise switch is greyed out or says “Restricted setting”, tap below, then the ⋮ menu (top right) › <b>Allow restricted settings</b>, and come back.</p>
            <Button variant="outline" className="mt-2 w-full" onClick={() => void PaymentDetection.openAppSettings()}>Open SpendWise app info</Button>
          </>)}
          {available && st && st.pending > 0 && <p className="mt-3 text-xs text-muted-foreground">{st.pending} message{st.pending === 1 ? '' : 's'} waiting to be read.</p>}
        </Card>

        {!lite && <Card className="divide-y">
          <div className="flex items-center justify-between gap-3 p-4">
            <div><p className="text-sm font-medium">Automatic detection</p><p className="text-xs text-muted-foreground">Master switch. Turn off anytime.</p></div>
            <Switch checked={prefs.detectionEnabled} onCheckedChange={(c) => { setPrefs({ detectionEnabled: c }); setTimeout(refresh, 300) }} disabled={!available && !prefs.detectionEnabled} aria-label="Automatic detection" />
          </div>
          {detectable.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 p-4">
              <div><p className="text-sm font-medium">{LABEL[s.code] ?? s.displayName}</p>
                <p className="text-xs text-muted-foreground">{s.code === 'bank' ? 'Bank messages in your SMS app (Google Messages, Samsung, Xiaomi and others)' : 'App notifications. Formats not added yet; bank SMS covers these payments.'}</p></div>
              <Switch checked={s.detectionEnabled} onCheckedChange={(c) => setSource(s.id, { detectionEnabled: c })} aria-label={`Detect ${LABEL[s.code] ?? s.displayName}`} />
            </div>
          ))}
        </Card>}

        <Card>
          <div className="flex items-center justify-between px-4 pt-4"><p className="text-sm font-medium">Recent activity</p>
            {log.length > 0 && <button className="flex items-center gap-1 text-xs text-muted-foreground" onClick={clearLog}><Trash2 className="size-3.5" />Clear</button>}</div>
          {log.length ? <div className="divide-y">{log.map((l, i) => (
            <div key={i} className="flex gap-3 px-4 py-3">
              <span className="mt-0.5">{ICON[l.kind]}</span>
              <div className="min-w-0 flex-1 text-sm">
                <p className="truncate font-medium">{l.title}</p>
                <p className="text-xs text-muted-foreground">{l.detail} · {new Date(l.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p>
                {l.masked && (<>
                  <p className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-muted p-2 text-xs">{l.masked}</p>
                  <button className="mt-1 text-xs font-medium text-primary" onClick={() => void navigator.clipboard?.writeText(l.masked!).then(() => toast('Copied. Send it to add this format.'), () => toast('Couldn’t copy'))}>Copy to share</button>
                </>)}
              </div>
            </div>))}</div>
            : <p className="px-4 pb-4 pt-2 text-xs text-muted-foreground">Nothing yet. Detected, skipped and unreadable messages appear here.</p>}
          <p className="px-4 pb-4 text-xs text-muted-foreground">Added payments are in <Link to="/transactions" className="font-medium text-primary">Transactions</Link>.</p>
        </Card>

        <TryMessage />

        <Card className="space-y-3 p-4 text-sm">
          <p className="flex items-center gap-2 font-medium"><ShieldCheck className="size-4 text-primary" />Privacy</p>
          <ul className="space-y-2 text-muted-foreground">
            <li className="flex gap-2"><Lock className="mt-0.5 size-3.5 shrink-0" />Only notifications from your SMS app and the apps switched on above are looked at. Everything else is ignored without being read.</li>
            <li className="flex gap-2"><Lock className="mt-0.5 size-3.5 shrink-0" />Messages that give an OTP, PIN, password or verification code are dropped immediately. Messages that don’t mention an amount are ignored.</li>
            <li className="flex gap-2"><Lock className="mt-0.5 size-3.5 shrink-0" />Everything is read on this phone. A payment message waits in SpendWise’s private storage only until the app reads it, then it’s deleted. Only amount, payee, time, bank, last digits of the account and reference number are saved.</li>
            <li className="flex gap-2"><Info className="mt-0.5 size-3.5 shrink-0" />Failed, refunded, upcoming (e-mandate), bill-due and promotional messages are not recorded. A message SpendWise can’t read is kept here with its numbers masked, so you can share it.</li>
          </ul>
        </Card>
      </div>
    </Page>
  )
}

/** Paste any bank message to see what SpendWise would do with it. Nothing is saved. */
function TryMessage() {
  const store = useStore(); const toast = useToast()
  const [text, setText] = useState('')
  const [res, setRes] = useState<Parsed | null>(null)
  const describe = (p: Parsed) => p.kind === 'payment'
    ? `${p.type === 'debit' ? 'Expense' : 'Income'} ${formatINR(p.amount)} · ${p.merchant} · ${new Date(p.occurredAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · ${p.method.replace('_', ' ')}${p.bank ? ` · ${p.bank}` : ''}${p.reference ? ` · Ref ${p.reference}` : ''}${p.exact ? '' : ' (generic reader, will be marked for review)'}`
    : p.kind === 'upcoming' ? `Upcoming: ${formatINR(p.amount)} to ${p.merchant} on ${new Date(p.dueAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}. Not recorded.`
    : p.kind === 'ignored' ? `Skipped: ${p.reason}` : 'Couldn’t read this message'
  return (
    <Card className="space-y-3 p-4">
      <p className="flex items-center gap-2 text-sm font-medium"><MessageSquareText className="size-4 text-muted-foreground" />Check a message</p>
      <p className="text-xs text-muted-foreground">Copy a bank SMS from your Messages app and paste it here to see how SpendWise reads it. Nothing is saved unless you tap “Add”.</p>
      <Textarea rows={4} value={text} onChange={(e) => { setText(e.target.value); setRes(null) }} placeholder="Sent Rs.338.00 From HDFC Bank A/C …" aria-label="Bank message" />
      <Button variant="secondary" className="w-full" disabled={!text.trim()} onClick={() => setRes(parseNotification({ id: 'try', pkg: 'com.google.android.apps.messaging', title: '', text, postedAt: Date.now() }))}>Check</Button>
      {res && <p className={`rounded-lg p-3 text-sm ${res.kind === 'payment' ? 'bg-success/10' : res.kind === 'unknown' ? 'bg-destructive/10' : 'bg-muted'}`}>{describe(res)}</p>}
      {res?.kind === 'payment' && <Button className="w-full" onClick={() => {
        const { add, log } = plan([{ id: `paste-${Date.now()}`, pkg: 'share', title: 'Pasted message', text, postedAt: Date.now() }], store.transactions, store.sources)
        if (add.length) store.importTransactions(add)
        appendLog(log); toast(add.length ? `Added ${log[0].title}` : `${log[0].title}: ${log[0].detail.toLowerCase()}`); setText(''); setRes(null)
      }}>Add to transactions</Button>}
    </Card>
  )
}
