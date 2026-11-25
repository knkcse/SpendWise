import type { Category, PaymentSource, Preferences } from './types'

// Stable ids so local data survives reloads; Supabase rows use their own UUIDs
// and are mapped by name during the Phase 2 migration.
const c = (id: string, name: string, icon: string, color: string, isIncome = false): Category =>
  ({ id: `cat_${id}`, userId: null, parentId: null, name, icon, color, isIncome })

export const DEFAULT_CATEGORIES: Category[] = [
  c('food', 'Food & Dining', 'utensils', '#f97316'),
  c('groceries', 'Groceries', 'shopping-basket', '#84cc16'),
  c('shopping', 'Shopping', 'shopping-bag', '#ec4899'),
  c('transport', 'Transportation', 'car', '#0ea5e9'),
  c('fuel', 'Fuel', 'fuel', '#eab308'),
  c('rent', 'Rent', 'home', '#8b5cf6'),
  c('utilities', 'Electricity & Utilities', 'zap', '#f59e0b'),
  c('mobile', 'Mobile & Internet', 'smartphone', '#06b6d4'),
  c('entertainment', 'Entertainment', 'clapperboard', '#ef4444'),
  c('health', 'Healthcare', 'heart-pulse', '#10b981'),
  c('travel', 'Travel', 'plane', '#3b82f6'),
  c('education', 'Education', 'graduation-cap', '#6366f1'),
  c('emi', 'EMI & Loans', 'landmark', '#a855f7'),
  c('invest', 'Investments', 'trending-up', '#22c55e'),
  c('care', 'Personal Care', 'sparkles', '#d946ef'),
  c('insurance', 'Insurance', 'shield', '#14b8a6'),
  c('other', 'Other', 'circle-ellipsis', '#64748b'),
  c('salary', 'Salary', 'wallet', '#16a34a', true),
  c('income_other', 'Other Income', 'plus-circle', '#15803d', true),
]

export const DEFAULT_SOURCES: PaymentSource[] = [
  { id: 'src_gpay', code: 'gpay', displayName: 'Google Pay', androidPackage: 'com.google.android.apps.nbu.paisa.user', detectionEnabled: true },
  { id: 'src_phonepe', code: 'phonepe', displayName: 'PhonePe', androidPackage: 'com.phonepe.app', detectionEnabled: true },
  { id: 'src_paytm', code: 'paytm', displayName: 'Paytm', androidPackage: 'net.one97.paytm', detectionEnabled: true },
  { id: 'src_cred', code: 'cred', displayName: 'CRED', androidPackage: 'com.dreamplug.androidapp', detectionEnabled: true },
  { id: 'src_bank', code: 'bank', displayName: 'Bank apps', androidPackage: null, detectionEnabled: true },
  { id: 'src_card', code: 'card', displayName: 'Credit / Debit card', androidPackage: null, detectionEnabled: false },
  { id: 'src_cash', code: 'cash', displayName: 'Cash', androidPackage: null, detectionEnabled: false },
]

export const DEFAULT_PREFS: Preferences = {
  theme: 'system', detectionEnabled: false, budgetAlerts: true,
  defaultThresholds: [50, 75, 90, 100], weekStartsOn: 1, aiInsightsEnabled: true,
}

export const PAYMENT_METHOD_LABELS = {
  upi: 'UPI', credit_card: 'Credit card', debit_card: 'Debit card', net_banking: 'Net banking',
  cash: 'Cash', wallet: 'Wallet', other: 'Other',
} as const
