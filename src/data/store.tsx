import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { suggestCategory } from '@/lib/categorize'
import { detectRecurring } from '@/lib/analytics'
import { fingerprint } from '@/lib/dedupe'
import { merchantKey, uid } from '@/lib/utils'
import type { Budget, Category, NewTransaction, PaymentSource, Preferences, Profile, RecurringPayment, Transaction } from '@/lib/types'
import { emptySnapshot } from './localRepository'
import type { Repository, Snapshot, SyncStatus } from './repository'

export type AddResult = { ok: true; txn: Transaction } | { ok: false; reason: 'duplicate'; existing: Transaction }

export function makeActions(get: () => Snapshot, set: (fn: (s: Snapshot) => Snapshot) => void) {
  const now = () => new Date().toISOString()

  const learn = (s: Snapshot, merchant: string, categoryId: string): Snapshot => {
    const k = merchantKey(merchant); if (!k) return s
    const ex = s.rules.find((r) => r.merchantKey === k)
    const rules = ex
      ? s.rules.map((r) => (r.merchantKey === k ? { ...r, categoryId, hits: r.categoryId === categoryId ? r.hits + 1 : 1 } : r))
      : [...s.rules, { merchantKey: k, categoryId, hits: 1 }]
    return { ...s, rules }
  }

  const build = (input: NewTransaction, s: Snapshot): Transaction => {
    let { categoryId, status } = input
    if (!categoryId && input.type === 'debit' && !input.splits.length) {
      const sug = suggestCategory(input.merchantName, input.description, s.rules, s.categories)
      categoryId = sug.categoryId
      status = sug.confident ? status : 'needs_review'
    }
    // Manual entries are never auto-deduped (two ₹20 chais are real); imports and
    // detected payments use the shared fingerprint.
    const dedupeKey = input.origin === 'manual' ? `id:${uid()}` : fingerprint(input)
    return { ...input, categoryId, status, id: uid(), dedupeKey, createdAt: now(), updatedAt: now() }
  }

  return {
    setProfile: (p: Partial<Profile>) => set((s) => ({ ...s, profile: { ...s.profile, ...p } })),
    setPrefs: (p: Partial<Preferences>) => set((s) => ({ ...s, prefs: { ...s.prefs, ...p } })),

    addTransaction(input: NewTransaction): AddResult {
      const s = get(); const txn = build(input, s)
      const existing = s.transactions.find((t) => t.dedupeKey === txn.dedupeKey)
      if (existing) return { ok: false, reason: 'duplicate', existing }
      set((s) => {
        const next = { ...s, transactions: [txn, ...s.transactions] }
        return input.categoryId ? learn(next, txn.merchantName, input.categoryId) : next
      })
      return { ok: true, txn }
    },

    /** Import rows; skips any whose fingerprint matches an existing transaction */
    importTransactions(inputs: NewTransaction[]): { added: number; skipped: number } {
      const s = get(); const seen = new Set(s.transactions.map((t) => fingerprint(t)))
      const add: Transaction[] = []
      for (const i of inputs) {
        const fp = fingerprint(i); if (seen.has(fp)) continue
        seen.add(fp); add.push({ ...build(i, s), dedupeKey: fp })
      }
      set((s) => ({ ...s, transactions: [...add, ...s.transactions] }))
      return { added: add.length, skipped: inputs.length - add.length }
    },

    updateTransaction(id: string, patch: Partial<Transaction>) {
      set((s) => {
        const old = s.transactions.find((t) => t.id === id); if (!old) return s
        const upd: Transaction = { ...old, ...patch, updatedAt: now() }
        if (patch.categoryId && patch.categoryId !== old.categoryId && upd.status === 'needs_review') upd.status = 'confirmed'
        let next = { ...s, transactions: s.transactions.map((t) => (t.id === id ? upd : t)) }
        if (patch.categoryId && patch.categoryId !== old.categoryId) next = learn(next, upd.merchantName, patch.categoryId)
        return next
      })
    },
    /** Apply one change to many transactions (bulk actions). Category changes are learned per merchant. */
    bulkUpdate(ids: string[], patch: Partial<Pick<Transaction, 'categoryId' | 'excludeFromReports' | 'scope'>>) {
      const set_ = new Set(ids)
      set((s) => {
        let next: Snapshot = { ...s, transactions: s.transactions.map((t) => {
          if (!set_.has(t.id)) return t
          const upd: Transaction = { ...t, ...patch, updatedAt: now() }
          if (patch.categoryId !== undefined) {
            if (t.splits.length || t.type === 'credit') return t // splits / income keep their own categories
            upd.subcategoryId = null
            if (patch.categoryId) upd.status = 'confirmed'
          }
          return upd
        }) }
        if (patch.categoryId) for (const t of s.transactions.filter((t) => set_.has(t.id) && !t.splits.length && t.type === 'debit')) next = learn(next, t.merchantName, patch.categoryId)
        return next
      })
    },
    bulkDelete: (ids: string[]) => { const d = new Set(ids); set((s) => ({ ...s, transactions: s.transactions.filter((t) => !d.has(t.id)) })) },
    /** Other un-split expenses from the same merchant, for "apply to all" */
    sameMerchant: (t: Transaction) => get().transactions.filter((x) => x.id !== t.id && x.type === 'debit' && !x.splits.length && merchantKey(x.merchantName) === merchantKey(t.merchantName)),
    deleteRule: (key: string) => set((s) => ({ ...s, rules: s.rules.filter((r) => r.merchantKey !== key) })),
    deleteTransaction: (id: string) => set((s) => ({ ...s, transactions: s.transactions.filter((t) => t.id !== id) })),

    addCategory(c: Omit<Category, 'id' | 'userId'>) {
      const cat: Category = { ...c, id: uid(), userId: 'me' }
      set((s) => ({ ...s, categories: [...s.categories, cat] })); return cat
    },
    updateCategory: (id: string, patch: Partial<Category>) =>
      set((s) => ({ ...s, categories: s.categories.map((c) => (c.id === id && c.userId ? { ...c, ...patch } : c)) })),
    deleteCategory: (id: string) => set((s) => {
      const target = s.categories.find((c) => c.id === id); if (!target?.userId) return s
      const removed = new Set([id, ...s.categories.filter((c) => c.parentId === id).map((c) => c.id)])
      return {
        ...s,
        categories: s.categories.filter((c) => !removed.has(c.id)),
        rules: s.rules.filter((r) => !removed.has(r.categoryId)),
        budgets: s.budgets.filter((b) => !b.categoryId || !removed.has(b.categoryId)),
        transactions: s.transactions.map((t) => ({
          ...t,
          categoryId: t.categoryId && removed.has(t.categoryId) ? null : t.categoryId,
          subcategoryId: t.subcategoryId && removed.has(t.subcategoryId) ? null : t.subcategoryId,
          status: t.categoryId && removed.has(t.categoryId) ? 'needs_review' : t.status,
        })),
      }
    }),

    setSource: (id: string, patch: Partial<PaymentSource>) =>
      set((s) => ({ ...s, sources: s.sources.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),

    upsertBudget(b: Omit<Budget, 'id'> & { id?: string }) {
      set((s) => {
        const existing = s.budgets.find((x) => x.id === b.id || (x.month === b.month && x.categoryId === b.categoryId))
        if (existing) return { ...s, budgets: s.budgets.map((x) => (x.id === existing.id ? { ...existing, ...b, id: existing.id } : x)) }
        return { ...s, budgets: [...s.budgets, { ...b, id: uid() }] }
      })
    },
    deleteBudget: (id: string) => set((s) => ({ ...s, budgets: s.budgets.filter((b) => b.id !== id) })),

    /** Re-run detection; keeps the user's confirm / reject decisions */
    refreshRecurring() {
      set((s) => {
        const found = detectRecurring(s.transactions)
        const merged: RecurringPayment[] = s.recurring.map((r) => {
          const f = found.find((x) => x.merchantKey === r.merchantKey && x.frequency === r.frequency)
          return f && r.state !== 'confirmed' ? { ...r, ...f, merchantName: r.merchantName, expectedAmount: r.expectedAmount } : r
        })
        for (const f of found) if (!merged.some((r) => r.merchantKey === f.merchantKey && r.frequency === f.frequency)) merged.push({ ...f, id: uid(), state: 'suggested' })
        return { ...s, recurring: merged }
      })
    },
    updateRecurring: (id: string, patch: Partial<RecurringPayment>) =>
      set((s) => ({ ...s, recurring: s.recurring.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
    addRecurring: (r: Omit<RecurringPayment, 'id'>) => set((s) => ({ ...s, recurring: [...s.recurring, { ...r, id: uid() }] })),
    deleteRecurring: (id: string) => set((s) => ({ ...s, recurring: s.recurring.filter((r) => r.id !== id) })),

    resetAll: () => set(() => emptySnapshot()),
    /** Replace everything (used when moving device data into a cloud account) */
    replaceAll: (next: Snapshot) => set(() => next),
  }
}

type Actions = ReturnType<typeof makeActions> & { refresh: () => Promise<boolean> }
type Store = Snapshot & Actions & { ready: boolean; loadError: string | null; repoKind: Repository['kind']; sync: SyncStatus }

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children, repo }: { children: ReactNode; repo: Repository }) {
  const [snap, setSnap] = useState<Snapshot>(emptySnapshot)
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [sync, setSync] = useState<SyncStatus>({ state: 'idle', pending: false })
  const ref = useRef(snap); ref.current = snap
  const repoRef = useRef(repo)

  useEffect(() => {
    const r = repoRef.current
    const off = r.onStatus?.(setSync)
    const offSnap = r.onSnapshot?.((next) => { ref.current = next; setSnap(next) })
    r.load().then((s) => { ref.current = s; setSnap(s); setReady(true) })
      .catch((e) => setLoadError(e?.message ?? String(e)))
    return () => { off?.(); offSnap?.(); r.dispose?.() }
  }, [])

  const set = useCallback((fn: (s: Snapshot) => Snapshot) => {
    const next = fn(ref.current); ref.current = next; setSnap(next)
    void repoRef.current.save(next)
  }, [])
  const actions = useMemo(() => ({
    ...makeActions(() => ref.current, set),
    /** Pull the latest data from the server. Resolves false if offline or changes are pending. */
    refresh: async (): Promise<boolean> => {
      const next = await repoRef.current.refresh?.().catch(() => null)
      if (!next) return false
      ref.current = next; setSnap(next); return true
    },
  }), [set])
  const value = useMemo(() => ({ ...snap, ...actions, ready, loadError, sync, repoKind: repoRef.current.kind }), [snap, actions, ready, loadError, sync])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const s = useContext(Ctx); if (!s) throw new Error('useStore outside StoreProvider'); return s
}

/** Lookup helpers */
export function useLookups() {
  const { categories, sources } = useStore()
  return useMemo(() => {
    const cat = (id: string | null | undefined) => categories.find((c) => c.id === id) ?? null
    const src = (id: string | null | undefined) => sources.find((s) => s.id === id) ?? null
    const catName = (id: string | null | undefined) => cat(id)?.name ?? 'Uncategorised'
    return { cat, src, catName }
  }, [categories, sources])
}
