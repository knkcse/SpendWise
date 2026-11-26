import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@/data/store'
import { supabase } from '@/lib/supabase'
import type { DateRange } from '@/lib/dates'
import { deviceTimeZone, fromServerOverview, fromServerSummary, localOverview, localSummary, type Overview, type PeriodSummary } from '@/lib/summary'

/** Where the numbers on screen came from. */
export type AnalyticsSource = 'server' | 'device'

// Results keyed by request + data version, shared across screens for the session.
const cache = new Map<string, unknown>()
// Set when the SQL functions aren't installed yet (Phase 4 SQL not run): stop asking.
let serverMissing = false

/**
 * Account analytics come from Postgres (supabase/migrations/..._analytics.sql) when the
 * phone is signed in and fully synced. Otherwise, or if the call fails, the same numbers
 * are computed on the phone, so the screens always work offline.
 */
function useServer<T>(rpc: string, args: Record<string, unknown> | null, parse: (j: Record<string, unknown>) => T, local: T): { data: T; source: AnalyticsSource } {
  const { repoKind, sync, transactions } = useStore()
  const version = useMemo(() => `${transactions.length}:${transactions.reduce((m, t) => (t.updatedAt > m ? t.updatedAt : m), '')}`, [transactions])
  const eligible = !!supabase && repoKind === 'supabase' && sync.state === 'idle' && !sync.pending && !serverMissing && args !== null
  // The 10-minute bucket refreshes "today"/"this week" figures that depend on the clock.
  const key = `${rpc}:${JSON.stringify(args)}:${version}:${Math.floor(Date.now() / 600000)}`
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!eligible || cache.has(key) || !supabase) return
    let alive = true
    const timer = setTimeout(async () => {
      const { data, error } = await supabase!.rpc(rpc, args!)
      if (error) {
        if (error.code === 'PGRST202' || /could not find the function/i.test(error.message)) serverMissing = true
        return
      }
      cache.set(key, parse(data as Record<string, unknown>))
      if (alive) setTick((x) => x + 1)
    }, 250)
    return () => { alive = false; clearTimeout(timer) }
  }, [eligible, key]) // eslint-disable-line react-hooks/exhaustive-deps

  return eligible && cache.has(key) ? { data: cache.get(key) as T, source: 'server' } : { data: local, source: 'device' }
}

export function useSummary(r: DateRange): { data: PeriodSummary; source: AnalyticsSource } {
  const { transactions } = useStore()
  const from = r.from.getTime(), to = r.to.getTime()
  const local = useMemo(() => localSummary(transactions, r), [transactions, from, to]) // eslint-disable-line react-hooks/exhaustive-deps
  const args = useMemo(() => ({ p_from: new Date(from).toISOString(), p_to: new Date(to).toISOString(), p_tz: deviceTimeZone() }), [from, to])
  return useServer('analytics_summary', args, fromServerSummary, local)
}

export function useOverview(months = 6): { data: Overview; source: AnalyticsSource } {
  const { transactions, prefs } = useStore()
  // "now" is fixed per minute so the request key stays stable while the screen is open.
  const minute = Math.floor(Date.now() / 60000)
  const local = useMemo(() => localOverview(transactions, new Date(), prefs.weekStartsOn, months), [transactions, prefs.weekStartsOn, months, minute]) // eslint-disable-line react-hooks/exhaustive-deps
  const args = useMemo(() => ({ p_tz: deviceTimeZone(), p_week_start: prefs.weekStartsOn, p_months: months }), [prefs.weekStartsOn, months])
  return useServer('analytics_overview', args, fromServerOverview, local)
}
