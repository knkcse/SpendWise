import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { AlertCircle, EyeOff } from 'lucide-react'
import { useLookups } from '@/data/store'
import { formatINR } from '@/lib/format'
import type { Transaction } from '@/lib/types'
import { PAYMENT_METHOD_LABELS } from '@/lib/defaults'
import { CategoryIcon } from './CategoryIcon'
import { cn } from '@/lib/utils'

export function TxnRow({ t }: { t: Transaction }) {
  const { cat, src } = useLookups()
  const c = cat(t.categoryId)
  const source = src(t.paymentSourceId)?.displayName ?? PAYMENT_METHOD_LABELS[t.paymentMethod]
  return (
    <Link to={`/transactions/${t.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-muted/60">
      <CategoryIcon category={t.splits.length ? null : c} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium">{t.merchantName}</p>
          {t.status === 'needs_review' && <AlertCircle className="size-3.5 shrink-0 text-warning" aria-label="Needs review" />}
          {t.excludeFromReports && <EyeOff className="size-3.5 shrink-0 text-muted-foreground" aria-label="Excluded from reports" />}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {t.splits.length ? 'Split' : c?.name ?? 'Uncategorised'} · {source} · {format(new Date(t.occurredAt), 'd MMM, h:mm a')}
        </p>
      </div>
      <p className={cn('shrink-0 text-sm font-semibold', t.type === 'credit' && 'text-success')}>
        {t.type === 'credit' ? '+' : '−'}{formatINR(t.amount)}
      </p>
    </Link>
  )
}
