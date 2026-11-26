import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { ChevronRight, Split } from 'lucide-react'
import { Page, PageHeader } from '@/components/layout/AppShell'
import { Card } from '@/components/ui/card'
import { Empty } from '@/components/ui/misc'
import { CategoryIcon } from '@/components/CategoryIcon'
import { useLookups, useStore } from '@/data/store'
import { round2 } from '@/lib/analytics'
import { formatINR } from '@/lib/format'

/**
 * The transactions behind one category slice. A split transaction appears with only the part
 * that belongs to this category, so the list adds up to the same total as the chart.
 */
export default function CategoryDetail() {
  const [q] = useSearchParams()
  const { transactions } = useStore()
  const { cat, catName } = useLookups()
  const id = q.get('c') === 'none' ? null : q.get('c')
  const from = Number(q.get('from')), to = Number(q.get('to'))
  const label = q.get('label') ?? ''

  const lines = useMemo(() => {
    const out: Array<{ key: string; txnId: string; merchant: string; at: string; amount: number; split: { of: number; note?: string } | null }> = []
    for (const t of transactions) {
      const x = Date.parse(t.occurredAt)
      if (t.excludeFromReports || t.type !== 'debit' || x < from || x > to) continue
      if (t.splits.length) t.splits.forEach((s, i) => { if (s.categoryId === id) out.push({ key: `${t.id}:${i}`, txnId: t.id, merchant: t.merchantName, at: t.occurredAt, amount: s.amount, split: { of: t.amount, note: s.note } }) })
      else if (t.categoryId === id) out.push({ key: t.id, txnId: t.id, merchant: t.merchantName, at: t.occurredAt, amount: t.amount, split: null })
    }
    return out.sort((a, b) => b.at.localeCompare(a.at))
  }, [transactions, id, from, to])
  const total = round2(lines.reduce((a, l) => a + l.amount, 0))
  const c = cat(id)

  return (
    <Page>
      <PageHeader title={catName(id)} subtitle={label ? `${label} · ${format(from, 'd MMM')} – ${format(to, 'd MMM yyyy')}` : undefined} back />
      <div className="space-y-4 px-4">
        <Card className="flex items-center gap-3 p-4">
          <CategoryIcon category={c} />
          <div className="flex-1"><p className="text-xs text-muted-foreground">Spent</p><p className="text-2xl font-semibold">{formatINR(total)}</p></div>
          <p className="text-right text-xs text-muted-foreground">{lines.length} payment{lines.length === 1 ? '' : 's'}{lines.some((l) => l.split) ? <><br />incl. split parts</> : null}</p>
        </Card>
        {lines.length ? (
          <Card className="divide-y overflow-hidden">
            {lines.map((l) => (
              <Link key={l.key} to={`/transactions/${l.txnId}`} className="flex items-center gap-3 px-4 py-3 active:bg-muted/60">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium">{l.merchant}{l.split && <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground"><Split className="size-3" />split</span>}</p>
                  <p className="truncate text-xs text-muted-foreground">{format(new Date(l.at), 'd MMM, h:mm a')}{l.split ? ` · part of ${formatINR(l.split.of)}${l.split.note ? ` · ${l.split.note}` : ''}` : ''}</p>
                </div>
                <p className="shrink-0 text-sm font-semibold">−{formatINR(l.amount)}</p>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </Card>
        ) : <Empty icon={<Split />} title="No payments here" body="Nothing in this category for the selected period." />}
        <p className="text-center text-[11px] text-muted-foreground">Excluded transactions are left out, as in the chart.</p>
      </div>
    </Page>
  )
}
