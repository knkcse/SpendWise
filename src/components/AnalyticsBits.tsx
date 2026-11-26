import { Cloud, Smartphone, TrendingDown, TrendingUp } from 'lucide-react'
import { BarSeries, RankBars } from './charts'
import { pctChange } from '@/lib/analytics'
import { formatINR, formatPct } from '@/lib/format'
import { timeOfDay, weekdaySeries, type PeriodSummary } from '@/lib/summary'
import type { AnalyticsSource } from '@/hooks/useAnalytics'
import { cn } from '@/lib/utils'

/** "↑ 12% vs same point last month (₹4,200)". Spending going up is shown as bad. */
export function Change({ curr, prev, label, className, onDark }: { curr: number; prev: number; label: string; className?: string; onDark?: boolean }) {
  const ch = pctChange(curr, prev)
  if (ch === null) return <p className={cn('text-xs', onDark ? 'text-white/75' : 'text-muted-foreground', className)}>Nothing spent by {label} to compare with.</p>
  const up = ch > 0
  const tone = onDark ? 'text-white' : up ? 'text-destructive' : 'text-success'
  return (
    <p className={cn('flex items-center gap-1 text-xs font-medium', tone, className)}>
      {up ? <TrendingUp className="size-3.5 shrink-0" /> : <TrendingDown className="size-3.5 shrink-0" />}
      <span>{formatPct(ch)} vs {label} ({formatINR(prev)})</span>
    </p>
  )
}

/** Which day of the week and which part of the day the money goes. */
export function Patterns({ s, weekStartsOn }: { s: PeriodSummary; weekStartsOn: 0 | 1 }) {
  if (!s.expenseCount) return <p className="py-4 text-center text-sm text-muted-foreground">No expenses in this period</p>
  const days = weekdaySeries(s, weekStartsOn)
  const top = days.reduce((a, d) => (d.total > a.total ? d : a), days[0])
  const slots = timeOfDay(s)
  const topSlot = slots.reduce((a, d) => (d.total > a.total ? d : a), slots[0])
  const FULL: Record<string, string> = { Sun: 'Sundays', Mon: 'Mondays', Tue: 'Tuesdays', Wed: 'Wednesdays', Thu: 'Thursdays', Fri: 'Fridays', Sat: 'Saturdays' }
  return (
    <div className="space-y-4">
      <p className="text-sm">You spend the most on <span className="font-semibold">{FULL[top.label]}</span> ({formatINR(top.total)}) and in the <span className="font-semibold">{topSlot.label.toLowerCase()}</span> ({formatINR(topSlot.total)}).</p>
      <BarSeries data={days} x="label" y="total" height={150} highlightMax />
      <RankBars rows={slots.map((x) => ({ label: x.label, value: x.total, sub: `· ${x.sub} · ${x.count}×` }))} />
    </div>
  )
}

/** Small footnote saying whether numbers came from the account or were worked out on the phone. */
export function SourceNote({ source, className }: { source: AnalyticsSource; className?: string }) {
  return (
    <p className={cn('flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground', className)}>
      {source === 'server' ? <Cloud className="size-3.5" /> : <Smartphone className="size-3.5" />}
      {source === 'server' ? 'Totals calculated from your account' : 'Totals calculated on this phone'} · excluded transactions left out
    </p>
  )
}
