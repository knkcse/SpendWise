import { useMemo, useState } from 'react'
import { addMonths, format, isAfter, startOfMonth, subMonths } from 'date-fns'
import { BellRing, ChevronLeft, ChevronRight, PieChart, Plus, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Label, Select } from '@/components/ui/input'
import { Badge, Empty, Progress, Sheet } from '@/components/ui/misc'
import { CategoryIcon } from '@/components/CategoryIcon'
import { useToast } from '@/components/toast'
import { useLookups, useStore } from '@/data/store'
import { budgetStatus, type BudgetStatus } from '@/lib/analytics'
import { monthKey } from '@/lib/dates'
import { formatINR } from '@/lib/format'
import type { Budget } from '@/lib/types'

export default function Budgets() {
  const { budgets, transactions, categories, prefs, upsertBudget, deleteBudget } = useStore()
  const { cat, catName } = useLookups()
  const toast = useToast()
  const [month, setMonth] = useState(startOfMonth(new Date()))
  const [edit, setEdit] = useState<(Partial<Budget> & { amountStr: string; thresholdsStr: string }) | null>(null)
  const mk = monthKey(month)
  const list = useMemo(() => budgets.filter((b) => b.month === mk).map((b) => budgetStatus(b, transactions)), [budgets, transactions, mk])
  const overall = list.find((s) => !s.budget.categoryId)
  const cats = list.filter((s) => s.budget.categoryId).sort((a, b) => b.pct - a.pct)
  const alerts = list.flatMap((s) => (s.crossed.length ? [{ s, t: Math.max(...s.crossed) }] : []))

  const open = (b?: Budget, categoryId: string | null = null) => setEdit({
    ...(b ?? { categoryId, month: mk }), amountStr: b ? String(b.amount) : '',
    thresholdsStr: (b?.alertThresholds ?? prefs.defaultThresholds).join(', '),
  })
  const save = () => {
    const amount = Number(edit!.amountStr)
    if (!(amount > 0)) return toast('Enter a budget amount')
    const th = [...new Set(edit!.thresholdsStr.split(/[,\s]+/).map(Number).filter((n) => n > 0 && n <= 200))].sort((a, b) => a - b)
    if (!th.length) return toast('Add at least one alert threshold, e.g. 50, 75, 90, 100')
    upsertBudget({ id: edit!.id, categoryId: edit!.categoryId ?? null, month: mk, amount, alertThresholds: th })
    toast('Budget saved'); setEdit(null)
  }
  const copyLast = () => {
    const prev = budgets.filter((b) => b.month === monthKey(subMonths(month, 1)))
    prev.forEach((b) => upsertBudget({ categoryId: b.categoryId, month: mk, amount: b.amount, alertThresholds: b.alertThresholds }))
    toast(prev.length ? `Copied ${prev.length} budgets from last month` : 'No budgets last month to copy')
  }

  return (
    <div>
      <PageHeader title="Budgets" right={<Button size="sm" onClick={() => open(undefined, overall ? '' : null)}><Plus />Add</Button>} />
      <div className="flex items-center justify-between px-4 pb-2">
        <Button size="icon" variant="ghost" onClick={() => setMonth(subMonths(month, 1))} aria-label="Previous month"><ChevronLeft /></Button>
        <p className="text-sm font-medium">{format(month, 'MMMM yyyy')}</p>
        <Button size="icon" variant="ghost" onClick={() => setMonth(addMonths(month, 1))} disabled={isAfter(month, new Date())} aria-label="Next month"><ChevronRight /></Button>
      </div>

      <div className="space-y-4 px-4">
        {prefs.budgetAlerts && alerts.length > 0 && (
          <Card className="space-y-2 border-warning/30 bg-warning/5 p-4">
            {alerts.map(({ s, t }) => (
              <p key={s.budget.id} className="flex gap-2 text-sm"><BellRing className="size-4 shrink-0 text-warning" />
                {s.budget.categoryId ? catName(s.budget.categoryId) : 'Overall budget'}: {t >= 100 ? 'budget reached' : `${t}% used`} ({formatINR(s.spent)} of {formatINR(s.budget.amount)})</p>
            ))}
          </Card>
        )}

        {overall ? <BudgetCard s={overall} title="Overall monthly budget" onClick={() => open(overall.budget)} big /> : (
          <Card><Empty icon={<PieChart />} title="No overall budget" body={`Set a spending limit for ${format(month, 'MMMM')}.`}
            action={<div className="flex gap-2"><Button size="sm" onClick={() => open(undefined, null)}>Set budget</Button><Button size="sm" variant="outline" onClick={copyLast}>Copy last month</Button></div>} /></Card>
        )}

        {cats.length > 0 && <p className="px-1 pt-2 text-xs font-medium text-muted-foreground">Category budgets</p>}
        {cats.map((s) => (
          <BudgetCard key={s.budget.id} s={s} title={catName(s.budget.categoryId)} icon={<CategoryIcon category={cat(s.budget.categoryId)} className="size-9" />} onClick={() => open(s.budget)} />
        ))}
        {overall && <Button variant="outline" className="w-full" onClick={() => open(undefined, '')}><Plus />Add category budget</Button>}
      </div>

      <Sheet open={!!edit} onOpenChange={(o) => !o && setEdit(null)} title={edit?.id ? 'Edit budget' : 'New budget'}>
        {edit && (
          <div className="space-y-4">
            {!edit.id && (
              <div><Label>Applies to</Label>
                <Select value={edit.categoryId ?? 'overall'} onChange={(e) => setEdit({ ...edit, categoryId: e.target.value === 'overall' ? null : e.target.value })}>
                  {!overall && <option value="overall">Overall (all spending)</option>}
                  <option value="" disabled>Choose a category</option>
                  {categories.filter((c) => !c.parentId && !c.isIncome && !list.some((s) => s.budget.categoryId === c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select></div>
            )}
            <div><Label htmlFor="bamt">Monthly limit (₹)</Label><Input id="bamt" inputMode="decimal" type="number" min={1} value={edit.amountStr} onChange={(e) => setEdit({ ...edit, amountStr: e.target.value })} /></div>
            <div><Label htmlFor="bth">Alert at (% used)</Label><Input id="bth" value={edit.thresholdsStr} onChange={(e) => setEdit({ ...edit, thresholdsStr: e.target.value })} placeholder="50, 75, 90, 100" /></div>
            <div className="flex gap-2">
              {edit.id && <Button variant="outline" className="text-destructive" onClick={() => { deleteBudget(edit.id!); setEdit(null); toast('Budget deleted') }}><Trash2 />Delete</Button>}
              <Button className="flex-1" disabled={edit.categoryId === ''} onClick={save}>Save</Button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  )
}

function BudgetCard({ s, title, icon, onClick, big }: { s: BudgetStatus; title: string; icon?: React.ReactNode; onClick: () => void; big?: boolean }) {
  const tone = s.pct >= 100 ? 'over' : s.pct >= 75 ? 'warn' : 'ok'
  const projectedOver = s.projected > s.budget.amount
  return (
    <Card className="cursor-pointer p-4 active:bg-muted/40" onClick={onClick}>
      <div className="flex items-center gap-3">
        {icon}
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{formatINR(s.spent)} of {formatINR(s.budget.amount)}</p></div>
        <Badge tone={tone === 'over' ? 'danger' : tone === 'warn' ? 'warning' : 'primary'}>{Math.round(s.pct)}%</Badge>
      </div>
      <Progress className="mt-3" value={s.pct} tone={tone} />
      <div className={`mt-2 flex justify-between text-xs ${big ? '' : 'text-muted-foreground'}`}>
        <span>{s.remaining >= 0 ? `${formatINR(s.remaining)} left` : `${formatINR(-s.remaining)} over`}</span>
        <span className={projectedOver ? 'text-destructive' : 'text-muted-foreground'}>Projected {formatINR(s.projected)}</span>
      </div>
    </Card>
  )
}
