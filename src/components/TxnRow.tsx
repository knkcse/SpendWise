import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { AlertCircle, Check, EyeOff } from 'lucide-react'
import { useLookups } from '@/data/store'
import { formatINR } from '@/lib/format'
import type { Transaction } from '@/lib/types'
import { PAYMENT_METHOD_LABELS } from '@/lib/defaults'
import { CategoryIcon } from './CategoryIcon'
import { cn } from '@/lib/utils'

/** Press and hold for 500 ms without moving. Returns handlers and whether the last press was a long one. */
function useLongPress(onLongPress?: () => void) {
  const timer = useRef<number>()
  const start = useRef<{ x: number; y: number } | null>(null)
  const fired = useRef(false)
  const clear = () => { window.clearTimeout(timer.current); start.current = null }
  if (!onLongPress) return { handlers: {}, fired }
  return {
    fired,
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        fired.current = false; start.current = { x: e.clientX, y: e.clientY }
        timer.current = window.setTimeout(() => { fired.current = true; navigator.vibrate?.(20); onLongPress() }, 500)
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) clear()
      },
      onPointerUp: clear, onPointerCancel: clear, onPointerLeave: clear,
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    },
  }
}

export function TxnRow({ t, selected, onToggle, onLongPress }: { t: Transaction; selected?: boolean; onToggle?: () => void; onLongPress?: () => void }) {
  const lp = useLongPress(onToggle ? undefined : onLongPress)
  const { cat, src } = useLookups()
  const c = cat(t.categoryId)
  const source = src(t.paymentSourceId)?.displayName ?? PAYMENT_METHOD_LABELS[t.paymentMethod]
  const body = (<>
      {onToggle
        ? <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl border-2', selected ? 'border-primary bg-primary text-primary-foreground' : 'border-input')}>{selected && <Check className="size-5" />}</span>
        : <CategoryIcon category={t.splits.length ? null : c} />}
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
  </>)
  if (onToggle) return <button type="button" onClick={onToggle} aria-pressed={selected} className={cn('flex w-full items-center gap-3 px-4 py-3 text-left', selected && 'bg-accent/60')}>{body}</button>
  return <Link to={`/transactions/${t.id}`} {...lp.handlers} draggable={false}
    onClick={(e) => { if (lp.fired.current) { e.preventDefault(); lp.fired.current = false } }}
    className="flex select-none items-center gap-3 px-4 py-3 [-webkit-touch-callout:none] active:bg-muted/60">{body}</Link>
}
