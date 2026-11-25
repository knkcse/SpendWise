import { DEFAULT_CATEGORIES, DEFAULT_PREFS, DEFAULT_SOURCES } from '@/lib/defaults'
import type { Repository, Snapshot } from './repository'

const KEY = 'spendwise.v1'

export function emptySnapshot(): Snapshot {
  return {
    profile: { fullName: '', email: null, onboarded: false },
    transactions: [], categories: DEFAULT_CATEGORIES, sources: DEFAULT_SOURCES,
    budgets: [], recurring: [], rules: [], prefs: DEFAULT_PREFS,
  }
}

/** On-device storage. Data never leaves the phone in this mode. */
export class LocalRepository implements Repository {
  readonly kind = 'local' as const
  async load(): Promise<Snapshot> {
    try {
      const raw = localStorage.getItem(KEY)
      if (!raw) return emptySnapshot()
      const base = emptySnapshot()
      const s = JSON.parse(raw) as Partial<Snapshot>
      return { ...base, ...s, prefs: { ...base.prefs, ...s.prefs }, profile: { ...base.profile, ...s.profile } }
    } catch {
      return emptySnapshot()
    }
  }
  async save(next: Snapshot) {
    try { localStorage.setItem(KEY, JSON.stringify(next)) } catch (e) { console.error('SpendWise: could not save to device storage', e) }
  }
  async clear() { try { localStorage.removeItem(KEY) } catch { /* storage unavailable */ } }
}
