import { describe, expect, it } from 'vitest'
import { budgetStatus, byCategory, detectRecurring, computeFacts, sum, expenses } from '../analytics'
import { suggestCategory } from '../categorize'
import { fingerprint } from '../dedupe'
import { mapImport, parseCSV, toCSV } from '../csv'
import { formatINR } from '../format'
import { merchantKey } from '../utils'
import { DEFAULT_CATEGORIES, DEFAULT_SOURCES } from '../defaults'
import type { Transaction } from '../types'

let n = 0
const tx = (p: Partial<Transaction>): Transaction => ({
  id: String(++n), type: 'debit', amount: 100, merchantName: 'Swiggy', occurredAt: '2026-11-10T10:00:00.000Z', paymentMethod: 'upi',
  paymentSourceId: null, categoryId: 'cat_food', subcategoryId: null, origin: 'manual', status: 'confirmed', scope: 'personal',
  excludeFromReports: false, splits: [], dedupeKey: String(n), createdAt: '', updatedAt: '', ...p,
})

describe('format', () => {
  it('uses Indian grouping', () => { expect(formatINR(1234567.5)).toBe('₹12,34,567.50'); expect(formatINR(85000)).toBe('₹85,000') })
})

describe('categorize', () => {
  it('matches Indian merchants', () => {
    expect(suggestCategory('SWIGGY*ORDER 99123', undefined, [], DEFAULT_CATEGORIES).categoryId).toBe('cat_food')
    expect(suggestCategory('Blinkit', undefined, [], DEFAULT_CATEGORIES).categoryId).toBe('cat_groceries')
    expect(suggestCategory('Netflix', undefined, [], DEFAULT_CATEGORIES).categoryId).toBe('cat_entertainment')
  })
  it('marks unknown merchants as not confident', () => expect(suggestCategory('Ramesh Kumar', undefined, [], DEFAULT_CATEGORIES).confident).toBe(false))
  it('learned rules win over keywords', () =>
    expect(suggestCategory('Swiggy', undefined, [{ merchantKey: 'swiggy', categoryId: 'cat_groceries', hits: 1 }], DEFAULT_CATEGORIES).categoryId).toBe('cat_groceries'))
})

describe('dedupe', () => {
  it('uses reference when present', () => {
    const a = fingerprint({ type: 'debit', amount: 10, merchantName: 'A', occurredAt: '2026-11-10T10:00:00Z', transactionReference: 'UTR123' })
    const b = fingerprint({ type: 'debit', amount: 99, merchantName: 'B', occurredAt: '2026-11-11T10:00:00Z', transactionReference: 'utr123' })
    expect(a).toBe(b)
  })
  it('same payment within the bucket collides, different amount does not', () => {
    const base = { type: 'debit', merchantName: 'Zomato', occurredAt: '2026-11-10T10:01:00Z' }
    expect(fingerprint({ ...base, amount: 250 })).toBe(fingerprint({ ...base, amount: 250, occurredAt: '2026-11-10T10:02:00Z' }))
    expect(fingerprint({ ...base, amount: 250 })).not.toBe(fingerprint({ ...base, amount: 251 }))
  })
  it('normalises merchant names', () => expect(merchantKey('SWIGGY@ybl 12345')).toBe('swiggy'))
})

describe('analytics', () => {
  it('excludes flagged transactions and income from expenses', () => {
    const ts = [tx({ amount: 100 }), tx({ amount: 50, excludeFromReports: true }), tx({ amount: 1000, type: 'credit' })]
    expect(sum(expenses(ts))).toBe(100)
  })
  it('splits contribute per category', () => {
    const m = byCategory([tx({ amount: 300, categoryId: null, splits: [{ id: 'a', categoryId: 'cat_food', amount: 100 }, { id: 'b', categoryId: 'cat_shopping', amount: 200 }] })])
    expect(m.get('cat_food')).toBe(100); expect(m.get('cat_shopping')).toBe(200)
  })
  it('budget status and projection', () => {
    const s = budgetStatus({ id: 'b', categoryId: null, month: '2026-11-01', amount: 3000, alertThresholds: [50, 75, 90, 100] },
      [tx({ amount: 1500, occurredAt: '2026-11-05T10:00:00' })], new Date('2026-11-15T12:00:00'))
    expect(s.pct).toBe(50); expect(s.crossed).toEqual([50]); expect(s.projected).toBe(3000)
  })
  it('detects monthly recurring only with 3+ regular similar payments', () => {
    const r = detectRecurring([
      tx({ merchantName: 'Netflix', amount: 649, occurredAt: '2026-08-05T10:00:00Z' }),
      tx({ merchantName: 'Netflix', amount: 649, occurredAt: '2026-09-05T10:00:00Z' }),
      tx({ merchantName: 'Netflix', amount: 649, occurredAt: '2026-10-05T10:00:00Z' }),
      tx({ merchantName: 'Swiggy', amount: 200, occurredAt: '2026-08-05T10:00:00Z' }),
      tx({ merchantName: 'Swiggy', amount: 900, occurredAt: '2026-09-05T10:00:00Z' }),
      tx({ merchantName: 'Swiggy', amount: 340, occurredAt: '2026-10-05T10:00:00Z' }),
    ])
    expect(r.map((x) => x.merchantName)).toEqual(['Netflix']); expect(r[0].frequency).toBe('monthly')
  })
  it('facts are empty with no data (nothing fabricated)', () => expect(computeFacts([], () => 'x')).toEqual([]))
})

describe('csv', () => {
  it('round-trips and neutralises formulas', () => {
    const csv = toCSV([tx({ merchantName: '=HYPERLINK("x")', notes: 'a, "b"' })], DEFAULT_CATEGORIES, DEFAULT_SOURCES)
    const rows = parseCSV(csv)
    expect(rows[1][3]).toBe(`'=HYPERLINK("x")`); expect(rows[1][9]).toBe('a, "b"')
  })
  it('imports bank-style CSV with dd/mm/yyyy', () => {
    const r = mapImport(parseCSV('Date,Narration,Amount\n25/11/2026,UPI-ZOMATO,"1,250.00"\nbad,X,1'))
    expect(r[0].amount).toBe(1250); expect(new Date(r[0].occurredAt).getDate()).toBe(25); expect(r[1].error).toBe('Invalid date')
  })
})
