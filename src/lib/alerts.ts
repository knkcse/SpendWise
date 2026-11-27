// Phase 6: what to notify about. Pure functions only (no Capacitor), so they can be tested.
// Budget alerts and payment reminders are worked out from the stored data on the phone.
import { addDays, addMonths, addWeeks, addYears, differenceInCalendarDays, format, setHours, setMinutes, startOfDay, startOfMonth } from 'date-fns'
import { budgetStatus } from './analytics'
import { formatINR } from './format'
import type { Budget, RecurringFreq, RecurringPayment, Transaction } from './types'
import { merchantKey } from './utils'

// ---------------------------------------------------------------------------
// Budget alerts
// ---------------------------------------------------------------------------
export interface BudgetAlert { budgetId: string; threshold: number; title: string; body: string }

/**
 * Budgets for the current month that crossed a threshold not yet alerted.
 * `sent` holds keys "budgetId:threshold". Only the highest newly crossed threshold of each
 * budget produces an alert. The returned `sent` keeps only thresholds that are still crossed,
 * so raising a budget (or deleting a payment) lets the alert fire again later.
 */
export function budgetAlerts(budgets: Budget[], txs: Transaction[], sent: string[], catName: (id: string | null) => string, now = new Date()) {
  const month = format(startOfMonth(now), 'yyyy-MM-dd')
  const keep = new Set<string>(); const alerts: BudgetAlert[] = []
  for (const b of budgets.filter((b) => b.month === month && b.amount > 0)) {
    const st = budgetStatus(b, txs, now)
    const crossed = [...st.crossed].sort((a, z) => a - z)
    const fresh = crossed.filter((t) => !sent.includes(`${b.id}:${t}`))
    crossed.forEach((t) => keep.add(`${b.id}:${t}`))
    if (!fresh.length) continue
    const t = fresh[fresh.length - 1]
    const name = b.categoryId ? catName(b.categoryId) : 'Monthly'
    const label = b.categoryId ? `${name} budget` : 'Monthly budget'
    const over = st.spent - b.amount
    alerts.push(over > 0 || t >= 100
      ? { budgetId: b.id, threshold: t, title: over > 0 ? `Over budget: ${name}` : `${label} fully used`,
          body: over > 0 ? `${formatINR(st.spent)} spent of ${formatINR(b.amount)} this month. Over by ${formatINR(over)}.` : `${formatINR(st.spent)} spent of ${formatINR(b.amount)}. Nothing left for ${format(now, 'MMMM')}.` }
      : { budgetId: b.id, threshold: t, title: `${label}: ${Math.floor(st.pct)}% used`,
          body: `${formatINR(st.spent)} spent of ${formatINR(b.amount)}. ${formatINR(st.remaining)} left for ${format(now, 'MMMM')}.` })
  }
  return { alerts, sent: [...keep] }
}

// ---------------------------------------------------------------------------
// Recurring payments: keeping confirmed ones up to date, and reminders
// ---------------------------------------------------------------------------
export function advance(d: Date, f: RecurringFreq): Date {
  return f === 'weekly' ? addWeeks(d, 1) : f === 'monthly' ? addMonths(d, 1) : f === 'quarterly' ? addMonths(d, 3) : addYears(d, 1)
}

/**
 * For confirmed recurring payments, finds newer payments to the same merchant with a similar
 * amount (within 20%) and moves "last paid" and "next due" forward. Returns null if nothing changed.
 */
export function rollForward(recurring: RecurringPayment[], txs: Transaction[]): RecurringPayment[] | null {
  let changed = false
  const out = recurring.map((r) => {
    if (r.state !== 'confirmed') return r
    const paid = txs.filter((t) => t.type === 'debit' && merchantKey(t.merchantName) === r.merchantKey
      && Math.abs(t.amount - r.expectedAmount) <= r.expectedAmount * 0.2 && (!r.lastPaidAt || t.occurredAt > r.lastPaidAt))
    if (!paid.length) return r
    const last = paid.reduce((a, t) => (t.occurredAt > a.occurredAt ? t : a))
    // A payment made well before the due date (more than half a cycle early) is a different one.
    if (r.nextExpectedAt && r.lastPaidAt) {
      const early = differenceInCalendarDays(new Date(r.nextExpectedAt), new Date(last.occurredAt))
      const cycle = differenceInCalendarDays(advance(new Date(r.lastPaidAt), r.frequency), new Date(r.lastPaidAt))
      if (early > cycle / 2) return r
    }
    changed = true
    return { ...r, lastPaidAt: last.occurredAt, nextExpectedAt: advance(new Date(last.occurredAt), r.frequency).toISOString(), occurrences: r.occurrences + paid.length }
  })
  return changed ? out : null
}

export interface Reminder { id: number; recurringId: string; at: Date; title: string; body: string }

/** Small stable number for a notification id (Android needs a 32-bit int). */
export function notificationId(key: string, base: number): number {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0
  return base + (Math.abs(h) % 1_000_000)
}
export const REMINDER_BASE = 2_000_000, BUDGET_BASE = 1_000_000

/**
 * Reminders for confirmed recurring payments due in the next 45 days, at 9 am local time,
 * `daysBefore` days ahead of the due date. Reminders whose time has already passed are left out.
 */
export function reminderPlan(recurring: RecurringPayment[], now: Date, daysBefore: number, hour = 9): Reminder[] {
  const today = startOfDay(now)
  const out: Reminder[] = []
  for (const r of recurring) {
    if (r.state !== 'confirmed' || !r.nextExpectedAt) continue
    const due = startOfDay(new Date(r.nextExpectedAt))
    const daysAway = differenceInCalendarDays(due, today)
    if (daysAway < 0 || daysAway > 45) continue
    const at = setMinutes(setHours(addDays(due, -daysBefore), hour), 0)
    if (at.getTime() <= now.getTime()) continue
    const when = daysBefore === 0 ? 'today' : daysBefore === 1 ? 'tomorrow' : `on ${format(due, 'EEE d MMM')}`
    out.push({
      id: notificationId(`${r.id}:${format(due, 'yyyy-MM-dd')}`, REMINDER_BASE), recurringId: r.id, at,
      title: `${r.merchantName} is due ${when}`,
      body: `${formatINR(r.expectedAmount)} ${r.frequency} payment, expected ${format(due, 'd MMM')}.`,
    })
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime())
}
