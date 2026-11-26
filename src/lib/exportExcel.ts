import type { Category, PaymentSource, Transaction } from './types'
import { parseCSV, toCSV } from './csv'

/** Excel export reuses the CSV columns; xlsx is lazy-loaded so it stays out of the main bundle. */
export async function buildExcel(ts: Transaction[], cats: Category[], sources: PaymentSource[]): Promise<Blob> {
  const XLSX = await import('xlsx')
  const rows = parseCSV(toCSV(ts, cats, sources))
  const data = rows.map((r, i) => (i === 0 ? r : r.map((v, j) => (j === 2 ? Number(v) : v))))
  const ws = XLSX.utils.aoa_to_sheet(data)
  ws['!cols'] = [{ wch: 22 }, { wch: 7 }, { wch: 10 }, { wch: 28 }, { wch: 20 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Transactions')
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
