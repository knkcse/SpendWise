import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_PREFS } from '@/lib/defaults'
import type { Repository, Snapshot, SyncStatus } from './repository'
import * as M from './mappers'

const PAGE = 1000

/** Items in `next` that are new or changed vs `prev`, and ids that disappeared. */
export function diff<T>(prev: T[], next: T[], key: (x: T) => string) {
  const before = new Map(prev.map((x) => [key(x), JSON.stringify(x)]))
  const after = new Set(next.map(key))
  return {
    upserts: next.filter((x) => before.get(key(x)) !== JSON.stringify(x)),
    deletes: prev.filter((x) => !after.has(key(x))).map(key),
  }
}

interface Cache { current: Snapshot; synced: Snapshot | null }

/**
 * Supabase-backed storage. The UI works on an in-memory snapshot; every save is
 * cached on the device first, then the difference from the last confirmed sync
 * is written to Supabase. If the phone is offline or a write fails, the change
 * stays cached and is retried when the connection returns.
 */
export class SupabaseRepository implements Repository {
  readonly kind = 'supabase' as const
  private synced: Snapshot | null = null
  private current: Snapshot | null = null
  private flushing: Promise<void> | null = null
  private dirty = false
  private listeners = new Set<(s: SyncStatus) => void>()
  private status: SyncStatus = { state: 'idle', pending: false }
  private timer: ReturnType<typeof setInterval>
  private readonly cacheKey: string

  constructor(private db: SupabaseClient, private userId: string, private email: string | null) {
    this.cacheKey = `spendwise.cloud.${userId}`
    window.addEventListener('online', this.retry)
    this.timer = setInterval(this.retry, 30_000)
  }

  dispose() { window.removeEventListener('online', this.retry); clearInterval(this.timer) }

  onStatus(cb: (s: SyncStatus) => void) { this.listeners.add(cb); cb(this.status); return () => { this.listeners.delete(cb) } }
  private setStatus(s: Partial<SyncStatus>) { this.status = { ...this.status, ...s }; this.listeners.forEach((l) => l(this.status)) }
  private retry = () => { if (this.status.pending && navigator.onLine) void this.flush() }

  private readCache(): Cache | null {
    try { const raw = localStorage.getItem(this.cacheKey); return raw ? (JSON.parse(raw) as Cache) : null } catch { return null }
  }
  private writeCache() {
    try { localStorage.setItem(this.cacheKey, JSON.stringify({ current: this.current, synced: this.synced })) } catch { /* storage full or blocked */ }
  }

  async load(): Promise<Snapshot> {
    const cache = this.readCache()
    // Unsynced changes on this device win: keep them and push them up.
    if (cache?.current && JSON.stringify(cache.current) !== JSON.stringify(cache.synced)) {
      this.current = cache.current; this.synced = cache.synced
      this.setStatus({ pending: true }); void this.flush()
      return this.current
    }
    try {
      const snap = await this.fetchAll()
      this.current = snap; this.synced = snap; this.writeCache()
      this.setStatus({ state: 'idle', pending: false, lastSyncedAt: new Date().toISOString(), message: undefined })
      return snap
    } catch (e) {
      if (cache?.current) { this.current = cache.current; this.synced = cache.synced; this.setStatus({ state: 'offline', message: errMsg(e) }); return cache.current }
      throw e
    }
  }

  async save(next: Snapshot) {
    this.current = next; this.writeCache()
    this.setStatus({ pending: true })
    await this.flush()
  }

  async clear() {
    try { localStorage.removeItem(this.cacheKey) } catch { /* ignore */ }
  }

  private async flush(): Promise<void> {
    if (this.flushing) { this.dirty = true; return this.flushing }
    this.flushing = (async () => {
      do {
        this.dirty = false
        const target = this.current!
        this.setStatus({ state: 'syncing' })
        try {
          await this.push(this.synced, target)
          this.synced = target; this.writeCache()
          this.setStatus({ state: 'idle', pending: this.current !== target, lastSyncedAt: new Date().toISOString(), message: undefined })
        } catch (e) {
          this.setStatus({ state: navigator.onLine ? 'error' : 'offline', pending: true, message: errMsg(e) })
          return
        }
      } while (this.dirty || this.current !== this.synced)
    })().finally(() => { this.flushing = null })
    return this.flushing
  }

