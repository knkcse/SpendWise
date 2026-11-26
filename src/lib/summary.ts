// Period analytics in one shape, computed either on the phone (this file) or by
// Postgres (supabase/migrations/20261126040000_analytics.sql). Both follow the same rules:
//   * transactions marked "exclude from reports" are left out everywhere;
//   * split parts count in their own categories; everything else counts a split
//     transaction's full amount once.
import { addDays, eachDayOfInterval, format, startOfDay, startOfMonth, startOfWeek, startOfYear, subMonths, subYears } from 'date-fns'
import type { DateRange } from './dates'
import type { Transaction } from './types'
import { round2 } from './analytics'

export interface Bucket { total: number; count: number }
export interface PeriodSummary {
  spent: number; income: number; count: number; expenseCount: number
  biggest: { id: string; merchant: string; amount: number; occurredAt: string } | null
  byCategory: Array<Bucket & { categoryId: string | null }>
  bySource: Array<Bucket & { sourceId: string | null }>
  topMerchants: Array<Bucket & { merchant: string }>
  /** Only days with activity, yyyy-MM-dd in local time. Use fillDays() for a chart. */
  daily: Array<{ date: string; spent: number; income: number }>
  /** 0 = Sunday ... 6 = Saturday (expenses only) */
  byWeekday: Array<Bucket & { dow: number }>
  /** 0..23 local hour (expenses only) */
  byHour: Array<Bucket & { hour: number }>
}

export interface Overview {
  today: number; week: number; month: number; year: number; monthIncome: number
  prevWeekToDate: number; prevMonthToDate: number; prevYearToDate: number
  trend: Array<{ month: string; spent: number; income: number }> // month = yyyy-MM
}

const byTotal = <T extends Bucket>(a: T, b: T) => b.total - a.total || b.count - a.count

function bucket<K>(m: Map<K, Bucket>, k: K, amount: number) {
  const v = m.get(k) ?? { total: 0, count: 0 }
  v.total = round2(v.total + amount); v.count++; m.set(k, v)
}

export function localSummary(all: Transaction[], r: DateRange): PeriodSummary {
  const from = r.from.getTime(), to = r.to.getTime()
  const tx = all.filter((t) => { const x = Date.parse(t.occurredAt); return !t.excludeFromReports && x >= from && x <= to })
  const ex = tx.filter((t) => t.type === 'debit')
  const cats = new Map<string | null, Bucket>(), srcs = new Map<string | null, Bucket>(), wd = new Map<number, Bucket>(), hr = new Map<number, Bucket>()
  const merch = new Map<string, Bucket & { name: string; last: string }>()
  const days = new Map<string, { spent: number; income: number }>()
  let biggest: Transaction | null = null
  for (const t of tx) {
    const d = new Date(t.occurredAt); const k = format(d, 'yyyy-MM-dd')
    const day = days.get(k) ?? { spent: 0, income: 0 }
    if (t.type === 'debit') day.spent = round2(day.spent + t.amount); else day.income = round2(day.income + t.amount)
    days.set(k, day)
  }
  for (const t of ex) {
    if (t.splits.length) for (const s of t.splits) bucket(cats, s.categoryId, s.amount)
    else bucket(cats, t.categoryId, t.amount)
    bucket(srcs, t.paymentSourceId, t.amount)
    const d = new Date(t.occurredAt)
    bucket(wd, d.getDay(), t.amount); bucket(hr, d.getHours(), t.amount)
    const mk = t.merchantName.trim().toLowerCase()
    const m = merch.get(mk) ?? { total: 0, count: 0, name: t.merchantName, last: t.occurredAt }
    m.total = round2(m.total + t.amount); m.count++
    if (t.occurredAt > m.last) { m.last = t.occurredAt; m.name = t.merchantName }
    merch.set(mk, m)
    if (!biggest || t.amount > biggest.amount || (t.amount === biggest.amount && t.occurredAt < biggest.occurredAt)) biggest = t
  }
  const sumOf = (ts: Transaction[]) => round2(ts.reduce((a, t) => a + t.amount, 0))
  return {
    spent: sumOf(ex), income: sumOf(tx.filter((t) => t.type === 'credit')), count: tx.length, expenseCount: ex.length,
    biggest: biggest ? { id: biggest.id, merchant: biggest.merchantName, amount: biggest.amount, occurredAt: biggest.occurredAt } : null,
    byCategory: [...cats].map(([categoryId, v]) => ({ categoryId, ...v })).sort(byTotal),
    bySource: [...srcs].map(([sourceId, v]) => ({ sourceId, ...v })).sort(byTotal),
    topMerchants: [...merch.values()].sort(byTotal).slice(0, 10).map((m) => ({ merchant: m.name, total: m.total, count: m.count })),
    daily: [...days].sort((a, b) => a[0].localeCompare(b[0])).map(([date, v]) => ({ date, ...v })),
    byWeekday: [...wd].map(([dow, v]) => ({ dow, ...v })).sort((a, b) => a.dow - b.dow),
    byHour: [...hr].map(([hour, v]) => ({ hour, ...v })).sort((a, b) => a.hour - b.hour),
  }
}

