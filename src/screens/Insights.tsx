import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, BarChart3, CalendarDays, ChevronRight, Info, Repeat, Sparkles, TrendingUp } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Empty } from '@/components/ui/misc'
import { useLookups, useStore } from '@/data/store'
import { computeFacts } from '@/lib/analytics'

const ICON = { fact: <BarChart3 />, trend: <TrendingUp />, alert: <AlertTriangle /> }

export default function Insights() {
  const { transactions, recurring, repoKind } = useStore()
  const { catName } = useLookups()
  const facts = useMemo(() => computeFacts(transactions, catName), [transactions, catName])
  const suggested = recurring.filter((r) => r.state === 'suggested').length

  return (
    <div>
      <PageHeader title="Insights" subtitle="Based only on transactions you’ve recorded" />
      <div className="space-y-4 px-4">
        <div className="grid grid-cols-3 gap-2">
          {[{ to: '/reports/weekly', label: 'Weekly', icon: CalendarDays }, { to: '/reports/monthly', label: 'Monthly', icon: BarChart3 }, { to: '/recurring', label: 'Recurring', icon: Repeat }].map(({ to, label, icon: I }) => (
            <Link key={to} to={to} className="relative flex flex-col items-center gap-1.5 rounded-2xl border bg-card p-3 text-xs font-medium">
              <span className="grid size-9 place-items-center rounded-xl bg-accent text-accent-foreground"><I className="size-4" /></span>{label}
              {label === 'Recurring' && suggested > 0 && <span className="absolute right-2 top-2 grid size-5 place-items-center rounded-full bg-primary text-[10px] text-primary-foreground">{suggested}</span>}
            </Link>
          ))}
        </div>

        <Card>
          <CardHeader><CardTitle>What your data shows this month</CardTitle></CardHeader>
          {facts.length ? (
            <ul className="divide-y">{facts.map((f) => (
              <li key={f.id} className="flex gap-3 px-4 py-3 text-sm">
                <span className={`mt-0.5 shrink-0 [&_svg]:size-4 ${f.kind === 'alert' ? 'text-warning' : 'text-primary'}`}>{ICON[f.kind]}</span><span>{f.text}</span>
              </li>))}</ul>
          ) : (
            <Empty icon={<BarChart3 />} title="Not enough data yet" body="Insights appear once you have a few transactions this month. Nothing here is estimated or made up." />
          )}
        </Card>

        <Card className="border-dashed">
          <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-primary" />AI assistant</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Daily insights, weekly summaries, monthly reports and three saving recommendations will be written by an AI model running in a secure backend function. The model only receives the totals computed above, never raw notifications, and can’t change any numbers.</p>
            <p className="flex gap-2 rounded-xl bg-muted p-3 text-xs"><Info className="size-4 shrink-0" />
              {repoKind === 'local' ? 'Not connected yet. This needs a Supabase project and an AI API key on the server (Phase 5).' : 'Backend connected. AI insights arrive in Phase 5.'}</p>
            <Button className="w-full" disabled>Generate AI summary</Button>
          </CardContent>
        </Card>

        <Link to="/recurring" className="flex items-center gap-3 rounded-2xl border bg-card p-4 text-sm">
          <Repeat className="size-5 text-primary" /><span className="flex-1">Subscriptions & recurring payments</span><ChevronRight className="size-4 text-muted-foreground" />
        </Link>
      </div>
    </div>
  )
}
