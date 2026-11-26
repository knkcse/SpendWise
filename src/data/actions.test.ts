import { describe, expect, it } from 'vitest'
import { makeActions } from './store'
import { emptySnapshot } from './localRepository'
import type { Snapshot } from './repository'
import type { NewTransaction } from '@/lib/types'

function harness() {
  let s: Snapshot = emptySnapshot()
  const a = makeActions(() => s, (fn) => { s = fn(s) })
  return { a, get: () => s }
}
const base = (p: Partial<NewTransaction>): NewTransaction => ({
  type: 'debit', amount: 100, merchantName: 'Ramesh Stores', occurredAt: '2026-11-20T10:00:00Z', paymentMethod: 'upi', paymentSourceId: null,
  categoryId: null, subcategoryId: null, origin: 'manual', status: 'confirmed', scope: 'personal', excludeFromReports: false, splits: [], ...p,
})

describe('expense actions', () => {
  it('unknown merchant needs review; correcting it learns the merchant', () => {
    const { a, get } = harness()
    const r = a.addTransaction(base({})); if (!r.ok) throw new Error()
    expect(r.txn.status).toBe('needs_review')
    a.updateTransaction(r.txn.id, { categoryId: 'cat_food' })
    expect(get().transactions[0].status).toBe('confirmed')
    const r2 = a.addTransaction(base({ merchantName: 'RAMESH STORES' })); if (!r2.ok) throw new Error()
    expect(r2.txn.categoryId).toBe('cat_food')
  })
  it('bulk category change skips splits and income, and finds same-merchant rows', () => {
    const { a, get } = harness()
    a.addTransaction(base({})); a.addTransaction(base({}))
    a.addTransaction(base({ type: 'credit', merchantName: 'Ramesh Stores' }))
    a.addTransaction(base({ categoryId: null, splits: [{ id: 's', categoryId: 'cat_food', amount: 100 }] }))
    const first = get().transactions[3]
    expect(a.sameMerchant(first).length).toBe(1) // the other plain debit; income and split excluded
    a.bulkUpdate(get().transactions.map((t) => t.id), { categoryId: 'cat_shopping' })
    const ts = get().transactions
    expect(ts.filter((t) => t.categoryId === 'cat_shopping').length).toBe(2)
    expect(ts.find((t) => t.type === 'credit')!.categoryId).not.toBe('cat_shopping')
    expect(ts.find((t) => t.splits.length)!.categoryId).toBeNull()
    expect(get().rules[0]).toMatchObject({ merchantKey: 'ramesh stores', categoryId: 'cat_shopping' })
  })
  it('CSV import skips rows already present', () => {
    const { a } = harness()
    const row = base({ origin: 'csv_import', transactionReference: 'UTR1' })
    expect(a.importTransactions([row, row])).toEqual({ added: 1, skipped: 1 })
    expect(a.importTransactions([row])).toEqual({ added: 0, skipped: 1 })
  })
})
