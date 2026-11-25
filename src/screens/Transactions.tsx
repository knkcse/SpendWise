import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { Download, FileSpreadsheet, ListFilter, Receipt, Search, Upload, X } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Label, Select } from '@/components/ui/input'
import { Badge, Empty, Sheet } from '@/components/ui/misc'
import { DateFilter, useDateFilter } from '@/components/DateFilter'
import { TxnRow } from '@/components/TxnRow'
import { Fab } from './Dashboard'
import { useStore } from '@/data/store'
import { inRange, round2 } from '@/lib/analytics'
import { download, toCSV } from '@/lib/csv'
import { exportExcel } from '@/lib/exportExcel'
import { formatINR } from '@/lib/format'
import { PAYMENT_METHOD_LABELS } from '@/lib/defaults'
import type { PaymentMethod, Transaction } from '@/lib/types'
import { useToast } from '@/components/toast'

type Sort = 'latest' | 'oldest' | 'highest' | 'lowest'
interface Filters { categoryId: string; sourceId: string; method: '' | PaymentMethod; merchant: string; min: string; max: string; type: '' | 'debit' | 'credit'; status: '' | 'needs_review' }
const EMPTY: Filters = { categoryId: '', sourceId: '', method: '', merchant: '', min: '', max: '', type: '', status: '' }

export default function Transactions() {
  const { transactions, categories, sources, prefs } = useStore()
  const toast = useToast()
  const [params] = useSearchParams()
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<Sort>('latest')
  const [filters, setFilters] = useState<Filters>({ ...EMPTY, status: params.get('status') === 'needs_review' ? 'needs_review' : '' })
  const [open, setOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
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

  const stamp = format(new Date(), 'yyyy-MM-dd')
  return (
    <div>
      <PageHeader title="Transactions" subtitle={`${list.length} shown · ${formatINR(total)} spent`}
        right={<>
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
            <Card className="divide-y overflow-hidden">{g.items.map((t) => <TxnRow key={t.id} t={t} />)}</Card>
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

      <Sheet open={exportOpen} onOpenChange={setExportOpen} title={`Export ${list.length} transactions`}>
        <p className="mb-4 text-sm text-muted-foreground">Exports the transactions currently shown, with your filters applied.</p>
        <div className="grid gap-2">
          <Button variant="outline" onClick={() => { download(`spendwise-${stamp}.csv`, toCSV(list, categories, sources)); setExportOpen(false); toast('CSV exported') }}><Download />CSV file</Button>
          <Button variant="outline" onClick={async () => { await exportExcel(list, categories, sources, `spendwise-${stamp}.xlsx`); setExportOpen(false); toast('Excel file exported') }}><FileSpreadsheet />Excel (.xlsx)</Button>
        </div>
      </Sheet>
      <Fab />
    </div>
  )
}
