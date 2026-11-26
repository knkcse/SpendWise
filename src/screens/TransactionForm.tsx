import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Plus, Sparkles, Trash2 } from 'lucide-react'
import { Page, PageHeader } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Label, Select, Textarea } from '@/components/ui/input'
import { Segmented, Switch } from '@/components/ui/misc'
import { useToast } from '@/components/toast'
import { useLookups, useStore } from '@/data/store'
import { suggestCategory } from '@/lib/categorize'
import { toLocalInput } from '@/lib/dates'
import { PAYMENT_METHOD_LABELS } from '@/lib/defaults'
import { formatINR } from '@/lib/format'
import type { PaymentMethod, Split, Transaction, TxnScope, TxnType } from '@/lib/types'
import { round2 } from '@/lib/analytics'
import { uid } from '@/lib/utils'

/** Add Expense and Edit Expense share this screen. */
export default function TransactionForm({ mode }: { mode: 'add' | 'edit' }) {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const store = useStore()
  const { catName } = useLookups()
  const existing = mode === 'edit' ? store.transactions.find((t) => t.id === id) : undefined

  const [type, setType] = useState<TxnType>(existing?.type ?? 'debit')
  const [amount, setAmount] = useState(existing ? String(existing.amount) : '')
  const [merchant, setMerchant] = useState(existing?.merchantName ?? '')
  const [when, setWhen] = useState(toLocalInput(existing?.occurredAt ?? new Date().toISOString()))
  const [method, setMethod] = useState<PaymentMethod>(existing?.paymentMethod ?? 'upi')
  const [sourceId, setSourceId] = useState(existing?.paymentSourceId ?? '')
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? '')
  const [subcategoryId, setSubcategoryId] = useState(existing?.subcategoryId ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [reference, setReference] = useState(existing?.transactionReference ?? '')
  const [scope, setScope] = useState<TxnScope>(existing?.scope ?? 'personal')
  const [excluded, setExcluded] = useState(existing?.excludeFromReports ?? false)
  const [splits, setSplits] = useState<Split[]>(existing?.splits ?? [])
  const [error, setError] = useState('')

  const topCats = store.categories.filter((c) => !c.parentId && c.isIncome === (type === 'credit'))
  const subCats = store.categories.filter((c) => c.parentId && c.parentId === categoryId)
  const amt = Number(amount)
  const splitTotal = round2(splits.reduce((a, s) => a + (Number(s.amount) || 0), 0))
  const suggestion = useMemo(() => (!categoryId && merchant.trim().length > 2 && type === 'debit' ? suggestCategory(merchant, description, store.rules, store.categories) : null), [merchant, description, categoryId, type, store.rules, store.categories])

  if (mode === 'edit' && !existing) return <Page><PageHeader title="Not found" back /><p className="px-4 text-sm text-muted-foreground">This transaction no longer exists.</p></Page>

  const save = () => {
    setError('')
    if (!(amt > 0) || amt >= 1e8) return setError('Enter an amount greater than ₹0.')
    if (!merchant.trim()) return setError(type === 'credit' ? 'Enter who paid you.' : 'Enter a merchant or recipient name.')
    if (!when || isNaN(+new Date(when))) return setError('Pick a valid date and time.')
    if (splits.length) {
      if (splits.some((s) => !(s.amount > 0) || !s.categoryId)) return setError('Each split needs a category and an amount.')
      if (Math.abs(splitTotal - amt) > 0.009) return setError(`Splits add up to ${formatINR(splitTotal)}, but the amount is ${formatINR(amt)}.`)
    }
    const data = {
      type, amount: round2(amt), merchantName: merchant.trim(), occurredAt: new Date(when).toISOString(), paymentMethod: method,
      paymentSourceId: sourceId || null, categoryId: splits.length ? null : categoryId || null, subcategoryId: splits.length ? null : subcategoryId || null,
      description: description.trim() || undefined, notes: notes.trim() || undefined, transactionReference: reference.trim() || undefined,
      scope, excludeFromReports: excluded, splits,
    }
    if (existing) {
      const status: Transaction['status'] = data.categoryId || splits.length || type === 'credit' ? 'confirmed' : existing.status
      store.updateTransaction(existing.id, { ...data, status })
      toast('Transaction updated'); nav(-1)
    } else {
      const r = store.addTransaction({ ...data, origin: 'manual', status: 'confirmed' })
      if (!r.ok) return setError('This looks like a duplicate of an existing transaction.')
      toast(r.txn.status === 'needs_review' ? 'Saved. Pick a category when you can.' : 'Expense added')
      nav(`/transactions/${r.txn.id}`, { replace: true })
    }
  }

  return (
    <Page>
      <PageHeader title={mode === 'add' ? 'Add transaction' : 'Edit transaction'} back />
      <div className="space-y-4 px-4">
        <Segmented value={type} onChange={(v) => { setType(v); setCategoryId(''); setSubcategoryId(''); setSplits([]) }} options={[{ value: 'debit', label: 'Expense' }, { value: 'credit', label: 'Income' }]} />

        <div className="py-2 text-center">
          <Label htmlFor="amt" className="text-center">Amount</Label>
          <div className="flex items-center justify-center gap-1 text-4xl font-semibold">
            <span className="text-muted-foreground">₹</span>
            <input id="amt" autoFocus={mode === 'add'} inputMode="decimal" placeholder="0" value={amount}
              onChange={(e) => /^\d*\.?\d{0,2}$/.test(e.target.value) && setAmount(e.target.value)}
              className="w-48 bg-transparent text-center outline-none placeholder:text-muted-foreground/40" />
          </div>
        </div>

        <Card className="space-y-3 p-4">
          <div><Label htmlFor="mer">{type === 'credit' ? 'From' : 'Merchant / recipient'}</Label>
            <Input id="mer" value={merchant} maxLength={120} onChange={(e) => setMerchant(e.target.value)} placeholder={type === 'credit' ? 'e.g. Employer' : 'e.g. Swiggy'} /></div>
          <div><Label htmlFor="when">Date & time</Label><Input id="when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="method">Payment method</Label>
              <Select id="method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></div>
            <div><Label htmlFor="src">Payment app</Label>
              <Select id="src" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                <option value="">None</option>{store.sources.map((s) => <option key={s.id} value={s.id}>{s.displayName}</option>)}</Select></div>
          </div>
        </Card>

        <Card className="space-y-3 p-4">
          {!splits.length ? (<>
            <div><Label htmlFor="cat">Category</Label>
              <Select id="cat" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setSubcategoryId('') }}>
                <option value="">{type === 'debit' ? 'Auto-suggest / Needs review' : 'Choose'}</option>
                {topCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
              {suggestion?.categoryId && (
                <button onClick={() => setCategoryId(suggestion.categoryId!)} className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
                  <Sparkles className="size-3.5" />Suggested: {catName(suggestion.categoryId)}{suggestion.reason === 'learned' && ' (from your past edits)'}
                </button>
              )}
            </div>
            {subCats.length > 0 && (
              <div><Label htmlFor="sub">Subcategory</Label>
                <Select id="sub" value={subcategoryId} onChange={(e) => setSubcategoryId(e.target.value)}>
                  <option value="">None</option>{subCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
            )}
          </>) : (
            <div>
              <div className="mb-2 flex justify-between text-xs"><span className="font-medium text-muted-foreground">Split across categories</span>
                <span className={Math.abs(splitTotal - amt) > 0.009 ? 'text-destructive' : 'text-success'}>{formatINR(splitTotal)} / {formatINR(amt || 0)}</span></div>
              <div className="space-y-2">
                {splits.map((s, i) => (
                  <div key={s.id} className="flex gap-2">
                    <Select className="flex-1" value={s.categoryId ?? ''} onChange={(e) => setSplits(splits.map((x, j) => (j === i ? { ...x, categoryId: e.target.value || null } : x)))}>
                      <option value="">Category</option>{topCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
                    <Input className="w-28" inputMode="decimal" type="number" min={0} value={s.amount || ''} placeholder="₹"
                      onChange={(e) => setSplits(splits.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) } : x)))} />
                    <Button size="icon" variant="ghost" className="h-11 w-11" aria-label="Remove split" onClick={() => setSplits(splits.filter((_, j) => j !== i))}><Trash2 /></Button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {type === 'debit' && (
            <Button variant="outline" size="sm" className="w-full" onClick={() => {
              const rest = round2(Math.max(0, (amt || 0) - splitTotal))
              setSplits(splits.length ? [...splits, { id: uid(), categoryId: null, amount: rest }]
                : [{ id: uid(), categoryId: categoryId || null, amount: rest }, { id: uid(), categoryId: null, amount: 0 }])
            }}><Plus />{splits.length ? 'Add another split' : 'Split into multiple categories'}</Button>
          )}
        </Card>

        <Card className="space-y-3 p-4">
          <div><Label htmlFor="desc">Description</Label><Input id="desc" maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What was it for?" /></div>
          <div><Label htmlFor="notes">Notes</Label><Textarea id="notes" maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <div><Label htmlFor="ref">Transaction reference (UPI / UTR)</Label><Input id="ref" maxLength={64} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" /></div>
        </Card>

        <Card className="divide-y">
          <div className="flex items-center justify-between p-4"><div><p className="text-sm font-medium">Business expense</p><p className="text-xs text-muted-foreground">Otherwise marked personal</p></div>
            <Switch checked={scope === 'business'} onCheckedChange={(c) => setScope(c ? 'business' : 'personal')} /></div>
          <div className="flex items-center justify-between p-4"><div><p className="text-sm font-medium">Exclude from reports</p><p className="text-xs text-muted-foreground">e.g. transfers to your own account</p></div>
            <Switch checked={excluded} onCheckedChange={setExcluded} /></div>
        </Card>

        {error && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        <Button size="lg" className="w-full" onClick={save}>{mode === 'add' ? 'Save' : 'Save changes'}</Button>
      </div>
    </Page>
  )
}
