import type { Budget, Category, MerchantRule, PaymentSource, Preferences, Profile, RecurringPayment, Transaction } from '@/lib/types'

/** Everything the app persists. Phase 1: LocalRepository (on-device). Phase 2: SupabaseRepository. */
export interface Snapshot {
  profile: Profile
  transactions: Transaction[]
  categories: Category[]
  sources: PaymentSource[]
  budgets: Budget[]
  recurring: RecurringPayment[]
  rules: MerchantRule[]
  prefs: Preferences
}

export interface Repository {
  readonly kind: 'local' | 'supabase'
  load(): Promise<Snapshot>
  save(next: Snapshot): Promise<void>
  clear(): Promise<void>
}
