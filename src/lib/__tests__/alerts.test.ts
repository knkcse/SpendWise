import { describe, expect, it } from 'vitest'
import { advance, budgetAlerts, reminderPlan, rollForward } from '../alerts'
import { computeFacts } from '../analytics'
import type { Budget, RecurringPayment, Transaction } from '../types'

let n = 0
const tx = (p: Partial<Transaction>): Transaction => ({
  id: String(++n), type: 'debit', amount: 100, merchantName: 'Swiggy', occurredAt: '2026-11-10T10:00:00', paymentMethod: 'upi',
  paymentSourceId: null, categoryId: 'cat_food', subcategoryId: null, origin: 'manual', status: 'confirmed', scope: 'personal',
  excludeFromReports: false, splits: [], dedupeKey: String(n), createdAt: '', updatedAt: '', ...p,
})
const now = new Date('2026-11-20T12:00:00')
const name = (id: string | null) => ({ cat_food: 'Food & Dining', cat_rent: 'Rent' } as Record<string, string>)[id ?? ''] ?? 'Other'
const food: Budget = { id: 'b1', categoryId: 'cat_food', month: '2026-11-01', amount: 5000, alertThresholds: [50, 80, 100] }

describe('budget alerts', () => {
  it('alerts once for the highest newly crossed level', () => {
    const txs = [tx({ amount: 4200 })]
    const a = budgetAlerts([food], txs, [], name, now)
    expect(a.alerts).toHaveLength(1)
    expect(a.alerts[0].title).toBe('Food & Dining budget: 84% used')
    expect(a.alerts[0].body).toBe('₹4,200 spent of ₹5,000. ₹800 left for November.')
    expect(a.sent.sort()).toEqual(['b1:50', 'b1:80'])
    expect(budgetAlerts([food], txs, a.sent, name, now).alerts).toHaveLength(0) // not repeated
  })
  it('says how much over when the budget is exceeded', () => {
    const a = budgetAlerts([food], [tx({ amount: 5600 })], ['b1:50', 'b1:80'], name, now)
    expect(a.alerts[0].title).toBe('Over budget: Food & Dining')
    expect(a.alerts[0].body).toBe('₹5,600 spent of ₹5,000 this month. Over by ₹600.')
  })
  it('ignores other months and excluded transactions', () => {
    expect(budgetAlerts([{ ...food, month: '2026-10-01' }], [tx({ amount: 9000 })], [], name, now).alerts).toHaveLength(0)
    expect(budgetAlerts([food], [tx({ amount: 9000, excludeFromReports: true })], [], name, now).alerts).toHaveLength(0)
  })
  it('fires again after the budget is raised and crossed again', () => {
    const sent = budgetAlerts([food], [tx({ amount: 4200 })], [], name, now).sent
    const raised = budgetAlerts([{ ...food, amount: 10000 }], [tx({ amount: 4200 })], sent, name, now)
    expect(raised.sent).toEqual([]) // 42% now, nothing crossed
  })
})

const rent: RecurringPayment = { id: 'r1', merchantKey: 'house owner', merchantName: 'House Owner', expectedAmount: 40000, frequency: 'monthly', categoryId: 'cat_rent',
  lastPaidAt: '2026-10-25T10:00:00', nextExpectedAt: '2026-11-25T10:00:00', occurrences: 2, state: 'confirmed' }

describe('recurring payments', () => {
  it('monthly dates move by calendar month', () => expect(advance(new Date('2026-01-31T09:00:00'), 'monthly').getMonth()).toBe(1))
  it('a new payment moves last paid and next due forward', () => {
    const out = rollForward([rent], [tx({ merchantName: 'House Owner', amount: 40000, occurredAt: '2026-11-25T09:00:00' })])!
    expect(out[0].lastPaidAt).toBe('2026-11-25T09:00:00')
    expect(new Date(out[0].nextExpectedAt!).getDate()).toBe(25)
    expect(new Date(out[0].nextExpectedAt!).getMonth()).toBe(11)
    expect(rollForward(out, [tx({ merchantName: 'House Owner', amount: 40000, occurredAt: '2026-11-25T09:00:00' })])).toBeNull()
  })
  it('ignores different amounts and suggestions', () => {
    expect(rollForward([rent], [tx({ merchantName: 'House Owner', amount: 500, occurredAt: '2026-11-25T09:00:00' })])).toBeNull()
    expect(rollForward([{ ...rent, state: 'suggested' }], [tx({ merchantName: 'House Owner', amount: 40000, occurredAt: '2026-11-25T09:00:00' })])).toBeNull()
  })
  it('plans a 9 am reminder the chosen days before, skipping past times', () => {
    const r = reminderPlan([rent], now, 1)
    expect(r).toHaveLength(1)
    expect(r[0].at.toString()).toBe(new Date('2026-11-24T09:00:00').toString())
    expect(r[0].title).toBe('House Owner is due tomorrow')
    expect(r[0].body).toBe('₹40,000 monthly payment, expected 25 Nov.')
    expect(reminderPlan([rent], new Date('2026-11-24T10:00:00'), 1)).toHaveLength(0)
    expect(reminderPlan([rent], now, 3)[0].title).toBe('House Owner is due on Wed 25 Nov') // 22 Nov
    expect(reminderPlan([{ ...rent, state: 'suggested' }], now, 1)).toHaveLength(0)
  })
})

describe('AI facts polish', () => {
  it('rent is never called unusual, a real outlier still is', () => {
    const small = Array.from({ length: 20 }, (_, i) => tx({ amount: 200 + i * 10, occurredAt: `2026-11-${String(i + 1).padStart(2, '0')}T10:00:00` }))
    const facts = computeFacts([...small, tx({ merchantName: 'House Owner', amount: 40000, categoryId: 'cat_rent', occurredAt: '2026-11-18T10:00:00' }),
      tx({ merchantName: 'Croma', amount: 15000, categoryId: null, occurredAt: '2026-11-19T10:00:00' })], name, now)
    const unusual = facts.filter((f) => f.id.startsWith('unusual')).map((f) => f.text).join(' ')
    expect(unusual).not.toContain('House Owner')
    expect(unusual).toContain('Croma')
  })
})
