// Pure analytics over real stored transactions. Nothing here invents data:
// every number is derived from the transactions passed in.
import { eachDayOfInterval, format, startOfMonth, endOfMonth, subMonths, differenceInCalendarDays, addDays, isWithinInterval } from 'date-fns'
import type { DateRange } from './dates'
import type { Budget, RecurringFreq, RecurringPayment, Transaction } from './types'
import { merchantKey } from './utils'

export const inRange = (t: Transaction, r: DateRange) => isWithinInterval(new Date(t.occurredAt), { start: r.from, end: r.to })

/** Transactions that count toward reports */
export const reportable = (ts: Transaction[]) => ts.filter((t) => !t.excludeFromReports)
export const expenses = (ts: Transaction[]) => reportable(ts).filter((t) => t.type === 'debit')
export const income = (ts: Transaction[]) => reportable(ts).filter((t) => t.type === 'credit')
export const sum = (ts: Transaction[]) => round2(ts.reduce((a, t) => a + t.amount, 0))
export const round2 = (n: number) => Math.round(n * 100) / 100

export function within(ts: Transaction[], r: DateRange) { return ts.filter((t) => inRange(t, r)) }

/** Category totals; split transactions contribute each part to its own category */
export function byCategory(ts: Transaction[]): Map<string | null, number> {
  const m = new Map<string | null, number>()
  for (const t of expenses(ts)) {
    if (t.splits.length) for (const s of t.splits) m.set(s.categoryId, round2((m.get(s.categoryId) ?? 0) + s.amount))
    else m.set(t.categoryId, round2((m.get(t.categoryId) ?? 0) + t.amount))
  }
  return m
}

export function groupSum<K>(ts: Transaction[], key: (t: Transaction) => K): Array<{ key: K; total: number; count: number }> {
  const m = new Map<K, { total: number; count: number }>()
  for (const t of ts) {
    const k = key(t); const v = m.get(k) ?? { total: 0, count: 0 }
    v.total = round2(v.total + t.amount); v.count++; m.set(k, v)
  }
  return [...m.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.total - a.total)
}

export function dailySeries(ts: Transaction[], r: DateRange) {
  const ex = expenses(within(ts, r))
  return eachDayOfInterval({ start: r.from, end: r.to }).map((d) => {
    const k = format(d, 'yyyy-MM-dd')
    return { date: k, label: format(d, 'EEE d'), total: sum(ex.filter((t) => format(new Date(t.occurredAt), 'yyyy-MM-dd') === k)) }
  })
}

export function monthlyTrend(ts: Transaction[], months = 6, now = new Date()) {
  return Array.from({ length: months }, (_, i) => {
    const d = subMonths(now, months - 1 - i)
    const r = { from: startOfMonth(d), to: endOfMonth(d) }
    const w = within(ts, r)
    return { month: format(d, 'MMM'), expenses: sum(expenses(w)), income: sum(income(w)) }
  })
}

export function pctChange(curr: number, prev: number): number | null {
  if (prev === 0) return null
  return ((curr - prev) / prev) * 100
}

export function biggest(ts: Transaction[]): Transaction | null {
  return expenses(ts).reduce<Transaction | null>((a, t) => (!a || t.amount > a.amount ? t : a), null)
}

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------
export interface BudgetStatus {
  budget: Budget; spent: number; remaining: number; pct: number; projected: number; crossed: number[]
}

export function budgetStatus(b: Budget, ts: Transaction[], now = new Date()): BudgetStatus {
  const from = new Date(b.month + 'T00:00:00'); const to = endOfMonth(from)
  const w = within(ts, { from, to })
  const spent = b.categoryId ? round2(byCategory(w).get(b.categoryId) ?? 0) : sum(expenses(w))
  const totalDays = differenceInCalendarDays(to, from) + 1
  const elapsed = now < from ? 0 : now > to ? totalDays : differenceInCalendarDays(now, from) + 1
  const projected = elapsed > 0 ? round2((spent / elapsed) * totalDays) : 0
  const pct = b.amount > 0 ? (spent / b.amount) * 100 : 0
  return { budget: b, spent, remaining: round2(b.amount - spent), pct, projected, crossed: b.alertThresholds.filter((x) => pct >= x) }
}

// ---------------------------------------------------------------------------
// Recurring detection. Conservative: needs >= 3 payments to the same merchant
// with similar amounts (+-10%) and regular spacing. Results are *suggestions*
// that the user must confirm.
// ---------------------------------------------------------------------------
const FREQS: Array<[RecurringFreq, number, number]> = [['weekly', 6, 8], ['monthly', 26, 35], ['quarterly', 85, 97], ['yearly', 355, 375]]
const FREQ_DAYS: Record<RecurringFreq, number> = { weekly: 7, monthly: 30, quarterly: 91, yearly: 365 }

