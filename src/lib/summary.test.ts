import { describe, expect, it } from 'vitest'
import { localOverview, localSummary, timeOfDay, weekdaySeries } from './summary'
import type { Transaction } from './types'

const t = (p: Partial<Transaction>): Transaction => ({
  id: crypto.randomUUID(), type: 'debit', amount: 100, merchantName: 'Swiggy', occurredAt: '2026-11-10T13:00:00+05:30', paymentMethod: 'upi', paymentSourceId: 'gpay',
  categoryId: 'food', subcategoryId: null, origin: 'manual', status: 'confirmed', scope: 'personal', excludeFromReports: false, splits: [],
  dedupeKey: 'k', createdAt: '', updatedAt: '', ...p,
} as Transaction)
const range = { from: new Date('2026-11-01T00:00:00+05:30'), to: new Date('2026-11-30T23:59:59+05:30') }

describe('localSummary', () => {
  const ts = [
    t({ amount: 450 }), t({ amount: 50, merchantName: 'swiggy ' }),
    t({ amount: 15000, merchantName: 'DMart', categoryId: null, paymentSourceId: null, splits: [{ id: 'a', categoryId: 'groceries', amount: 10000 }, { id: 'b', categoryId: 'home', amount: 5000 }] }),
    t({ amount: 9999, excludeFromReports: true }),
    t({ amount: 85000, type: 'credit', merchantName: 'Acme' }),
    t({ amount: 70, occurredAt: '2026-10-31T23:00:00+05:30' }),
  ]
  const s = localSummary(ts, range)
  it('totals leave out excluded rows and other periods', () => {
    expect(s.spent).toBe(15500); expect(s.income).toBe(85000); expect(s.count).toBe(4); expect(s.expenseCount).toBe(3)
    expect(s.biggest?.merchant).toBe('DMart')
  })
  it('splits count per part in categories but once for sources and merchants', () => {
    expect(Object.fromEntries(s.byCategory.map((c) => [c.categoryId, c.total]))).toEqual({ groceries: 10000, home: 5000, food: 500 })
    expect(s.bySource.find((x) => x.sourceId === null)).toMatchObject({ total: 15000, count: 1 })
    expect(s.topMerchants[1]).toMatchObject({ total: 500, count: 2 })
  })
  it('groups by weekday and time of day', () => {
    // Works in any time zone: the expected slot is where 13:00 IST falls locally.
    const at = new Date('2026-11-10T13:00:00+05:30')
    expect(weekdaySeries(s, 0)[at.getDay()].total).toBe(15500)
    expect(s.byHour).toEqual([{ hour: at.getHours(), total: 15500, count: 3 }])
    expect(timeOfDay(s).reduce((a, x) => a + x.total, 0)).toBe(15500)
  })
})

describe('localOverview', () => {
  it('compares with the same point in the previous month', () => {
    const now = new Date('2026-11-15T12:00:00+05:30')
    const o = localOverview([t({ occurredAt: '2026-10-14T10:00:00+05:30', amount: 300 }), t({ occurredAt: '2026-10-20T10:00:00+05:30', amount: 999 }), t({ occurredAt: '2026-11-02T10:00:00+05:30', amount: 200 })], now, 1, 3)
    expect(o.month).toBe(200); expect(o.prevMonthToDate).toBe(300)
    expect(o.trend.map((m) => [m.month, m.spent])).toEqual([['2026-09', 0], ['2026-10', 1299], ['2026-11', 200]])
  })
})
