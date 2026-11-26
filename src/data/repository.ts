import type { Budget, Category, MerchantRule, PaymentSource, Preferences, Profile, RecurringPayment, Transaction } from '@/lib/types'

/** Everything the app persists. LocalRepository = device only; SupabaseRepository = cloud with an on-device cache. */
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

export interface SyncStatus { state: 'idle' | 'syncing' | 'offline' | 'error'; pending: boolean; message?: string; lastSyncedAt?: string }

export interface Repository {
  readonly kind: 'local' | 'supabase'
  load(): Promise<Snapshot>
  save(next: Snapshot): Promise<void>
  clear(): Promise<void>
  onStatus?(cb: (s: SyncStatus) => void): () => void
  dispose?(): void
  /** Re-read from the server (other devices' changes). Returns null if local changes are still pending. */
  refresh?(): Promise<Snapshot | null>
  /** Repository changed the data itself (e.g. dropped a duplicate another device already saved). */
  onSnapshot?(cb: (s: Snapshot) => void): () => void
}