  private async fetchAll(): Promise<Snapshot> {
    const db = this.db
    const all = async (table: string, order = 'created_at') => {
      const rows: Record<string, unknown>[] = []
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await db.from(table).select('*').order(order).range(from, from + PAGE - 1)
        if (error) throw error
        rows.push(...(data ?? []))
        if (!data || data.length < PAGE) return rows
      }
    }
    const [profile, prefs, cats, sources, txns, splits, budgets, recurring, rules] = await Promise.all([
      db.from('profiles').select('*').eq('id', this.userId).maybeSingle(),
      db.from('user_preferences').select('*').eq('user_id', this.userId).maybeSingle(),
      all('categories'), all('payment_sources'), all('transactions', 'occurred_at'), all('transaction_splits'),
      all('budgets'), all('recurring_transactions'), all('merchant_category_rules'),
    ])
    if (profile.error) throw profile.error
    if (prefs.error) throw prefs.error
    return {
      profile: {
        fullName: (profile.data?.full_name as string) ?? '', email: this.email, onboarded: true,
        avatarUrl: profile.data?.avatar_url ?? null, phone: profile.data?.phone ?? null, dateOfBirth: profile.data?.date_of_birth ?? null,
        city: profile.data?.city ?? null, occupation: profile.data?.occupation ?? null,
      },
      prefs: prefs.data ? M.prefsFromRow(prefs.data) : DEFAULT_PREFS,
      categories: cats.map(M.categoryFromRow),
      sources: sources.map(M.sourceFromRow),
      transactions: txns.map((t) => M.txnFromRow(t, splits)).reverse(),
      budgets: budgets.map(M.budgetFromRow),
      recurring: recurring.map(M.recurringFromRow),
      rules: rules.map(M.ruleFromRow),
    }
  }

  /** Write the difference between two snapshots. Parents are written before children, deletes children-first. */
  private async push(prev: Snapshot | null, next: Snapshot) {
    const db = this.db; const uid = this.userId
    const p: Snapshot = prev ?? { ...next, transactions: [], categories: [], sources: [], budgets: [], recurring: [], rules: [], profile: { ...next.profile, fullName: '\u0000' }, prefs: { ...next.prefs, theme: '\u0000' as never } }
    const ok = <T extends { error: unknown }>(r: T) => { if (r.error) throw r.error; return r }

    const profileRow = (x: Snapshot['profile']) => ({
      id: uid, full_name: x.fullName || null, avatar_url: x.avatarUrl ?? null, phone: x.phone || null,
      date_of_birth: x.dateOfBirth || null, city: x.city || null, occupation: x.occupation || null,
    })
    if (JSON.stringify(profileRow(p.profile)) !== JSON.stringify(profileRow(next.profile))) ok(await db.from('profiles').upsert(profileRow(next.profile)))
    if (JSON.stringify(p.prefs) !== JSON.stringify(next.prefs)) ok(await db.from('user_preferences').upsert(M.prefsToRow(next.prefs, uid)))

    const src = diff(p.sources, next.sources, (s) => s.id)
    if (src.upserts.length) ok(await db.from('payment_sources').upsert(src.upserts.map((s) => M.sourceToRow(s, uid))))

    const own = (c: { userId: string | null }) => c.userId !== null
    const cat = diff(p.categories.filter(own), next.categories.filter(own), (c) => c.id)
    const catUp = [...cat.upserts].sort((a, b) => Number(!!a.parentId) - Number(!!b.parentId))
    if (catUp.length) ok(await db.from('categories').upsert(catUp.map((c) => M.categoryToRow(c, uid))))

    const tx = diff(p.transactions, next.transactions, (t) => t.id)
    for (let i = 0; i < tx.upserts.length; i += 500) {
      const chunk = tx.upserts.slice(i, i + 500)
      ok(await db.from('transactions').upsert(chunk.map((t) => M.txnToRow(t, uid))))

      const prevSplit = new Set(p.transactions.filter((t) => t.splits.length).map((t) => t.id))
      const touched = chunk.filter((t) => t.splits.length || prevSplit.has(t.id)).map((t) => t.id)
      if (touched.length) ok(await db.from('transaction_splits').delete().in('transaction_id', touched))
      const splitRows = chunk.flatMap((t) => t.splits.map((s) => M.splitToRow(s, t.id, uid)))
      if (splitRows.length) ok(await db.from('transaction_splits').insert(splitRows))
    }

    const bud = diff(p.budgets, next.budgets, (b) => b.id)
    if (bud.upserts.length) ok(await db.from('budgets').upsert(bud.upserts.map((b) => M.budgetToRow(b, uid))))
    const rec = diff(p.recurring, next.recurring, (r) => r.id)
    if (rec.upserts.length) ok(await db.from('recurring_transactions').upsert(rec.upserts.map((r) => M.recurringToRow(r, uid))))
    const rul = diff(p.rules, next.rules, (r) => r.merchantKey)
    if (rul.upserts.length) ok(await db.from('merchant_category_rules').upsert(rul.upserts.map((r) => M.ruleToRow(r, uid)), { onConflict: 'user_id,merchant_key' }))

    if (rul.deletes.length) ok(await db.from('merchant_category_rules').delete().in('merchant_key', rul.deletes))
    if (rec.deletes.length) ok(await db.from('recurring_transactions').delete().in('id', rec.deletes))
    if (bud.deletes.length) ok(await db.from('budgets').delete().in('id', bud.deletes))
    for (let i = 0; i < tx.deletes.length; i += 500) ok(await db.from('transactions').delete().in('id', tx.deletes.slice(i, i + 500)))
    if (cat.deletes.length) ok(await db.from('categories').delete().in('id', cat.deletes))
  }
}

function errMsg(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return String(e)
}
