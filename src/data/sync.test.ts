import { describe, expect, it } from 'vitest'
import { diff } from './supabaseRepository'
import { mergeLocalIntoCloud } from './migrateLocal'
import { emptySnapshot } from './localRepository'
import type { Snapshot } from './repository'
import type { Transaction } from '@/lib/types'

const t = (id: string, p: Partial<Transaction> = {}): Transaction => ({
  id, type: 'debit', amount: 100, merchantName: 'Swiggy', occurredAt: '2026-11-10T10:00:00.000Z', paymentMethod: 'upi', paymentSourceId: 'src_gpay',
  categoryId: 'cat_food', subcategoryId: null, origin: 'manual', status: 'confirmed', scope: 'personal', excludeFromReports: false, splits: [],
  dedupeKey: 'k' + id, createdAt: '', updatedAt: '', ...p,
})

describe('diff', () => {
  it('finds new, changed and deleted rows', () => {
    const d = diff([t('1'), t('2'), t('3')], [t('1'), t('2', { amount: 5 }), t('4')], (x) => x.id)
    expect(d.upserts.map((x) => x.id)).toEqual(['2', '4']); expect(d.deletes).toEqual(['3'])
  })
})

describe('mergeLocalIntoCloud', () => {
  it('maps default category and source ids to cloud UUIDs and skips duplicates', () => {
    const local = { ...emptySnapshot(), transactions: [t('a'), t('b', { dedupeKey: 'dup' })] }
    const cloud: Snapshot = {
      ...emptySnapshot(),
      categories: [{ id: 'uuid-food', userId: null, parentId: null, name: 'Food & Dining', icon: 'utensils', color: '#000', isIncome: false }],
      sources: [{ id: 'uuid-gpay', code: 'gpay', displayName: 'Google Pay', androidPackage: null, detectionEnabled: true }],
      transactions: [t('c', { dedupeKey: 'dup' })],
    }
    const { merged, added } = mergeLocalIntoCloud(local, cloud)
    expect(added).toBe(1)
    const moved = merged.transactions.find((x) => x.id === 'a')!
    expect(moved.categoryId).toBe('uuid-food'); expect(moved.paymentSourceId).toBe('uuid-gpay')
  })
})
