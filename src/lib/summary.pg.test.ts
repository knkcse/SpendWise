// Parity test: the SQL functions and the on-device code must agree on the same data.
// Runs only with PGTEST=1 against the local test database (see docs/ARCHITECTURE.md).
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'child_process'
import { endOfMonth, startOfMonth, subDays, subMonths } from 'date-fns'
import { deviceTimeZone, fromServerOverview, fromServerSummary, localOverview, localSummary } from './summary'
import type { Transaction } from './types'

const run = process.env.PGTEST === '1'
const psql = (sql: string) => execFileSync('psql', ['-h', '/var/tmp', '-p', '5433', '-U', 'postgres', 't2', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' }).trim()

describe.runIf(run)('SQL analytics match the on-device analytics', () => {
  it('agrees on random data with splits, excluded rows, credits and time zones', () => {
    const uid = psql(`insert into auth.users (email) values ('parity-${Date.now()}@test.local') returning id`).split('\n')[0]
    const cats = psql(`select id from categories where user_id is null or user_id = '${uid}' order by name limit 6`).split('\n')
    const srcs = psql(`select id from payment_sources where user_id = '${uid}' order by code limit 3`).split('\n').filter(Boolean)
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)]
    const now = new Date()
    const ts: Transaction[] = []
    const merchants = ['Swiggy', 'swiggy ', 'Zomato', 'DMart', 'Ola', 'Uber', 'Amazon', 'BESCOM']
    for (let i = 0; i < 400; i++) {
      const at = new Date(now.getTime() - Math.floor(rnd() * 420 * 86400000))
      const type = rnd() < 0.1 ? 'credit' : 'debit'
      const amount = Math.round(rnd() * 500000) / 100 + 1
      const split = type === 'debit' && rnd() < 0.1
      const a1 = Math.round(amount * 60) / 100
      ts.push({
        id: crypto.randomUUID(), type, amount, merchantName: pick(merchants), occurredAt: at.toISOString(), paymentMethod: 'upi',
        paymentSourceId: rnd() < 0.3 ? null : pick(srcs), categoryId: split ? null : rnd() < 0.15 ? null : pick(cats), subcategoryId: null,
        origin: 'manual', status: 'confirmed', scope: 'personal', excludeFromReports: rnd() < 0.08, dedupeKey: 'p' + i, createdAt: '', updatedAt: '',
        splits: split ? [{ id: crypto.randomUUID(), categoryId: pick(cats), amount: a1 }, { id: crypto.randomUUID(), categoryId: rnd() < 0.3 ? null : pick(cats), amount: Math.round((amount - a1) * 100) / 100 }] : [],
      } as Transaction)
    }
    const q = (v: string | null) => (v === null ? 'null' : `'${v.replace(/'/g, "''")}'`)
    const rows = ts.map((t) => `(${q(t.id)},${q(uid)},'${t.type}',${t.amount},${q(t.merchantName)},${q(t.occurredAt)},${q(t.paymentSourceId)},${q(t.categoryId)},${t.excludeFromReports},${t.splits.length > 0},${q(t.dedupeKey)})`)
    psql(`insert into transactions (id,user_id,type,amount,merchant_name,occurred_at,payment_source_id,category_id,exclude_from_reports,is_split,dedupe_key) values ${rows.join(',')}`)
    const sp = ts.flatMap((t) => t.splits.map((s) => `(${q(s.id)},${q(uid)},${q(t.id)},${q(s.categoryId)},${s.amount})`))
    if (sp.length) psql(`begin; insert into transaction_splits (id,user_id,transaction_id,category_id,amount) values ${sp.join(',')}; commit;`)
    const tz = deviceTimeZone()
    const as = (sql: string) => JSON.parse(psql(`set test.uid = '${uid}'; ${sql}`).split('\n').pop()!)
    try {
      for (const r of [{ from: startOfMonth(now), to: now }, { from: startOfMonth(subMonths(now, 3)), to: endOfMonth(subMonths(now, 1)) }, { from: subDays(now, 6), to: now }, { from: new Date(2000, 0, 1), to: now }]) {
        const server = fromServerSummary(as(`select analytics_summary('${r.from.toISOString()}', '${r.to.toISOString()}', '${tz}')`))
        const local = localSummary(ts, r)
        expect(server.topMerchants.map((m) => [m.merchant.trim().toLowerCase(), m.total, m.count])).toEqual(local.topMerchants.map((m) => [m.merchant.trim().toLowerCase(), m.total, m.count]))
        const norm = (s: typeof local) => ({ ...s, topMerchants: [], byCategory: [...s.byCategory].sort((a, b) => String(a.categoryId).localeCompare(String(b.categoryId))), bySource: [...s.bySource].sort((a, b) => String(a.sourceId).localeCompare(String(b.sourceId))) })
        expect(norm(server)).toEqual(norm(local))
      }
      for (const ws of [0, 1] as const) {
        const server = fromServerOverview(as(`select analytics_overview('${tz}', ${ws}, 6, '${now.toISOString()}')`))
        expect(server).toEqual(localOverview(ts, now, ws, 6))
      }
      // Another user sees nothing of this data.
      const other = psql(`insert into auth.users (email) values ('other-${Date.now()}@test.local') returning id`).split('\n')[0]
      const o = fromServerSummary(JSON.parse(psql(`set test.uid = '${other}'; select analytics_summary('2000-01-01', now(), '${tz}')`).split('\n').pop()!))
      expect(o.spent).toBe(0); expect(o.count).toBe(0)
      psql(`delete from auth.users where id = '${other}'`)
    } finally {
      psql(`delete from auth.users where id = '${uid}'`)
    }
  })
})
