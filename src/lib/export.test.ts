import { describe, expect, it } from 'vitest'
import { parseCSV, toCSV } from './csv'
import type { Category, Transaction } from './types'

const cats = [{ id: 'g', name: 'Groceries' }, { id: 'h', name: 'Household' }, { id: 'f', name: 'Food & Dining' }] as Category[]
const t = (p: Partial<Transaction>): Transaction => ({
  id: 'x', type: 'debit', amount: 100, merchantName: 'Swiggy', occurredAt: '2026-11-10T10:00:00.000Z', paymentMethod: 'upi', paymentSourceId: null,
  categoryId: 'f', subcategoryId: null, origin: 'manual', status: 'confirmed', scope: 'personal', excludeFromReports: false, splits: [],
  dedupeKey: 'k', createdAt: '', updatedAt: '', ...p,
} as Transaction)
const dmart = t({ id: 'd', amount: 15000, merchantName: 'DMart', categoryId: null,
  splits: [{ id: 's1', categoryId: 'g', amount: 10000 }, { id: 's2', categoryId: 'h', amount: 5000, note: 'cleaning' }] })

describe('exports show split parts', () => {
  it('CSV marks the category Split and lists the parts', () => {
    const rows = parseCSV(toCSV([t({}), dmart], cats, []))
    expect(rows).toHaveLength(3)
    const h = rows[0]; const r = rows[2]
    expect(r[h.indexOf('category')]).toBe('Split')
    expect(r[h.indexOf('split_parts')]).toBe('Groceries 10000; Household 5000 (cleaning)')
    expect(rows[1][h.indexOf('split_parts')]).toBe('')
  })
  it('Excel has a sub-row per part', async () => {
    const { buildExcel } = await import('./exportExcel')
    const XLSX = await import('xlsx')
    const wb = XLSX.read(new Uint8Array(await (await buildExcel([dmart], cats, [])).arrayBuffer()), { type: 'array' })
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets.Transactions, { header: 1 })
    expect(aoa.slice(2).map((r) => [r[1], r[2], r[4]])).toEqual([['split part', 10000, 'Groceries'], ['split part', 5000, 'Household']])
  })
})

describe('import reads our own export columns', () => {
  it('parses method, notes, excluded and split parts; rejects parts that do not add up', async () => {
    const { mapImport } = await import('./csv')
    const H = 'date,type,amount,merchant,category,payment_method,payment_source,reference,description,notes,scope,excluded,split_parts'
    const rows = mapImport(parseCSV(`${H}\n2026-11-05T18:30:00+05:30,debit,4250,DMart,,debit_card,,,x,n1,personal,true,Groceries 3400; Other 850 (cleaning)\n2026-11-05T18:30:00+05:30,debit,100,X,,upi,,,,,personal,false,Groceries 30`))
    expect(rows[0]).toMatchObject({ paymentMethod: 'debit_card', notes: 'n1', excluded: true, splits: [{ category: 'Groceries', amount: 3400 }, { category: 'Other', amount: 850, note: 'cleaning' }] })
    expect(rows[0].error).toBeUndefined()
    expect(rows[1].error).toMatch(/add up/)
  })
  it('round-trips a split export', async () => {
    const { mapImport } = await import('./csv')
    const r = mapImport(parseCSV(toCSV([dmart], cats, [])))[0]
    expect(r.error).toBeUndefined(); expect(r.splits?.map((s) => s.amount)).toEqual([10000, 5000])
  })
})
