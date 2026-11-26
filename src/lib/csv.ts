import type { Category, PaymentSource, Transaction } from './types'

export const COLS = ['date', 'type', 'amount', 'merchant', 'category', 'payment_method', 'payment_source', 'reference', 'description', 'notes', 'scope', 'excluded', 'split_parts'] as const

function esc(v: unknown): string {
  const s = v == null ? '' : String(v)
  // neutralise spreadsheet formula injection
  const safe = /^[=+\-@]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function toCSV(ts: Transaction[], cats: Category[], sources: PaymentSource[]): string {
  return [COLS.join(','), ...txnRows(ts, cats, sources).map((r) => r.map(esc).join(','))].join('\n')
}

/** "Groceries 10000; Household 5000 (note)" for a split transaction, '' otherwise. */
export function splitSummary(t: Transaction, cats: Category[]): string {
  const cn = (id: string | null) => cats.find((c) => c.id === id)?.name ?? 'Uncategorised'
  return t.splits.map((s) => `${cn(s.categoryId)} ${s.amount}${s.note ? ` (${s.note})` : ''}`).join('; ')
}

/** One row per transaction in COLS order. A split transaction has category "Split" and its parts in split_parts. */
export function txnRows(ts: Transaction[], cats: Category[], sources: PaymentSource[]): Array<Array<string | number | boolean | null | undefined>> {
  const cn = (id: string | null) => cats.find((c) => c.id === id)?.name ?? ''
  const sn = (id: string | null) => sources.find((s) => s.id === id)?.displayName ?? ''
  return ts.map((t) => [t.occurredAt, t.type, t.amount, t.merchantName, t.splits.length ? 'Split' : cn(t.categoryId), t.paymentMethod, sn(t.paymentSourceId),
    t.transactionReference, t.description, t.notes, t.scope, t.excludeFromReports, splitSummary(t, cats)])
}

/** RFC-4180-ish parser (quotes, escaped quotes, CRLF) */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let f = ''; let q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { f += '"'; i++ } else if (ch === '"') q = false; else f += ch
    } else if (ch === '"') q = true
    else if (ch === ',') { row.push(f); f = '' }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = '' }
    else f += ch
  }
  if (f || row.length) { row.push(f); rows.push(row) }
  return rows.filter((r) => r.some((c) => c.trim()))
}

export interface ImportRow { occurredAt: string; type: 'debit' | 'credit'; amount: number; merchant: string; category?: string; reference?: string; description?: string; error?: string }

/** Accepts our own export format, or any CSV with date / amount / merchant-ish headers */
export function mapImport(rows: string[][]): ImportRow[] {
  if (rows.length < 2) return []
  const h = rows[0].map((x) => x.trim().toLowerCase())
  const idx = (...names: string[]) => h.findIndex((x) => names.some((n) => x === n || x.includes(n)))
  const iDate = idx('date', 'time'), iAmt = idx('amount', 'debit', 'withdrawal'), iMer = idx('merchant', 'payee', 'description', 'narration', 'name')
  const iType = idx('type', 'dr/cr'), iCat = idx('category'), iRef = idx('reference', 'ref', 'utr'), iDesc = idx('description', 'remarks')
  return rows.slice(1).map((r) => {
    const amount = Number((r[iAmt] ?? '').replace(/[₹,\s]/g, ''))
    const d = parseDate(r[iDate] ?? '')
    const typeRaw = (r[iType] ?? '').toLowerCase()
    const out: ImportRow = {
      occurredAt: d ? d.toISOString() : '', amount: Math.abs(amount), merchant: (r[iMer] ?? '').trim(),
      type: /credit|cr\b/.test(typeRaw) ? 'credit' : 'debit',
      category: iCat >= 0 ? r[iCat]?.trim() : undefined, reference: iRef >= 0 ? r[iRef]?.trim() || undefined : undefined,
      description: iDesc >= 0 && iDesc !== iMer ? r[iDesc]?.trim() : undefined,
    }
    if (!d) out.error = 'Invalid date'
    else if (!(amount > 0 || amount < 0)) out.error = 'Invalid amount'
    else if (!out.merchant) out.error = 'Missing merchant'
    return out
  })
}

function parseDate(s: string): Date | null {
  s = s.trim(); if (!s) return null
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:[ T](\d{1,2}):(\d{2}))?/) // Indian dd/mm/yyyy
  if (dmy) {
    const y = Number(dmy[3].length === 2 ? '20' + dmy[3] : dmy[3])
    const d = new Date(y, Number(dmy[2]) - 1, Number(dmy[1]), Number(dmy[4] ?? 12), Number(dmy[5] ?? 0))
    return isNaN(+d) ? null : d
  }
  const d = new Date(s); return isNaN(+d) ? null : d
}

export function download(filename: string, content: string, mime = 'text/csv') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