export function localOverview(all: Transaction[], now: Date, weekStartsOn: 0 | 1, months = 6): Overview {
  const tx = all.filter((t) => !t.excludeFromReports && Date.parse(t.occurredAt) <= now.getTime())
  const spentBetween = (a: Date, b: Date, type: 'debit' | 'credit' = 'debit') => {
    const x0 = a.getTime(), x1 = b.getTime()
    return round2(tx.reduce((s, t) => { const x = Date.parse(t.occurredAt); return t.type === type && x >= x0 && x <= x1 ? s + t.amount : s }, 0))
  }
  const d = startOfDay(now), w = startOfWeek(now, { weekStartsOn }), m = startOfMonth(now), y = startOfYear(now)
  return {
    today: spentBetween(d, now), week: spentBetween(w, now), month: spentBetween(m, now), year: spentBetween(y, now),
    monthIncome: spentBetween(m, now, 'credit'),
    prevWeekToDate: spentBetween(addDays(w, -7), addDays(now, -7)),
    prevMonthToDate: spentBetween(subMonths(m, 1), subMonths(now, 1)),
    prevYearToDate: spentBetween(subYears(y, 1), subYears(now, 1)),
    trend: Array.from({ length: Math.max(months, 1) }, (_, i) => {
      const a = subMonths(m, Math.max(months, 1) - 1 - i); const b = new Date(startOfMonth(subMonths(a, -1)).getTime() - 1)
      return { month: format(a, 'yyyy-MM'), spent: spentBetween(a, b), income: spentBetween(a, b, 'credit') }
    }),
  }
}

// ---------------------------------------------------------------------------
// Server JSON -> the same shape
// ---------------------------------------------------------------------------
type Json = Record<string, unknown>
const n = (v: unknown) => round2(Number(v ?? 0))
const arr = (v: unknown) => (Array.isArray(v) ? (v as Json[]) : [])

export function fromServerSummary(j: Json): PeriodSummary {
  const b = j.biggest as Json | null
  return {
    spent: n(j.spent), income: n(j.income), count: Number(j.count ?? 0), expenseCount: Number(j.expense_count ?? 0),
    biggest: b ? { id: String(b.id), merchant: String(b.merchant), amount: n(b.amount), occurredAt: new Date(String(b.occurred_at)).toISOString() } : null,
    byCategory: arr(j.by_category).map((x) => ({ categoryId: (x.category_id as string | null) ?? null, total: n(x.total), count: Number(x.count) })).sort(byTotal),
    bySource: arr(j.by_source).map((x) => ({ sourceId: (x.source_id as string | null) ?? null, total: n(x.total), count: Number(x.count) })).sort(byTotal),
    topMerchants: arr(j.top_merchants).map((x) => ({ merchant: String(x.merchant), total: n(x.total), count: Number(x.count) })).sort(byTotal),
    daily: arr(j.daily).map((x) => ({ date: String(x.date), spent: n(x.spent), income: n(x.income) })),
    byWeekday: arr(j.by_weekday).map((x) => ({ dow: Number(x.dow), total: n(x.total), count: Number(x.count) })),
    byHour: arr(j.by_hour).map((x) => ({ hour: Number(x.hour), total: n(x.total), count: Number(x.count) })),
  }
}

export function fromServerOverview(j: Json): Overview {
  return {
    today: n(j.today), week: n(j.week), month: n(j.month), year: n(j.year), monthIncome: n(j.month_income),
    prevWeekToDate: n(j.prev_week_to_date), prevMonthToDate: n(j.prev_month_to_date), prevYearToDate: n(j.prev_year_to_date),
    trend: arr(j.trend).map((x) => ({ month: String(x.month), spent: n(x.spent), income: n(x.income) })),
  }
}

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------
/** One entry per day in the range, zero where nothing was spent. */
export function fillDays(s: PeriodSummary, r: DateRange) {
  const m = new Map(s.daily.map((d) => [d.date, d]))
  return eachDayOfInterval({ start: r.from, end: r.to }).map((d) => {
    const k = format(d, 'yyyy-MM-dd')
    return { date: k, label: format(d, 'EEE d'), total: m.get(k)?.spent ?? 0 }
  })
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export function weekdaySeries(s: PeriodSummary, weekStartsOn: 0 | 1) {
  const m = new Map(s.byWeekday.map((x) => [x.dow, x]))
  return Array.from({ length: 7 }, (_, i) => (i + weekStartsOn) % 7).map((dow) => ({ label: DOW[dow], total: m.get(dow)?.total ?? 0, count: m.get(dow)?.count ?? 0 }))
}

export const TIME_SLOTS = [
  { label: 'Morning', sub: '5 am – 12 pm', hours: [5, 6, 7, 8, 9, 10, 11] },
  { label: 'Afternoon', sub: '12 – 5 pm', hours: [12, 13, 14, 15, 16] },
  { label: 'Evening', sub: '5 – 10 pm', hours: [17, 18, 19, 20, 21] },
  { label: 'Night', sub: '10 pm – 5 am', hours: [22, 23, 0, 1, 2, 3, 4] },
]
export function timeOfDay(s: PeriodSummary) {
  return TIME_SLOTS.map((slot) => {
    const xs = s.byHour.filter((h) => slot.hours.includes(h.hour))
    return { label: slot.label, sub: slot.sub, total: round2(xs.reduce((a, x) => a + x.total, 0)), count: xs.reduce((a, x) => a + x.count, 0) }
  })
}

/** The device's IANA time zone for the analytics functions. Older Android reports India as the legacy "Asia/Calcutta". */
export function deviceTimeZone(): string {
  let tz = 'Asia/Kolkata'
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz } catch { /* keep default */ }
  return tz === 'Asia/Calcutta' ? 'Asia/Kolkata' : tz
}