export function detectRecurring(ts: Transaction[]): Omit<RecurringPayment, 'id' | 'state'>[] {
  const groups = new Map<string, Transaction[]>()
  for (const t of ts.filter((t) => t.type === 'debit')) {
    const k = merchantKey(t.merchantName); if (!k) continue
    groups.set(k, [...(groups.get(k) ?? []), t])
  }
  const out: Omit<RecurringPayment, 'id' | 'state'>[] = []
  for (const [k, list] of groups) {
    if (list.length < 3) continue
    const sorted = [...list].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    const amounts = sorted.map((t) => t.amount)
    const median = [...amounts].sort((a, b) => a - b)[Math.floor(amounts.length / 2)]
    if (!amounts.every((a) => Math.abs(a - median) <= median * 0.1)) continue
    const gaps = sorted.slice(1).map((t, i) => differenceInCalendarDays(new Date(t.occurredAt), new Date(sorted[i].occurredAt)))
    const freq = FREQS.find(([, lo, hi]) => gaps.every((g) => g >= lo && g <= hi))
    if (!freq) continue
    const last = sorted[sorted.length - 1]
    out.push({
      merchantKey: k, merchantName: last.merchantName, expectedAmount: median, frequency: freq[0],
      categoryId: last.categoryId, lastPaidAt: last.occurredAt,
      nextExpectedAt: addDays(new Date(last.occurredAt), FREQ_DAYS[freq[0]]).toISOString(), occurrences: sorted.length,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// Fact-based insights (no AI). Phase 5 sends these facts to the backend model,
// which may only phrase them and suggest actions, never change the numbers.
// ---------------------------------------------------------------------------
export interface Fact { id: string; text: string; kind: 'fact' | 'trend' | 'alert' }

export function computeFacts(ts: Transaction[], catName: (id: string | null) => string, now = new Date()): Fact[] {
  const cur = { from: startOfMonth(now), to: now }
  const prevStart = startOfMonth(subMonths(now, 1))
  const prev = { from: prevStart, to: addDays(prevStart, differenceInCalendarDays(now, cur.from)) } // same days elapsed
  const cw = within(ts, cur); const pw = within(ts, prev)
  const facts: Fact[] = []
  const cats = [...byCategory(cw).entries()].sort((a, b) => b[1] - a[1])
  const prevCats = byCategory(pw)
  const fmt = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
  if (cats[0]) facts.push({ id: 'top-cat', kind: 'fact', text: `Your highest spending category this month is ${catName(cats[0][0])} at ${fmt(cats[0][1])}.` })
  for (const [cid, amt] of cats.slice(0, 5)) {
    const p = prevCats.get(cid) ?? 0; const ch = pctChange(amt, p)
    if (ch !== null && Math.abs(ch) >= 15 && p >= 500)
      facts.push({ id: `trend-${cid}`, kind: 'trend', text: `${catName(cid)} spending is ${ch > 0 ? 'up' : 'down'} ${Math.abs(ch).toFixed(0)}% compared with the same point last month (${fmt(p)} → ${fmt(amt)}).` })
  }
  const merchants = groupSum(expenses(cw), (t) => t.merchantName)
  const freq = [...merchants].sort((a, b) => b.count - a.count)[0]
  if (freq && freq.count >= 3) facts.push({ id: 'freq-merchant', kind: 'fact', text: `You paid ${freq.key} ${freq.count} times this month, totalling ${fmt(freq.total)}.` })
  const small = expenses(cw).filter((t) => t.amount <= 200)
  if (small.length >= 10) facts.push({ id: 'small', kind: 'fact', text: `${small.length} small payments of ₹200 or less added up to ${fmt(sum(small))} this month.` })
  const ex = expenses(within(ts, { from: subMonths(now, 3), to: now }))
  if (ex.length >= 10) {
    const mean = sum(ex) / ex.length
    const sd = Math.sqrt(ex.reduce((a, t) => a + (t.amount - mean) ** 2, 0) / ex.length)
    const unusual = expenses(cw).filter((t) => t.amount > mean + 3 * sd)
    for (const t of unusual.slice(0, 2)) facts.push({ id: `unusual-${t.id}`, kind: 'alert', text: `${fmt(t.amount)} at ${t.merchantName} on ${format(new Date(t.occurredAt), 'd MMM')} is much larger than your usual payments.` })
  }
  return facts
}
