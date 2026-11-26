import { Link } from 'react-router-dom'
import { PullToRefresh } from '@/components/PullToRefresh'
import { useMemo } from 'react'
import { AlertCircle, ArrowDownRight, ArrowUpRight, Bell, CalendarDays, CalendarRange, Plus, Receipt, Wallet } from 'lucide-react'
import { endOfDay, format } from 'date-fns'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Empty } from '@/components/ui/misc'
import { DateFilter, useDateFilter } from '@/components/DateFilter'
import { BarSeries, Donut, RankBars, TrendArea } from '@/components/charts'
import { TxnRow } from '@/components/TxnRow'
import { MoveLocalData } from '@/components/MoveLocalData'
import { useLookups, useStore } from '@/data/store'
import { budgetStatus, round2 } from '@/lib/analytics'
import { fillDays } from '@/lib/summary'
import { useOverview, useSummary } from '@/hooks/useAnalytics'
import { Change, Patterns, SourceNote } from '@/components/AnalyticsBits'
import { rangeFor, monthKey } from '@/lib/dates'
import { formatINR } from '@/lib/format'
import { PRESET_LABELS } from '@/lib/dates'

export default function Dashboard() {
  const { transactions: ts, profile, prefs, budgets } = useStore()
  const { cat, catName, src } = useLookups()
  const f = useDateFilter('month', prefs.weekStartsOn)
  const now = new Date()

  const weekRange = rangeFor('week', now, prefs.weekStartsOn)
  const ov = useOverview(6)
  const ps = useSummary(f.range)
  const wk = useSummary({ from: weekRange.from, to: endOfDay(weekRange.to) })

  const s = useMemo(() => {
    const o = ov.data, p = ps.data
    const overall = budgets.find((b) => b.categoryId === null && b.month === monthKey(now))
    return {
      ...o, savings: round2(o.monthIncome - o.month), bs: overall ? budgetStatus(overall, ts, now) : null,
      periodTotal: p.spent, big: p.biggest, count: p.count,
      weekly: fillDays(wk.data, { from: weekRange.from, to: weekRange.to }).map((d) => ({ ...d, label: d.label.split(' ')[0] })),
      trendChart: o.trend.map((m) => ({ month: format(new Date(m.month + '-01T00:00:00'), 'MMM'), expenses: m.spent, income: m.income })),
      cats: p.byCategory.map((c) => ({ name: catName(c.categoryId), value: c.total, color: cat(c.categoryId)?.color ?? '#94a3b8' })),
      apps: p.bySource.map((x) => ({ key: src(x.sourceId)?.displayName ?? 'Other / manual', total: x.total, count: x.count })),
      merchants: p.topMerchants.slice(0, 5),
      review: ts.filter((t) => t.status === 'needs_review').length,
    }
  }, [ov.data, ps.data, wk.data, ts, budgets]) // eslint-disable-line react-hooks/exhaustive-deps

  const hello = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <PullToRefresh><div>
      <PageHeader title={`${hello}${profile.fullName ? ', ' + profile.fullName.split(' ')[0] : ''}`} subtitle="Here’s where your money went"
        right={<Button size="icon" variant="ghost" asChild aria-label="Budget alerts"><Link to="/budgets"><Bell /></Link></Button>} />

      <div className="space-y-4 px-4">
        <MoveLocalData />
        <Card className="overflow-hidden border-0 bg-gradient-to-br from-teal-700 to-emerald-600 text-white">
          <CardContent className="p-5">
            <p className="text-xs text-white/75">Spent this month</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight">{formatINR(s.month)}</p>
            <Change curr={s.month} prev={s.prevMonthToDate} label="this point last month" className="mt-1" onDark />
            <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
              <div><p className="text-white/70">Today</p><p className="mt-0.5 text-sm font-semibold">{formatINR(s.today)}</p></div>
              <div><p className="text-white/70">This week</p><p className="mt-0.5 text-sm font-semibold">{formatINR(s.week)}</p></div>
              <div><p className="text-white/70">Income</p><p className="mt-0.5 text-sm font-semibold">{formatINR(s.monthIncome)}</p></div>
            </div>
            {s.bs ? (
              <div className="mt-4">
                <div className="mb-1 flex justify-between text-xs text-white/80"><span>Budget used {Math.round(s.bs.pct)}%</span><span>{s.bs.remaining >= 0 ? `${formatINR(s.bs.remaining)} left` : `${formatINR(-s.bs.remaining)} over`}</span></div>
                <div className="h-1.5 rounded-full bg-white/20"><div className="h-full rounded-full bg-white" style={{ width: `${Math.min(100, s.bs.pct)}%` }} /></div>
              </div>
            ) : (
              <Link to="/budgets" className="mt-4 inline-block text-xs font-medium text-white underline underline-offset-2">Set a monthly budget</Link>
            )}
          </CardContent>
        </Card>

        {s.review > 0 && (
          <Link to="/transactions?status=needs_review" className="flex items-center gap-3 rounded-2xl border border-warning/30 bg-warning/10 p-3 text-sm">
            <AlertCircle className="size-5 text-warning" />
            <span className="flex-1">{s.review} transaction{s.review > 1 ? 's' : ''} need{s.review === 1 ? 's' : ''} a category</span>
            <span className="text-xs font-medium text-warning">Review</span>
          </Link>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Stat label="Monthly savings" value={formatINR(s.savings)} hint="Recorded income − expenses" icon={s.savings >= 0 ? <ArrowUpRight className="text-success" /> : <ArrowDownRight className="text-destructive" />} />
          <Stat label="Remaining budget" value={s.bs ? formatINR(s.bs.remaining) : '—'} hint={s.bs ? `of ${formatINR(s.bs.budget.amount)}` : 'No budget set'} icon={<Wallet className="text-primary" />} />
          <Stat label="Spent this year" value={formatINR(s.year)} hint={s.prevYearToDate ? `${formatPctShort(s.year, s.prevYearToDate)} vs last year to date` : 'Nothing last year to compare'} icon={<CalendarRange className="text-primary" />} />
          <Stat label="This week so far" value={formatINR(s.week)} hint={s.prevWeekToDate ? `${formatPctShort(s.week, s.prevWeekToDate)} vs last week to date` : 'Nothing last week to compare'} icon={<CalendarDays className="text-primary" />} />
        </div>
      </div>

      <div className="mt-6"><DateFilter f={f} /></div>

      <div className="mt-3 space-y-4 px-4">
        <div className="grid grid-cols-2 gap-3">
          <Stat label={`Spent · ${PRESET_LABELS[f.preset]}`} value={formatINR(s.periodTotal)} hint={`${s.count} transactions`} icon={<Receipt className="text-primary" />} />
          <Stat label="Biggest expense" value={s.big ? formatINR(s.big.amount) : '—'} hint={s.big?.merchant ?? 'Nothing yet'} />
        </div>

        <Card><CardHeader><CardTitle>Spending by category</CardTitle></CardHeader>
          <CardContent>{s.cats.length ? <Donut data={s.cats} total={s.periodTotal} /> : <p className="py-6 text-center text-sm text-muted-foreground">No expenses in this period</p>}</CardContent></Card>

        <Card><CardHeader><CardTitle>By payment app</CardTitle></CardHeader>
          <CardContent>{s.apps.length ? <RankBars rows={s.apps.slice(0, 6).map((a) => ({ label: a.key, value: a.total, sub: `· ${a.count}` }))} /> : <p className="py-6 text-center text-sm text-muted-foreground">No expenses in this period</p>}</CardContent></Card>

        <Card><CardHeader><CardTitle>Top merchants</CardTitle></CardHeader>
          <CardContent>{s.merchants.length ? <RankBars rows={s.merchants.map((m) => ({ label: m.merchant, value: m.total, sub: `· ${m.count}×` }))} /> : <p className="py-6 text-center text-sm text-muted-foreground">No expenses in this period</p>}</CardContent></Card>

        <Card><CardHeader><CardTitle>When you spend</CardTitle></CardHeader>
          <CardContent><Patterns s={ps.data} weekStartsOn={prefs.weekStartsOn} /></CardContent></Card>

        <Card><CardHeader><CardTitle>This week</CardTitle><Link to="/reports/weekly" className="text-xs font-medium text-primary">Weekly report</Link></CardHeader>
          <CardContent><BarSeries data={s.weekly} x="label" y="total" /></CardContent></Card>

        <Card><CardHeader><CardTitle>6-month trend</CardTitle><Link to="/reports/monthly" className="text-xs font-medium text-primary">Monthly report</Link></CardHeader>
          <CardContent><TrendArea data={s.trendChart} /></CardContent></Card>

        <Card>
          <CardHeader><CardTitle>Recent transactions</CardTitle><Link to="/transactions" className="text-xs font-medium text-primary">See all</Link></CardHeader>
          {ts.length ? (
            <div className="-mt-1 divide-y pb-1">{[...ts].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 5).map((t) => <TxnRow key={t.id} t={t} />)}</div>
          ) : (
            <Empty icon={<Receipt />} title="No transactions yet" body="Add your first expense, or import a CSV from your bank." action={<Button asChild size="sm"><Link to="/transactions/new"><Plus />Add expense</Link></Button>} />
          )}
        </Card>
      </div>

      <SourceNote source={ov.source === 'server' && ps.source === 'server' ? 'server' : 'device'} className="mt-4 px-4" />
      <Fab />
    </div></PullToRefresh>
  )
}

function formatPctShort(curr: number, prev: number) {
  const ch = ((curr - prev) / prev) * 100
  return `${ch > 0 ? '↑' : ch < 0 ? '↓' : ''}${Math.abs(ch).toFixed(0)}%`
}

export function Stat({ label, value, hint, icon }: { label: string; value: string; hint?: string; icon?: React.ReactNode }) {
  return (
    <Card className="p-3.5">
      <div className="flex items-start justify-between gap-2"><p className="text-xs text-muted-foreground">{label}</p>{icon && <span className="[&_svg]:size-4">{icon}</span>}</div>
      <p className="mt-1 truncate text-lg font-semibold">{value}</p>
      {hint && <p className="truncate text-[11px] text-muted-foreground">{hint}</p>}
    </Card>
  )
}

export function Fab() {
  return (
    <Link to="/transactions/new" aria-label="Add expense"
      className="fixed bottom-24 right-[max(1rem,calc(50%-15rem))] z-30 grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30 active:scale-95">
      <Plus className="size-6" />
    </Link>
  )
}
