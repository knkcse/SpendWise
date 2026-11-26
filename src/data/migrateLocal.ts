import type { Snapshot } from './repository'

export const LOCAL_KEY = 'spendwise.v1'

export function readLocalSnapshot(): Snapshot | null {
  try { const raw = localStorage.getItem(LOCAL_KEY); return raw ? (JSON.parse(raw) as Snapshot) : null } catch { return null }
}

export function markLocalMigrated() {
  try { const raw = localStorage.getItem(LOCAL_KEY); if (raw) { localStorage.setItem(LOCAL_KEY + '.migrated', raw); localStorage.removeItem(LOCAL_KEY) } } catch { /* ignore */ }
}

/**
 * Merge data entered in device-only mode into a cloud snapshot. Default
 * categories are matched by name and payment sources by code, because the
 * device uses fixed ids while the database uses UUIDs. Transactions already in
 * the cloud (same dedupe key) are skipped.
 */
export function mergeLocalIntoCloud(local: Snapshot, cloud: Snapshot): { merged: Snapshot; added: number } {
  const catMap = new Map<string, string>()
  const custom = local.categories.filter((c) => c.userId)
  for (const c of local.categories) {
    if (c.userId) { catMap.set(c.id, c.id); continue }
    const match = cloud.categories.find((x) => !x.userId && x.name === c.name && !x.parentId)
    if (match) catMap.set(c.id, match.id)
  }
  const mapCat = (id: string | null) => (id ? catMap.get(id) ?? null : null)
  const srcMap = new Map(local.sources.map((s) => [s.id, cloud.sources.find((x) => x.code === s.code)?.id ?? null]))
  const mapSrc = (id: string | null) => (id ? srcMap.get(id) ?? null : null)

  const newCats = custom.filter((c) => !cloud.categories.some((x) => x.id === c.id)).map((c) => ({ ...c, parentId: mapCat(c.parentId) }))
  const known = new Set(cloud.transactions.map((t) => t.dedupeKey))
  const txns = local.transactions.filter((t) => !known.has(t.dedupeKey)).map((t) => ({
    ...t, categoryId: mapCat(t.categoryId), subcategoryId: mapCat(t.subcategoryId), paymentSourceId: mapSrc(t.paymentSourceId),
    splits: t.splits.map((s) => ({ ...s, categoryId: mapCat(s.categoryId) })),
  }))
  const budgets = local.budgets
    .map((b) => ({ ...b, categoryId: mapCat(b.categoryId) }))
    .filter((b) => (b.categoryId !== null || !local.categories.length || true) && !cloud.budgets.some((x) => x.month === b.month && x.categoryId === b.categoryId))
  const recurring = local.recurring.filter((r) => !cloud.recurring.some((x) => x.merchantKey === r.merchantKey && x.frequency === r.frequency)).map((r) => ({ ...r, categoryId: mapCat(r.categoryId) }))
  const rules = local.rules.filter((r) => mapCat(r.categoryId) && !cloud.rules.some((x) => x.merchantKey === r.merchantKey)).map((r) => ({ ...r, categoryId: mapCat(r.categoryId)! }))

  return {
    added: txns.length,
    merged: {
      ...cloud,
      categories: [...cloud.categories, ...newCats],
      transactions: [...txns, ...cloud.transactions],
      budgets: [...cloud.budgets, ...budgets],
      recurring: [...cloud.recurring, ...recurring],
      rules: [...cloud.rules, ...rules],
    },
  }
}
