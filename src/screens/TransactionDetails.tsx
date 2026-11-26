import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { format } from 'date-fns'
import { AlertCircle, Pencil, Trash2 } from 'lucide-react'
import { Page, PageHeader } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select } from '@/components/ui/input'
import { Badge, Confirm } from '@/components/ui/misc'
import { CategoryIcon } from '@/components/CategoryIcon'
import { useToast } from '@/components/toast'
import { useLookups, useStore } from '@/data/store'
import { PAYMENT_METHOD_LABELS } from '@/lib/defaults'
import { formatINR } from '@/lib/format'

const ORIGIN = { manual: 'Added manually', android_notification: 'Detected from notification', csv_import: 'Imported from CSV' }

export default function TransactionDetails() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const { transactions, categories, updateTransaction, deleteTransaction, sameMerchant, bulkUpdate } = useStore()
  const { cat, catName, src } = useLookups()
  const [del, setDel] = useState(false)
  const [applyAll, setApplyAll] = useState<{ categoryId: string; ids: string[] } | null>(null)
  const t = transactions.find((x) => x.id === id)
  if (!t) return <Page><PageHeader title="Not found" back /><p className="px-4 text-sm text-muted-foreground">This transaction no longer exists.</p></Page>
  const c = cat(t.categoryId)

  const rows: Array<[string, string | undefined]> = [
    ['Date & time', format(new Date(t.occurredAt), 'EEE, d MMM yyyy · h:mm a')],
    ['Payment method', PAYMENT_METHOD_LABELS[t.paymentMethod]],
    ['Payment app', src(t.paymentSourceId)?.displayName],
    ['Subcategory', t.subcategoryId ? catName(t.subcategoryId) : undefined],
    ['Description', t.description], ['Notes', t.notes], ['Reference', t.transactionReference],
    ['Type', t.scope === 'business' ? 'Business' : 'Personal'], ['Source', ORIGIN[t.origin]],
  ]

  return (
    <Page>
      <PageHeader title="Transaction" back right={<Button size="icon" variant="ghost" asChild aria-label="Edit"><Link to={`/transactions/${t.id}/edit`}><Pencil /></Link></Button>} />
      <div className="space-y-4 px-4">
        <div className="flex flex-col items-center py-4 text-center">
          <CategoryIcon category={t.splits.length ? null : c} className="size-14 rounded-2xl [&_svg]:size-6" />
          <p className="mt-3 text-sm text-muted-foreground">{t.merchantName}</p>
          <p className={`mt-1 text-3xl font-semibold ${t.type === 'credit' ? 'text-success' : ''}`}>{t.type === 'credit' ? '+' : '−'}{formatINR(t.amount)}</p>
          <div className="mt-2 flex flex-wrap justify-center gap-1.5">
            {t.status === 'needs_review' && <Badge tone="warning"><AlertCircle className="size-3" />Needs review</Badge>}
            {t.excludeFromReports && <Badge>Excluded from reports</Badge>}
            {t.scope === 'business' && <Badge tone="primary">Business</Badge>}
          </div>
        </div>

        {!t.splits.length && (
          <Card className="p-4">
            <label htmlFor="quick-cat" className="mb-1.5 block text-xs font-medium text-muted-foreground">Category</label>
            <Select id="quick-cat" value={t.categoryId ?? ''} onChange={(e) => {
              const categoryId = e.target.value || null
              updateTransaction(t.id, { categoryId, subcategoryId: null })
              const others = categoryId ? sameMerchant(t).filter((x) => x.categoryId !== categoryId) : []
              if (others.length) setApplyAll({ categoryId: categoryId!, ids: others.map((x) => x.id) })
              else toast('Category updated. SpendWise will remember this merchant.')
            }}>
              <option value="">Uncategorised</option>
              {categories.filter((x) => !x.parentId && x.isIncome === (t.type === 'credit')).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </Select>
          </Card>
        )}

        {t.splits.length > 0 && (
          <Card className="divide-y">
            <p className="p-4 pb-2 text-xs font-medium text-muted-foreground">Split</p>
            {t.splits.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3"><CategoryIcon category={cat(s.categoryId)} className="size-8" /><span className="flex-1 text-sm">{catName(s.categoryId)}</span><span className="text-sm font-medium">{formatINR(s.amount)}</span></div>
            ))}
          </Card>
        )}

        <Card className="divide-y">
          {rows.filter(([, v]) => v).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 px-4 py-3 text-sm"><span className="text-muted-foreground">{k}</span><span className="text-right font-medium break-all">{v}</span></div>
          ))}
        </Card>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => { updateTransaction(t.id, { excludeFromReports: !t.excludeFromReports }); toast(t.excludeFromReports ? 'Included in reports' : 'Excluded from reports') }}>
            {t.excludeFromReports ? 'Include in reports' : 'Exclude from reports'}</Button>
          <Button variant="outline" onClick={() => updateTransaction(t.id, { scope: t.scope === 'business' ? 'personal' : 'business' })}>
            Mark {t.scope === 'business' ? 'personal' : 'business'}</Button>
        </div>
        <Button variant="ghost" className="w-full text-destructive" onClick={() => setDel(true)}><Trash2 />Delete transaction</Button>
      </div>
      <Confirm open={!!applyAll} onOpenChange={(o) => !o && setApplyAll(null)} destructive={false} confirmLabel="Update all"
        title={`Update other ${t.merchantName} payments?`}
        body={applyAll ? `${applyAll.ids.length} other transaction${applyAll.ids.length === 1 ? '' : 's'} from ${t.merchantName} ${applyAll.ids.length === 1 ? 'has' : 'have'} a different category. Set ${applyAll.ids.length === 1 ? 'it' : 'them'} to ${catName(applyAll.categoryId)} too? New payments from this merchant will use it automatically either way.` : ''}
        onConfirm={() => { if (applyAll) { bulkUpdate(applyAll.ids, { categoryId: applyAll.categoryId }); toast(`Updated ${applyAll.ids.length + 1} transactions`) } }} />
      <Confirm open={del} onOpenChange={setDel} title="Delete this transaction?" body={`${t.merchantName} · ${formatINR(t.amount)}. This can’t be undone.`}
        onConfirm={() => { deleteTransaction(t.id); toast('Transaction deleted'); nav('/transactions', { replace: true }) }} />
    </Page>
  )
}
