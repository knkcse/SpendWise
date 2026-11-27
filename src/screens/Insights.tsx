import { useEffect, useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Link } from 'react-router-dom'
import { AlertTriangle, BarChart3, CalendarDays, CalendarRange, ChevronDown, ChevronRight, Info, Lightbulb, Loader2, RefreshCw, Repeat, Sparkles, TrendingUp } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge, Empty, Segmented } from '@/components/ui/misc'
import { generateInsight, latestInsight, type AiInsight, type InsightPeriod } from '@/lib/aiInsights'
import { formatINR } from '@/lib/format'
import { useLookups, useStore } from '@/data/store'
import { computeFacts } from '@/lib/analytics'

const ICON = { fact: <BarChart3 />, trend: <TrendingUp />, alert: <AlertTriangle /> }

export default function Insights() {
  const { transactions, recurring } = useStore()
  const { catName } = useLookups()
  const facts = useMemo(() => computeFacts(transactions, catName, new Date(), recurring), [transactions, catName, recurring])
  const suggested = recurring.filter((r) => r.state === 'suggested').length

  return (
    <div>
      <PageHeader title="Insights" subtitle="Based only on transactions you’ve recorded" />
      <div className="space-y-4 px-4">
        <div className="grid grid-cols-4 gap-2">
          {[{ to: '/reports/weekly', label: 'Weekly', icon: CalendarDays }, { to: '/reports/monthly', label: 'Monthly', icon: BarChart3 }, { to: '/reports/custom', label: 'Custom', icon: CalendarRange }, { to: '/recurring', label: 'Recurring', icon: Repeat }].map(({ to, label, icon: I }) => (
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

        <AiCard />

        <Link to="/recurring" className="flex items-center gap-3 rounded-2xl border bg-card p-4 text-sm">
          <Repeat className="size-5 text-primary" /><span className="flex-1">Subscriptions & recurring payments</span><ChevronRight className="size-4 text-muted-foreground" />
        </Link>
      </div>
    </div>
  )
}

const PERIODS: Array<{ value: InsightPeriod; label: string }> = [{ value: 'daily', label: 'Today' }, { value: 'weekly', label: 'This week' }, { value: 'monthly', label: 'This month' }]

/** AI summary written by the backend from facts it computes itself. The app never sees the AI key. */
function AiCard() {
  const { repoKind, prefs } = useStore()
  const [period, setPeriod] = useState<InsightPeriod>('weekly')
  const [items, setItems] = useState<Partial<Record<InsightPeriod, AiInsight | null>>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showFacts, setShowFacts] = useState(false)
  const signedIn = repoKind === 'supabase'

  useEffect(() => {
    if (!signedIn || period in items) return
    latestInsight(period).then((x) => setItems((m) => ({ ...m, [period]: x }))).catch(() => setItems((m) => ({ ...m, [period]: null })))
  }, [period, signedIn]) // eslint-disable-line react-hooks/exhaustive-deps

  const run = async () => {
    setBusy(true); setError(null)
    try { const x = await generateInsight(period, prefs.weekStartsOn); setItems((m) => ({ ...m, [period]: x })) } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  const it = items[period]

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-primary" />AI summary</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        {!signedIn ? (
          <p className="flex gap-2 rounded-xl bg-muted p-3 text-xs text-muted-foreground"><Info className="size-4 shrink-0" />Sign in to get AI summaries. They are written on the server from your synced transactions.</p>
        ) : !prefs.aiInsightsEnabled ? (
          <p className="flex gap-2 rounded-xl bg-muted p-3 text-xs text-muted-foreground"><Info className="size-4 shrink-0" />AI insights are turned off in Profile settings.</p>
        ) : (<>
          <Segmented value={period} onChange={(p) => { setPeriod(p); setError(null); setShowFacts(false) }} options={PERIODS} />
          {it === undefined ? <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading…</p>
          : it === null ? <p className="text-muted-foreground">No AI summary for this period yet. Tap Generate to create one from your recorded transactions.</p>
          : (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="leading-relaxed">{it.summary}</p>
                {it.highlights.length > 0 && <ul className="list-disc space-y-1 pl-5 text-muted-foreground">{it.highlights.map((h) => <li key={h}>{h}</li>)}</ul>}
              </div>
              {it.recommendations.length > 0 && (
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Lightbulb className="size-3.5" />Saving ideas</p>
                  <ol className="space-y-2">{it.recommendations.map((r, i) => (
                    <li key={i} className="rounded-xl border p-3">
                      <div className="flex items-start justify-between gap-2"><p className="font-medium">{i + 1}. {r.title}</p>
                        {r.estimated_saving ? <Badge tone="success" className="shrink-0 whitespace-nowrap">~{formatINR(r.estimated_saving)} est.</Badge> : null}</div>
                      <p className="mt-1 text-muted-foreground">{r.detail}</p>
                    </li>))}</ol>
                  <p className="mt-2 text-[11px] text-muted-foreground">Savings are estimates of what you could keep, not money already saved.</p>
                </div>
              )}
              <button className="flex items-center gap-1 text-xs font-medium text-primary" onClick={() => setShowFacts(!showFacts)} aria-expanded={showFacts}>
                <ChevronDown className={`size-3.5 transition-transform ${showFacts ? 'rotate-180' : ''}`} />Numbers this is based on ({it.facts.length})</button>
              {showFacts && <ul className="space-y-1.5 rounded-xl bg-muted p-3 text-xs text-muted-foreground">{it.facts.map((f) => <li key={f.id}>{f.text}</li>)}</ul>}
              <p className="text-[11px] text-muted-foreground">Updated {formatDistanceToNow(new Date(it.updatedAt), { addSuffix: true })}{it.model ? ` · written by ${it.model.split(':')[1] ?? it.model}` : ''} · numbers calculated from your data, not by the AI</p>
            </div>
          )}
          {error && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-destructive">{error}</p>}
          <Button className="w-full" onClick={run} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : it ? <RefreshCw /> : <Sparkles />}{busy ? 'Writing your summary…' : it ? 'Refresh summary' : 'Generate summary'}</Button>
        </>)}
      </CardContent>
    </Card>
  )
}
