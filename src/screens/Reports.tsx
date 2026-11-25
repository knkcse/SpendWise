import { useMemo, useState } from 'react'
import { addMonths, addWeeks, endOfMonth, format, startOfMonth, subMonths, subWeeks, startOfWeek, endOfWeek, isAfter } from 'date-fns'
import { ChevronLeft, ChevronRight, TrendingDown, TrendingUp } from 'lucide-react'
import { Page, PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BarSeries, Donut, RankBars } from '@/components/charts'
import { Stat } from './Dashboard'
import { useLookups, useStore } from '@/data/store'
import { biggest, byCategory, dailySeries, expenses, groupSum, income, pctChange, sum, within } from '@/lib/analytics'
import { formatINR, formatPct } from '@/lib/format'

function Compare({ curr, prev, label }: { curr: number; prev: number; label: string }) {
  const ch = pctChange(curr, prev)
  if (ch === null) return <p className="text-xs text-muted-foreground">No spending recorded in the {label} to compare with.</p>
  const up = ch > 0
  return (
    <p className={`flex items-center gap-1 text-xs font-medium ${up ? 'text-destructive' : 'text-success'}`}>
      {up ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}{formatPct(ch)} vs {label} ({formatINR(prev)})
    </p>
  )
}

function Stepper({ label, onPrev, onNext, nextDisabled }: { label: string; onPrev: () => void; onNext: () => void; nextDisabled: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 pb-2">
      <Button size="icon" variant="ghost" onClick={onPrev} aria-label="Previous"><ChevronLeft /></Button>
      <p className="text-sm font-medium">{label}</p>
      <Button size="icon" variant="ghost" onClick={onNext} disabled={nextDisabled} aria-label="Next"><ChevronRight /></Button>
    </div>
  )
}

export function WeeklyReport() {
  const { transactions: ts, prefs } = useStore()
  const { catName } = useLookups()
  const [anchor, setAnchor] = useState(new Date())
  const o = { weekStartsOn: prefs.weekStartsOn }
  const r = { from: startOfWeek(anchor, o), to: endOfWeek(anchor, o) }
  const p = { from: startOfWeek(subWeeks(anchor, 1), o), to: endOfWeek(subWeeks(anchor, 1), o) }
  const d = useMemo(() => {
    const w = within(ts, r); const total = sum(expenses(w))
    const days = dailySeries(ts, r)
    const top = days.reduce((a, x) => (x.total > a.total ? x : a), days[0])
    const cats = [...byCategory(w).entries()].sort((a, b) => b[1] - a[1])
    return { total, days, top, cats, count: expenses(w).length, prev: sum(expenses(within(ts, p))) }
  }, [ts, r.from.getTime()]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Page>
      <PageHeader title="Weekly report" back />
      <Stepper label={`${format(r.from, 'd MMM')} – ${format(r.to, 'd MMM yyyy')}`} onPrev={() => setAnchor(subWeeks(anchor, 1))} onNext={() => setAnchor(addWeeks(anchor, 1))} nextDisabled={isAfter(addWeeks(r.from, 1), new Date())} />
      <div className="space-y-4 px-4">
        <Card className="p-4"><p className="text-xs text-muted-foreground">Total spent</p><p className="text-3xl font-semibold">{formatINR(d.total)}</p><div className="mt-1"><Compare curr={d.total} prev={d.prev} label="previous week" /></div></Card>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Transactions" value={String(d.count)} />
          <Stat label="Highest day" value={d.top.total ? formatINR(d.top.total) : '—'} hint={d.top.total ? format(new Date(d.top.date), 'EEEE') : 'No spending'} />
        </div>
        <Card><CardHeader><CardTitle>Daily breakdown</CardTitle></CardHeader><CardContent><BarSeries data={d.days.map((x) => ({ ...x, label: x.label.split(' ')[0] }))} x="label" y="total" highlightMax /></CardContent></Card>
        <Card><CardHeader><CardTitle>Top categories</CardTitle></CardHeader><CardContent>
          {d.cats.length ? <RankBars rows={d.cats.slice(0, 5).map(([id, v]) => ({ label: catName(id), value: v }))} /> : <p className="py-4 text-center text-sm text-muted-foreground">No expenses this week</p>}
        </CardContent></Card>
      </div>
    </Page>
  )
}

