// Row <-> domain mapping for Supabase tables (snake_case <-> camelCase).
import type { Budget, Category, MerchantRule, PaymentSource, Preferences, RecurringPayment, Split, Transaction } from '@/lib/types'

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const num = (v: unknown) => Number(v)
const opt = <T,>(v: T | null | undefined) => (v === null ? undefined : v)

export const categoryFromRow = (r: Row): Category => ({
  id: r.id, userId: r.user_id, parentId: r.parent_id, name: r.name, icon: r.icon ?? 'tag', color: r.color ?? '#64748b', isIncome: r.is_income,
})
export const categoryToRow = (c: Category, userId: string) => ({
  id: c.id, user_id: userId, parent_id: c.parentId, name: c.name, icon: c.icon, color: c.color, is_income: c.isIncome,
})

export const sourceFromRow = (r: Row): PaymentSource => ({
  id: r.id, code: r.code, displayName: r.display_name, androidPackage: r.android_package, detectionEnabled: r.detection_enabled,
})
export const sourceToRow = (s: PaymentSource, userId: string) => ({
  id: s.id, user_id: userId, code: s.code, display_name: s.displayName, android_package: s.androidPackage, detection_enabled: s.detectionEnabled,
})

export const txnFromRow = (r: Row, splits: Row[]): Transaction => ({
  id: r.id, type: r.type, amount: num(r.amount), merchantName: r.merchant_name, merchantRaw: opt(r.merchant_raw), occurredAt: new Date(r.occurred_at).toISOString(),
  paymentMethod: r.payment_method, paymentSourceId: r.payment_source_id, categoryId: r.category_id, subcategoryId: r.subcategory_id,
  description: opt(r.description), notes: opt(r.notes), transactionReference: opt(r.transaction_reference), sourceNotificationId: opt(r.source_notification_id),
  origin: r.origin, status: r.status, scope: r.scope, excludeFromReports: r.exclude_from_reports,
  splits: splits.filter((s) => s.transaction_id === r.id).map((s): Split => ({ id: s.id, categoryId: s.category_id, amount: num(s.amount), note: opt(s.note) })),
  dedupeKey: r.dedupe_key, createdAt: r.created_at, updatedAt: r.updated_at,
})
export const txnToRow = (t: Transaction, userId: string) => ({
  id: t.id, user_id: userId, type: t.type, amount: t.amount, merchant_name: t.merchantName, merchant_raw: t.merchantRaw ?? null, occurred_at: t.occurredAt,
  payment_method: t.paymentMethod, payment_source_id: t.paymentSourceId, category_id: t.categoryId, subcategory_id: t.subcategoryId,
  description: t.description ?? null, notes: t.notes ?? null, transaction_reference: t.transactionReference ?? null, source_notification_id: t.sourceNotificationId ?? null,
  origin: t.origin, status: t.status, scope: t.scope, exclude_from_reports: t.excludeFromReports, is_split: t.splits.length > 0, dedupe_key: t.dedupeKey,
})
export const splitToRow = (s: Split, txnId: string, userId: string) => ({ id: s.id, user_id: userId, transaction_id: txnId, category_id: s.categoryId, amount: s.amount, note: s.note ?? null })

export const budgetFromRow = (r: Row): Budget => ({ id: r.id, categoryId: r.category_id, month: r.month, amount: num(r.amount), alertThresholds: r.alert_thresholds })
export const budgetToRow = (b: Budget, userId: string) => ({ id: b.id, user_id: userId, category_id: b.categoryId, month: b.month, amount: b.amount, alert_thresholds: b.alertThresholds })

export const recurringFromRow = (r: Row): RecurringPayment => ({
  id: r.id, merchantKey: r.merchant_key, merchantName: r.merchant_name, expectedAmount: num(r.expected_amount), frequency: r.frequency, categoryId: r.category_id,
  lastPaidAt: r.last_paid_at, nextExpectedAt: r.next_expected_at, occurrences: r.occurrences, state: r.state,
})
export const recurringToRow = (r: RecurringPayment, userId: string) => ({
  id: r.id, user_id: userId, merchant_key: r.merchantKey, merchant_name: r.merchantName, expected_amount: r.expectedAmount, frequency: r.frequency,
  category_id: r.categoryId, last_paid_at: r.lastPaidAt, next_expected_at: r.nextExpectedAt, occurrences: r.occurrences, state: r.state,
})

export const ruleFromRow = (r: Row): MerchantRule => ({ merchantKey: r.merchant_key, categoryId: r.category_id, hits: r.hits })
export const ruleToRow = (r: MerchantRule, userId: string) => ({ user_id: userId, merchant_key: r.merchantKey, category_id: r.categoryId, hits: r.hits })

export const prefsFromRow = (r: Row): Preferences => ({
  theme: r.theme, detectionEnabled: r.detection_enabled, budgetAlerts: r.budget_alerts, defaultThresholds: r.default_thresholds,
  weekStartsOn: r.week_starts_on === 0 ? 0 : 1, aiInsightsEnabled: r.ai_insights_enabled,
})
export const prefsToRow = (p: Preferences, userId: string) => ({
  user_id: userId, theme: p.theme, detection_enabled: p.detectionEnabled, budget_alerts: p.budgetAlerts, default_thresholds: p.defaultThresholds,
  week_starts_on: p.weekStartsOn, ai_insights_enabled: p.aiInsightsEnabled,
})
