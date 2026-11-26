import { useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { Download, EyeOff, ListFilter, Receipt, Search, Tags, Trash2, Upload, X } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Label, Select } from '@/components/ui/input'
import { Badge, Confirm, Empty, Sheet } from '@/components/ui/misc'
import { DateFilter, useDateFilter } from '@/components/DateFilter'
import { TxnRow } from '@/components/TxnRow'
import { Fab } from './Dashboard'
import { PullToRefresh } from '@/components/PullToRefresh'
import { useStore } from '@/data/store'
import { inRange, round2 } from '@/lib/analytics'
import { ExportSheet } from '@/components/ExportSheet'
import { formatINR } from '@/lib/format'
import { PAYMENT_METHOD_LABELS } from '@/lib/defaults'
import type { PaymentMethod, Transaction } from '@/lib/types'
import { useToast } from '@/components/toast'

type Sort = 'latest' | 'oldest' | 'highest' | 'lowest'
interface Filters { categoryId: string; sourceId: string; method: '' | PaymentMethod; merchant: string; min: string; max: string; type: '' | 'debit' | 'credit'; status: '' | 'needs_review' }
const EMPTY: Filters = { categoryId: '', sourceId: '', method: '', merchant: '', min: '', max: '', type: '', status: '' }

export default function Transactions() {
  const { transactions, categories, sources, prefs, bulkUpdate, bulkDelete } = useStore()
  const toast = useToast()
  const [params] = useSearchParams()
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<Sort>('latest')
  const [filters, setFilters] = useState<Filters>({ ...EMPTY, status: params.get('status') === 'needs_review' ? 'needs_review' : '' })
  const [open, setOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(params.get('export') === '1')
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkCat, setBulkCat] = useState(false)
  const [bulkDel, setBulkDel] = useState(false)
  // The finger lifting after a long press lands as a click on the row (now a checkbox); swallow that one click.
  const swallowClick = useRef(false)
  const startSelectWith = (id: string) => {
    setSelecting(true); setSelected(new Set([id])); swallowClick.current = true
    window.addEventListener('pointerup', () => window.setTimeout(() => { swallowClick.current = false }, 400), { once: true })
  }
  const toggle = (id: string) => { if (swallowClick.current) { swallowClick.current = false; return } setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n }) }
  const endSelect = () => { setSelecting(false); setSelected(new Set()) }
  const f = useDateFilter('all', prefs.weekStartsOn)

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const min = filters.min ? Number(filters.min) : -Infinity; const max = filters.max ? Number(filters.max) : Infinity
    const out = transactions.filter((t) =>
      inRange(t, f.range) &&
      (!needle || [t.merchantName, t.description, t.notes, t.transactionReference].some((x) => x?.toLowerCase().includes(needle))) &&
      (!filters.categoryId || t.categoryId === filters.categoryId || t.splits.some((s) => s.categoryId === filters.categoryId)) &&
      (!filters.sourceId || t.paymentSourceId === filters.sourceId) &&
      (!filters.method || t.paymentMethod === filters.method) &&
      (!filters.merchant || t.merchantName === filters.merchant) &&
      (!filters.type || t.type === filters.type) &&
      (!filters.status || t.status === filters.status) &&
      t.amount >= min && t.amount <= max)
    const cmp: Record<Sort, (a: Transaction, b: Transaction) => number> = {
      latest: (a, b) => b.occurredAt.localeCompare(a.occurredAt), oldest: (a, b) => a.occurredAt.localeCompare(b.occurredAt),
      highest: (a, b) => b.amount - a.amount, lowest: (a, b) => a.amount - b.amount,
    }
    return out.sort(cmp[sort])
  }, [transactions, q, sort, filters, f.range.from.getTime(), f.range.to.getTime()]) // eslint-disable-line react-hooks/exhaustive-deps

  const active = Object.values(filters).filter(Boolean).length
  const total = round2(list.filter((t) => t.type === 'debit' && !t.excludeFromReports).reduce((a, t) => a + t.amount, 0))
  const merchants = useMemo(() => [...new Set(transactions.map((t) => t.merchantName))].sort(), [transactions])
  const groups = useMemo(() => {
    if (sort !== 'latest' && sort !== 'oldest') return [{ day: '', items: list }]
    const g: Array<{ day: string; items: Transaction[] }> = []
    for (const t of list) {
      const day = format(new Date(t.occurredAt), 'EEEE, d MMM yyyy')
      if (g[g.length - 1]?.day === day) g[g.length - 1].items.push(t); else g.push({ day, items: [t] })
    }
    return g
  }, [list, sort])

  return (
    <PullToRefresh><div>
      <PageHeader title="Transactions" subtitle={`${list.length} shown · ${formatINR(total)} spent`}
        right={selecting ? <Button size="sm" variant="ghost" onClick={endSelect}>Done</Button> : <>
          <Button size="sm" variant="ghost" onClick={() => setSelecting(true)} disabled={!list.length}>Select</Button>
          <Button size="icon" variant="ghost" asChild aria-label="Import CSV"><Link to="/transactions/import"><Upload /></Link></Button>
          <Button size="icon" variant="ghost" aria-label="Export" onClick={() => setExportOpen(true)} disabled={!list.length}><Download /></Button>
        </>} />

      <div className="flex gap-2 px-4">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search merchant, notes, reference" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button variant="outline" size="icon" className="relative h-11 w-11" onClick={() => setOpen(true)} aria-label="Filters">
          <ListFilter />{active > 0 && <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-primary text-[10px] text-primary-foreground">{active}</span>}
        </Button>
      </div>
      <div className="mt-3"><DateFilter f={f} presets={['all', 'today', 'yesterday', 'week', 'month', 'prev_month', 'custom']} /></div>
      {filters.status && (
        <div className="mt-2 px-4"><Badge tone="warning" className="cursor-pointer" onClick={() => setFilters({ ...filters, status: '' })}>Needs review <X className="size-3" /></Badge></div>
      )}

      <div className="mt-3 px-4">
        {list.length === 0 ? (
          <Card><Empty icon={<Receipt />} title={transactions.length ? 'No matches' : 'No transactions yet'}
            body={transactions.length ? 'Try a different search or clear filters.' : 'Add an expense manually or import a CSV.'}
            action={transactions.length ? <Button size="sm" variant="outline" onClick={() => { setFilters(EMPTY); setQ(''); f.setPreset('all') }}>Clear filters</Button> : undefined} /></Card>
        ) : groups.map((g) => (
          <div key={g.day} className="mb-3">
            {g.day && <p className="mb-1.5 px-1 text-xs font-medium text-muted-foreground">{g.day}</p>}
            <Card className="divide-y overflow-hidden">{g.items.map((t) => <TxnRow key={t.id} t={t} selected={selected.has(t.id)} onToggle={selecting ? () => toggle(t.id) : undefined} onLongPress={() => startSelectWith(t.id)} />)}</Card>
          </div>
        ))}
      </div>

      <Sheet open={open} onOpenChange={setOpen} title="Filter & sort">
        <div className="space-y-3">
          <div><Label>Sort by</Label>
            <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="latest">Latest first</option><option value="oldest">Oldest first</option>
              <option value="highest">Highest amount</option><option value="lowest">Lowest amount</option>
            </Select></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Type</Label><Select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value as Filters['type'] })}><option value="">All</option><option value="debit">Expenses</option><option value="credit">Income</option></Select></div>
            <div><Label>Status</Label><Select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value as Filters['status'] })}><option value="">All</option><option value="needs_review">Needs review</option></Select></div>
          </div>
          <div><Label>Category</Label><Select value={filters.categoryId} onChange={(e) => setFilters({ ...filters, categoryId: e.target.value })}>
            <option value="">All categories</option>{categories.filter((c) => !c.parentId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
          <div><Label>Merchant</Label><Select value={filters.merchant} onChange={(e) => setFilters({ ...filters, merchant: e.target.value })}>
            <option value="">All merchants</option>{merchants.map((m) => <option key={m} value={m}>{m}</option>)}</Select></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Payment app</Label><Select value={filters.sourceId} onChange={(e) => setFilters({ ...filters, sourceId: e.target.value })}>
              <option value="">All</option>{sources.map((s) => <option key={s.id} value={s.id}>{s.displayName}</option>)}</Select></div>
            <div><Label>Method</Label><Select value={filters.method} onChange={(e) => setFilters({ ...filters, method: e.target.value as Filters['method'] })}>
              <option value="">All</option>{Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Min ₹</Label><Input inputMode="decimal" type="number" min={0} value={filters.min} onChange={(e) => setFilters({ ...filters, min: e.target.value })} /></div>
            <div><Label>Max ₹</Label><Input inputMode="decimal" type="number" min={0} value={filters.max} onChange={(e) => setFilters({ ...filters, max: e.target.value })} /></div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => { setFilters(EMPTY); setSort('latest') }}>Reset</Button>
            <Button className="flex-1" onClick={() => setOpen(false)}>Show {list.length}</Button>
          </div>
        </div>
      </Sheet>

      <ExportSheet open={exportOpen} onOpenChange={setExportOpen} list={list} range={f.range} preset={f.preset}
        filterParts={[
          q.trim() && `search "${q.trim()}"`,
          filters.type && (filters.type === 'debit' ? 'expenses only' : 'income only'),
          filters.status && 'needs review',
          filters.categoryId && `category ${categories.find((c) => c.id === filters.categoryId)?.name}`,
          filters.merchant && `merchant ${filters.merchant}`,
          filters.sourceId && `app ${sources.find((x) => x.id === filters.sourceId)?.displayName}`,
          filters.method && `method ${PAYMENT_METHOD_LABELS[filters.method]}`,
          filters.min && `min Rs ${filters.min}`, filters.max && `max Rs ${filters.max}`,
        ].filter(Boolean) as string[]} />
      {selecting ? (
        <div className="fixed inset-x-0 bottom-[4.5rem] z-40 mx-auto max-w-lg px-3">
          <div className="flex items-center gap-1 rounded-2xl border bg-card p-2 shadow-lg">
            <button className="px-2 text-xs font-medium text-primary" onClick={() => setSelected(selected.size === list.length ? new Set() : new Set(list.map((t) => t.id)))}>
              {selected.size === list.length ? 'None' : 'All'}</button>
            <span className="flex-1 text-sm font-medium">{selected.size} selected</span>
            <Button size="sm" variant="ghost" disabled={!selected.size} onClick={() => setBulkCat(true)}><Tags />Category</Button>
            <Button size="sm" variant="ghost" disabled={!selected.size} aria-label="Exclude or include in reports" onClick={() => {
              const ids = [...selected]; const allEx = ids.every((id) => transactions.find((t) => t.id === id)?.excludeFromReports)
              bulkUpdate(ids, { excludeFromReports: !allEx }); toast(`${allEx ? 'Included' : 'Excluded'} ${ids.length} from reports`); endSelect()
            }}><EyeOff /></Button>
            <Button size="sm" variant="ghost" className="text-destructive" disabled={!selected.size} aria-label="Delete" onClick={() => setBulkDel(true)}><Trash2 /></Button>
          </div>
        </div>
      ) : <Fab />}

      <Sheet open={bulkCat} onOpenChange={setBulkCat} title={`Set category for ${selected.size}`}>
        <div className="grid max-h-[60vh] gap-1 overflow-y-auto">
          {categories.filter((c) => !c.parentId && !c.isIncome).map((c) => (
            <button key={c.id} className="flex items-center gap-3 rounded-xl px-2 py-2.5 text-left text-sm hover:bg-muted" onClick={() => {
              bulkUpdate([...selected], { categoryId: c.id }); setBulkCat(false); toast(`Moved ${selected.size} to ${c.name}`); endSelect()
            }}><span className="size-3 rounded-full" style={{ background: c.color }} />{c.name}</button>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Income and split transactions keep their own categories.</p>
      </Sheet>
      <Confirm open={bulkDel} onOpenChange={setBulkDel} title={`Delete ${selected.size} transactions?`} body="This can’t be undone."
        onConfirm={() => { const n = selected.size; bulkDelete([...selected]); toast(`Deleted ${n} transactions`); endSelect() }} />
    </div></PullToRefresh>
  )
}
