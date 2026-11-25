// Domain types. These mirror the Supabase tables in supabase/migrations so the
// local repository (Phase 1) and the Supabase repository (Phase 2) are swappable.

export type TxnType = 'debit' | 'credit'
export type PaymentMethod = 'upi' | 'credit_card' | 'debit_card' | 'net_banking' | 'cash' | 'wallet' | 'other'
export type TxnOrigin = 'manual' | 'android_notification' | 'csv_import'
export type TxnStatus = 'confirmed' | 'needs_review'
export type TxnScope = 'personal' | 'business'
export type PaymentSourceCode = 'gpay' | 'phonepe' | 'paytm' | 'cred' | 'bank' | 'card' | 'cash' | 'other'

export interface Category {
  id: string
  userId: string | null // null = system default
  parentId: string | null
  name: string
  icon: string
  color: string
  isIncome: boolean
}

export interface PaymentSource {
  id: string
  code: PaymentSourceCode
  displayName: string
  androidPackage: string | null
  detectionEnabled: boolean
}

export interface Split {
  id: string
  categoryId: string | null
  amount: number
  note?: string
}

export interface Transaction {
  id: string
  type: TxnType
  amount: number
  merchantName: string
  merchantRaw?: string
  occurredAt: string // ISO
  paymentMethod: PaymentMethod
  paymentSourceId: string | null
  categoryId: string | null
  subcategoryId: string | null
  description?: string
  notes?: string
  transactionReference?: string
  sourceNotificationId?: string
  origin: TxnOrigin
  status: TxnStatus
  scope: TxnScope
  excludeFromReports: boolean
  splits: Split[]
  dedupeKey: string
  createdAt: string
  updatedAt: string
}

export type NewTransaction = Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'dedupeKey'>

export interface Budget {
  id: string
  categoryId: string | null // null = overall
  month: string // yyyy-MM-01
  amount: number
  alertThresholds: number[]
}

export type RecurringFreq = 'weekly' | 'monthly' | 'quarterly' | 'yearly'
export type RecurringState = 'suggested' | 'confirmed' | 'rejected'

export interface RecurringPayment {
  id: string
  merchantKey: string
  merchantName: string
  expectedAmount: number
  frequency: RecurringFreq
  categoryId: string | null
  lastPaidAt: string | null
  nextExpectedAt: string | null
  occurrences: number
  state: RecurringState
}

export interface MerchantRule {
  merchantKey: string
  categoryId: string
  hits: number
}

export interface Preferences {
  theme: 'light' | 'dark' | 'system'
  detectionEnabled: boolean
  budgetAlerts: boolean
  defaultThresholds: number[]
  weekStartsOn: 0 | 1
  aiInsightsEnabled: boolean
}

export interface Profile {
  fullName: string
  email: string | null
  onboarded: boolean
}
