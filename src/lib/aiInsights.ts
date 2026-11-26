import { addDays, endOfMonth, endOfWeek, format, startOfDay, startOfMonth, startOfWeek, subDays, subMonths } from 'date-fns'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { deviceTimeZone } from './summary'

export type InsightPeriod = 'daily' | 'weekly' | 'monthly'
export interface AiInsight {
  id: string; period: InsightPeriod; periodStart: string; periodEnd: string
  facts: Array<{ id: string; text: string }>
  summary: string; highlights: string[]
  recommendations: Array<{ title: string; detail: string; estimated_saving: number | null; basis: string[] }>
  model: string | null; updatedAt: string
}

/** The period so far, and the same stretch of the previous period, in the phone's time zone. */
export function insightRequest(period: InsightPeriod, now = new Date(), weekStartsOn: 0 | 1 = 1) {
  const day = (d: Date) => format(d, 'yyyy-MM-dd')
  const [from, prevFrom, prevTo, end, label, prevLabel] =
    period === 'daily' ? [startOfDay(now), startOfDay(subDays(now, 1)), subDays(now, 1), startOfDay(now), 'today', 'yesterday at this time']
    : period === 'weekly' ? [startOfWeek(now, { weekStartsOn }), addDays(startOfWeek(now, { weekStartsOn }), -7), addDays(now, -7), endOfWeek(now, { weekStartsOn }), 'this week so far', 'the same point last week']
    : [startOfMonth(now), startOfMonth(subMonths(now, 1)), subMonths(now, 1), endOfMonth(now), 'this month so far', 'the same point last month']
  return {
    period, from: from.toISOString(), to: now.toISOString(), prevFrom: prevFrom.toISOString(), prevTo: prevTo.toISOString(),
    periodStart: day(from), periodEnd: day(end), label, prevLabel, tz: deviceTimeZone(),
    monthFrom: startOfMonth(now).toISOString(), monthStart: day(startOfMonth(now)),
  }
}

type Row = Record<string, unknown>
function fromRow(r: Row): AiInsight {
  const lines = String(r.narrative ?? '').split('\n')
  return {
    id: String(r.id), period: r.period as InsightPeriod, periodStart: String(r.period_start), periodEnd: String(r.period_end),
    facts: (r.facts as AiInsight['facts']) ?? [], summary: lines.filter((l) => !l.startsWith('• ')).join(' '),
    highlights: lines.filter((l) => l.startsWith('• ')).map((l) => l.slice(2)),
    recommendations: (r.recommendations as AiInsight['recommendations']) ?? [], model: (r.model as string | null) ?? null, updatedAt: String(r.updated_at ?? r.created_at),
  }
}

export async function latestInsight(period: InsightPeriod): Promise<AiInsight | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from('ai_insights').select('*').eq('period', period).order('period_start', { ascending: false }).limit(1)
  if (error) throw new Error(error.message)
  return data?.[0] ? fromRow(data[0]) : null
}

export async function generateInsight(period: InsightPeriod, weekStartsOn: 0 | 1): Promise<AiInsight> {
  if (!supabase) throw new Error('Sign in to use AI insights.')
  const { data, error } = await supabase.functions.invoke('generate-insights', { body: insightRequest(period, new Date(), weekStartsOn) })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const res = error.context as Response
      if (res.status === 404) throw new Error('The AI function isn’t deployed in Supabase yet.')
      const body = await res.json().catch(() => null) as { error?: string } | null
      throw new Error(body?.error ?? `AI request failed (${res.status}).`)
    }
    throw new Error(/fetch|network/i.test(error.message) ? 'You’re offline. AI insights need an internet connection.' : error.message)
  }
  return fromRow((data as { insight: Row }).insight)
}
