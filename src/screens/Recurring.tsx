import { useState } from 'react'
import { format } from 'date-fns'
import { Check, Pencil, Plus, Repeat, ScanSearch, X } from 'lucide-react'
import { Page, PageHeader } from '@/components/layout/AppShell'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Label, Select } from '@/components/ui/input'
import { Badge, Empty, Sheet } from '@/components/ui/misc'
import { useToast } from '@/components/toast'
import { useLookups, useStore } from '@/data/store'
import { formatINR } from '@/lib/format'
import type { RecurringFreq, RecurringPayment } from '@/lib/types'
import { merchantKey } from '@/lib/utils'

const FREQ: Record<RecurringFreq, string> = { weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' }

export default function Recurring() {
  const { recurring, categories, refreshRecurring, updateRecurring, addRecurring, deleteRecurring } = useStore()
  const { catName } = useLookups()
  const toast = useToast()
  const [edit, setEdit] = useState<Partial<RecurringPayment> | null>(null)
  const suggested = recurring.filter((r) => r.state === 'suggested')
  const confirmed = recurring.filter((r) => r.state === 'confirmed').sort((a, b) => (a.nextExpectedAt ?? '').localeCompare(b.nextExpectedAt ?? ''))
  const monthly = confirmed.reduce((a, r) => a + r.expectedAmount * ({ weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 }[r.frequency]), 0)

  const save = () => {
    if (!edit?.merchantName?.trim() || !(Number(edit.expectedAmount) > 0)) return toast('Enter a name and amount')
    const data = { ...edit, merchantName: edit.merchantName.trim(), expectedAmount: Number(edit.expectedAmount) }
    if (edit.id) updateRecurring(edit.id, data)
    else addRecurring({ merchantKey: merchantKey(data.merchantName), merchantName: data.merchantName, expectedAmount: data.expectedAmount, frequency: edit.frequency ?? 'monthly',
      categoryId: edit.categoryId ?? null, lastPaidAt: null, nextExpectedAt: edit.nextExpectedAt ?? null, occurrences: 0, state: 'confirmed' })
    setEdit(null); toast('Saved')
  }

  const Row = ({ r }: { r: RecurringPayment }) => (
    <div className="px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-accent text-accent-foreground"><Repeat className="size-4" /></span>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{r.merchantName}</p>
          <p className="text-xs text-muted-foreground">{FREQ[r.frequency]} · {catName(r.categoryId)}{r.occurrences ? ` · seen ${r.occurrences}×` : ''}</p></div>
        <div className="text-right"><p className="text-sm font-semibold">{formatINR(r.expectedAmount)}</p>
          {r.nextExpectedAt && <p className="text-[11px] text-muted-foreground">Next {format(new Date(r.nextExpectedAt), 'd MMM')}</p>}</div>
      </div>
      <div className="mt-2 flex justify-end gap-1">
        {r.state === 'suggested' ? (<>
          <Button size="sm" variant="ghost" onClick={() => updateRecurring(r.id, { state: 'rejected' })}><X />Not recurring</Button>
          <Button size="sm" variant="secondary" onClick={() => setEdit(r)}><Pencil />Edit</Button>
          <Button size="sm" onClick={() => { updateRecurring(r.id, { state: 'confirmed' }); toast('Confirmed') }}><Check />Confirm</Button>
        </>) : (<>
          <Button size="sm" variant="ghost" onClick={() => setEdit(r)}><Pencil />Edit</Button>
          <Button size="sm" variant="ghost" onClick={() => { deleteRecurring(r.id); toast('Removed') }}><X />Remove</Button>
        </>)}
      </div>
    </div>
  )

  return (
    <Page>
      <PageHeader title="Recurring payments" subtitle={confirmed.length ? `About ${formatINR(Math.round(monthly))} a month across ${confirmed.length}` : undefined} back
        right={<Button size="icon" variant="ghost" aria-label="Add" onClick={() => setEdit({ frequency: 'monthly' })}><Plus /></Button>} />
      <div className="space-y-4 px-4">
        <Button variant="outline" className="w-full" onClick={() => { refreshRecurring(); toast('Scanned your transactions') }}><ScanSearch />Scan transactions for patterns</Button>
        <p className="text-xs text-muted-foreground">A payment is suggested only after 3+ payments to the same merchant with similar amounts at regular intervals. Nothing counts as a subscription until you confirm it.</p>

        {suggested.length > 0 && (<>
          <p className="px-1 text-xs font-medium text-muted-foreground">Suggested <Badge tone="primary" className="ml-1">{suggested.length}</Badge></p>
          <Card className="divide-y">{suggested.map((r) => <Row key={r.id} r={r} />)}</Card>
        </>)}

        <p className="px-1 text-xs font-medium text-muted-foreground">Confirmed</p>
        {confirmed.length ? <Card className="divide-y">{confirmed.map((r) => <Row key={r.id} r={r} />)}</Card>
          : <Card><Empty icon={<Repeat />} title="No recurring payments yet" body="Scan your transactions or add one manually, like Netflix or rent." /></Card>}
      </div>

      <Sheet open={!!edit} onOpenChange={(o) => !o && setEdit(null)} title={edit?.id ? 'Edit recurring payment' : 'Add recurring payment'}>
        {edit && (
          <div className="space-y-3">
            <div><Label htmlFor="rn">Merchant</Label><Input id="rn" value={edit.merchantName ?? ''} onChange={(e) => setEdit({ ...edit, merchantName: e.target.value })} placeholder="e.g. Netflix" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="ra">Amount (₹)</Label><Input id="ra" type="number" inputMode="decimal" value={edit.expectedAmount ?? ''} onChange={(e) => setEdit({ ...edit, expectedAmount: e.target.value as unknown as number })} /></div>
              <div><Label>Frequency</Label><Select value={edit.frequency ?? 'monthly'} onChange={(e) => setEdit({ ...edit, frequency: e.target.value as RecurringFreq })}>
                {Object.entries(FREQ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></div>
            </div>
            <div><Label>Category</Label><Select value={edit.categoryId ?? ''} onChange={(e) => setEdit({ ...edit, categoryId: e.target.value || null })}>
              <option value="">None</option>{categories.filter((c) => !c.parentId && !c.isIncome).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
            <div><Label htmlFor="rd">Next expected date</Label><Input id="rd" type="date" value={edit.nextExpectedAt?.slice(0, 10) ?? ''} onChange={(e) => setEdit({ ...edit, nextExpectedAt: e.target.value ? new Date(e.target.value + 'T09:00').toISOString() : null })} /></div>
            <Button className="w-full" onClick={save}>Save</Button>
          </div>
        )}
      </Sheet>
    </Page>
  )
}
