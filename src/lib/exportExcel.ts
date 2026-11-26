import type { Category, PaymentSource, Transaction } from './types'
import { COLS, txnRows } from './csv'

/**
 * Excel export: the CSV columns, plus an indented sub-row under each split transaction for every part
 * (type "split part", its amount and category). xlsx is lazy-loaded so it stays out of the main bundle.
 */
export async function buildExcel(ts: Transaction[], cats: Category[], sources: PaymentSource[]): Promise<Blob> {
  const XLSX = await import('xlsx')
  const cn = (id: string | null) => cats.find((c) => c.id === id)?.name ?? 'Uncategorised'
  const main = txnRows(ts, cats, sources)
  const data: unknown[][] = [[...COLS]]
  ts.forEach((t, i) => {
    data.push(main[i].map((v) => v ?? ''))
    for (const s of t.splits) data.push(['', 'split part', s.amount, `    ↳ ${t.merchantName}`, cn(s.categoryId), '', '', '', '', s.note ?? '', '', '', ''])
  })
  const ws = XLSX.utils.aoa_to_sheet(data)
  ws['!cols'] = [{ wch: 22 }, { wch: 10 }, { wch: 10 }, { wch: 28 }, { wch: 20 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 20 }, { wch: 20 }, { wch: 9 }, { wch: 9 }, { wch: 40 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Transactions')
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