export function MonthlyReport() {
  const { transactions: ts } = useStore()
  const { cat, catName, src } = useLookups()
  const [anchor, setAnchor] = useState(new Date())
  const r = { from: startOfMonth(anchor), to: endOfMonth(anchor) }
  const p = { from: startOfMonth(subMonths(anchor, 1)), to: endOfMonth(subMonths(anchor, 1)) }
  const d = useMemo(() => {
    const w = within(ts, r); const pw = within(ts, p)
    const total = sum(expenses(w)); const inc = sum(income(w))
    const cats = [...byCategory(w).entries()].sort((a, b) => b[1] - a[1])
    const prevCats = byCategory(pw)
    // Potential savings: categories that rose vs last month. This is an
    // estimate of what returning to last month's level would save, not a fact.
    const potential = cats.map(([id, v]) => ({ id, v, prev: prevCats.get(id) ?? 0 }))
      .filter((x) => x.prev > 0 && x.v > x.prev).map((x) => ({ ...x, diff: x.v - x.prev })).sort((a, b) => b.diff - a.diff).slice(0, 3)
    return {
      total, inc, net: inc - total, cats, prev: sum(expenses(pw)), big: biggest(w), potential,
      merchants: groupSum(expenses(w), (t) => t.merchantName).slice(0, 6),
      sources: groupSum(expenses(w), (t) => src(t.paymentSourceId)?.displayName ?? 'Other / manual'),
      days: dailySeries(ts, r).map((x) => ({ ...x, label: x.label.split(' ')[1] })),
    }
  }, [ts, r.from.getTime()]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Page>
      <PageHeader title="Monthly report" back />
      <Stepper label={format(anchor, 'MMMM yyyy')} onPrev={() => setAnchor(subMonths(anchor, 1))} onNext={() => setAnchor(addMonths(anchor, 1))} nextDisabled={isAfter(addMonths(r.from, 1), new Date())} />
      <div className="space-y-4 px-4">
        <Card className="p-4"><p className="text-xs text-muted-foreground">Total expenses</p><p className="text-3xl font-semibold">{formatINR(d.total)}</p><div className="mt-1"><Compare curr={d.total} prev={d.prev} label="previous month" /></div></Card>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Income recorded" value={formatINR(d.inc)} />
          <Stat label="Net savings" value={formatINR(d.net)} hint="Recorded income − expenses" />
        </div>
        <Stat label="Highest transaction" value={d.big ? formatINR(d.big.amount) : '—'} hint={d.big ? `${d.big.merchantName} · ${format(new Date(d.big.occurredAt), 'd MMM')}` : 'No expenses'} />
        <Card><CardHeader><CardTitle>Daily spending</CardTitle></CardHeader><CardContent><BarSeries data={d.days} x="label" y="total" height={160} /></CardContent></Card>
        <Card><CardHeader><CardTitle>By category</CardTitle></CardHeader><CardContent>
          {d.cats.length ? <Donut data={d.cats.map(([id, v]) => ({ name: catName(id), value: v, color: cat(id)?.color ?? '#94a3b8' }))} total={d.total} /> : <p className="py-4 text-center text-sm text-muted-foreground">No expenses</p>}
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Top merchants</CardTitle></CardHeader><CardContent>
          {d.merchants.length ? <RankBars rows={d.merchants.map((m) => ({ label: m.key, value: m.total, sub: `· ${m.count}×` }))} /> : <p className="py-4 text-center text-sm text-muted-foreground">No expenses</p>}
        </CardContent></Card>
        <Card><CardHeader><CardTitle>By payment source</CardTitle></CardHeader><CardContent>
          {d.sources.length ? <RankBars rows={d.sources.map((m) => ({ label: m.key, value: m.total, sub: `· ${m.count}×` }))} /> : <p className="py-4 text-center text-sm text-muted-foreground">No expenses</p>}
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Potential savings <span className="font-normal text-muted-foreground">(estimate)</span></CardTitle></CardHeader><CardContent>
          {d.potential.length ? (
            <ul className="space-y-2 text-sm">{d.potential.map((x) => (
              <li key={String(x.id)} className="flex justify-between gap-3"><span>{catName(x.id)} rose from {formatINR(x.prev)} to {formatINR(x.v)}</span><span className="shrink-0 font-medium text-success">~{formatINR(x.diff)}</span></li>))}
              <li className="pt-1 text-xs text-muted-foreground">Estimated amount you’d keep by spending at last month’s level in these categories. Not money already saved.</li>
            </ul>
          ) : <p className="text-sm text-muted-foreground">No category rose compared with last month, so there’s no estimate to show.</p>}
        </CardContent></Card>
      </div>
    </Page>
  )
}
