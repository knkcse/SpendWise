// Turns parsed messages into transactions, and keeps a short activity log on this phone.
import { fingerprint } from '../dedupe'
import { formatINR } from '../format'
import type { NewTransaction, PaymentSource, Transaction } from '../types'
import { merchantKey } from '../utils'
import { parseNotification, type Parsed, type RawNotification } from './parse'

export interface LogEntry {
  at: string; kind: 'recorded' | 'duplicate' | 'upcoming' | 'ignored' | 'unknown'
  title: string; detail: string; txnId?: string
  /** Only for messages that couldn't be read: the text with every long number masked, so it can be shared to add support. */
  masked?: string
}

/** Masks account, card, phone and reference numbers (runs of 4+ digits) but keeps amounts. */
export function maskDigits(text: string): string {
  return text.replace(/(rs\.?|inr|₹)?(\s*)(\d[\d,]*(?:\.\d+)?)/gi, (all, cur, sp, num: string) => (cur ? all : num.replace(/,/g, '').replace(/\.\d+$/, '').length >= 4 ? sp + num.replace(/\d/g, 'X') : all))
}

const sourceFor = (sources: PaymentSource[], pkg: string) =>
  sources.find((s) => s.androidPackage === pkg)?.id ?? sources.find((s) => s.code === 'bank')?.id ?? null

/** Same payment already entered by hand: same type and amount, within 36 hours, payee starting with the same word. */
export function enteredByHand(p: Extract<Parsed, { kind: 'payment' }>, existing: Transaction[]): Transaction | undefined {
  const at = Date.parse(p.occurredAt), first = merchantKey(p.merchant).split(' ')[0]
  return existing.find((t) => t.origin !== 'android_notification' && t.type === p.type && Math.abs(t.amount - p.amount) < 0.005
    && Math.abs(Date.parse(t.occurredAt) - at) < 36 * 3600_000 && !!first && merchantKey(t.merchantName).split(' ')[0] === first)
}

export function toTransaction(p: Extract<Parsed, { kind: 'payment' }>, n: RawNotification, sources: PaymentSource[]): NewTransaction {
  const from = [p.bank, p.account && `A/c ${p.account}`].filter(Boolean).join(' · ')
  return {
    type: p.type, amount: p.amount, merchantName: p.merchant, merchantRaw: p.merchant, occurredAt: p.occurredAt,
    paymentMethod: p.method, paymentSourceId: sourceFor(sources, n.pkg), categoryId: null, subcategoryId: null,
    description: `${n.pkg === 'share' ? 'Added from shared SMS' : `Detected from ${n.pkg.includes('messag') || n.pkg.includes('mms') ? 'SMS' : 'notification'}`}${from ? ` · ${from}` : ''}`,
    transactionReference: p.reference, sourceNotificationId: `n:${n.id}`,
    origin: 'android_notification', status: p.exact ? 'confirmed' : 'needs_review', scope: 'personal', excludeFromReports: false, splits: [],
  }
}

/**
 * Parses each message and decides what to do with it. Returns the transactions to add (duplicates
 * by reference number or fingerprint are dropped) and one log line per message.
 */
export function plan(items: RawNotification[], existing: Transaction[], sources: PaymentSource[], now = new Date()) {
  const seen = new Set(existing.map((t) => fingerprint(t)))
  const add: NewTransaction[] = []; const log: LogEntry[] = []
  const at = now.toISOString()
  for (const n of items) {
    const p = parseNotification(n)
    if (p.kind === 'payment') {
      const tx = toTransaction(p, n, sources); const fp = fingerprint(tx)
      const hand = enteredByHand(p, existing)
      const what = `${formatINR(p.amount)} ${p.type === 'debit' ? 'to' : 'from'} ${p.merchant}`
      if (seen.has(fp)) { log.push({ at, kind: 'duplicate', title: what, detail: 'Already recorded' }); continue }
      if (hand) { log.push({ at, kind: 'duplicate', title: what, detail: 'You already added this by hand', txnId: hand.id }); continue }
      seen.add(fp); add.push(tx)
      log.push({ at, kind: 'recorded', title: what, detail: p.exact ? `Recorded from ${p.bank ?? 'bank'} message` : 'Recorded, please check the details' })
    } else if (p.kind === 'upcoming') {
      log.push({ at, kind: 'upcoming', title: `${formatINR(p.amount)} to ${p.merchant}`, detail: `Will be deducted on ${new Date(p.dueAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}. Not recorded until it's paid.` })
    } else if (p.kind === 'ignored') {
      log.push({ at, kind: 'ignored', title: n.title || 'Message', detail: `Skipped: ${p.reason}` })
    } else {
      log.push({ at, kind: 'unknown', title: n.title || 'Message', detail: 'Couldn’t read this message', masked: maskDigits(n.text) })
    }
  }
  return { add, log }
}

// ---------------------------------------------------------------------------
// Activity log (this phone only)
// ---------------------------------------------------------------------------
const LOG = 'spendwise.detectionLog'
export function readLog(): LogEntry[] { try { const v = JSON.parse(localStorage.getItem(LOG) ?? '[]'); return Array.isArray(v) ? v : [] } catch { return [] } }
export function appendLog(entries: LogEntry[]) {
  if (!entries.length) return
  try { localStorage.setItem(LOG, JSON.stringify([...entries.reverse(), ...readLog()].slice(0, 40))) } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event('spendwise:detection'))
}
export function clearLog() { try { localStorage.removeItem(LOG) } catch { /* ignore */ } window.dispatchEvent(new Event('spendwise:detection')) }
