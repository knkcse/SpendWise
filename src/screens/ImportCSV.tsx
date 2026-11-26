import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { FileUp } from 'lucide-react'
import { Page, PageHeader } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/misc'
import { useToast } from '@/components/toast'
import { useStore } from '@/data/store'
import { mapImport, parseCSV, type ImportRow } from '@/lib/csv'
import { fingerprint } from '@/lib/dedupe'
import { formatINR } from '@/lib/format'
import type { NewTransaction } from '@/lib/types'

export default function ImportCSV() {
  const { transactions, categories, importTransactions } = useStore()
  const nav = useNavigate(); const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<ImportRow[] | null>(null)
  const [name, setName] = useState('')

  const existing = useMemo(() => new Set(transactions.map((t) => fingerprint(t))), [transactions])
  const preview = useMemo(() => {
    if (!rows) return []
    const seen = new Set<string>()
    return rows.map((r) => {
      if (r.error) return { r, state: 'error' as const }
      const fp = fingerprint({ type: r.type, amount: r.amount, merchantName: r.merchant, occurredAt: r.occurredAt, transactionReference: r.reference })
      const dup = existing.has(fp) || seen.has(fp); seen.add(fp)
      return { r, state: dup ? ('duplicate' as const) : ('new' as const) }
    })
  }, [rows, existing])
  const fresh = preview.filter((p) => p.state === 'new')

  const onFile = async (f: File) => {
    if (f.size > 5 * 1024 * 1024) return toast('File is larger than 5 MB')
    setName(f.name); setRows(mapImport(parseCSV(await f.text())))
  }

  const doImport = () => {
    const catId = (n?: string) => (n ? categories.find((c) => c.name.toLowerCase() === n.toLowerCase())?.id ?? null : null)
    const items: NewTransaction[] = fresh.map(({ r }) => ({
      type: r.type, amount: r.amount, merchantName: r.merchant.slice(0, 120), occurredAt: r.occurredAt, paymentMethod: r.paymentMethod ?? 'other', paymentSourceId: null,
      categoryId: r.splits?.length ? null : catId(r.category), subcategoryId: null, description: r.description, transactionReference: r.reference, notes: r.notes,
      origin: 'csv_import', status: 'confirmed', scope: 'personal', excludeFromReports: r.excluded ?? false,
      splits: (r.splits ?? []).map((p) => ({ id: crypto.randomUUID(), categoryId: catId(p.category), amount: p.amount, note: p.note })),
    }))
    const res = importTransactions(items)
    toast(`Imported ${res.added} transaction${res.added === 1 ? '' : 's'}${res.skipped ? `, skipped ${res.skipped} duplicates` : ''}`)
    nav('/transactions', { replace: true })
  }

  return (
    <Page>
      <PageHeader title="Import CSV" subtitle="Bank statements or a SpendWise export" back />
      <div className="space-y-4 px-4">
        <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        <button onClick={() => input.current?.click()} className="flex w-full flex-col items-center rounded-2xl border-2 border-dashed p-8 text-center hover:bg-muted/50">
          <FileUp className="mb-2 size-8 text-primary" />
          <p className="text-sm font-medium">{name || 'Choose a CSV file'}</p>
          <p className="mt-1 text-xs text-muted-foreground">Needs columns for date, amount and merchant / narration. Dates like 25/11/2026 are read as day/month.</p>
        </button>

        {rows && (<>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge tone="success">{fresh.length} new</Badge>
            <Badge tone="warning">{preview.filter((p) => p.state === 'duplicate').length} duplicates (skipped)</Badge>
            <Badge tone="danger">{preview.filter((p) => p.state === 'error').length} invalid (skipped)</Badge>
          </div>
          <Card className="max-h-[50vh] divide-y overflow-y-auto">
            {preview.length === 0 && <p className="p-4 text-sm text-muted-foreground">No rows found. Check the file has a header row.</p>}
            {preview.slice(0, 300).map(({ r, state }, i) => (
              <div key={i} className={`flex items-center gap-3 px-4 py-2.5 text-sm ${state !== 'new' ? 'opacity-50' : ''}`}>
                <div className="min-w-0 flex-1"><p className="truncate font-medium">{r.merchant || '—'}</p>
                  <p className="text-xs text-muted-foreground">{r.occurredAt ? format(new Date(r.occurredAt), 'd MMM yyyy') : '—'}{state === 'duplicate' && ' · already in SpendWise'}{r.error && ` · ${r.error}`}</p></div>
                <span className={r.type === 'credit' ? 'text-success' : ''}>{r.amount ? formatINR(r.amount) : '—'}</span>
              </div>
            ))}
          </Card>
          <Button size="lg" className="w-full" disabled={!fresh.length} onClick={doImport}>Import {fresh.length} transaction{fresh.length === 1 ? '' : 's'}</Button>
        </>)}
      </div>
    </Page>
  )
}
