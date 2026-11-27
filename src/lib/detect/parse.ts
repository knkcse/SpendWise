// Phase 7: turns the text of a bank SMS (or payment app notification) into a payment.
// Runs on the phone. Known bank formats are matched exactly; anything else goes through a
// careful generic reader and is marked for review. Anything that isn't a completed payment
// (OTPs, reminders, e-mandate notices, failed or reversed payments, offers) is not recorded.
import type { PaymentMethod } from '../types'

export interface RawNotification { id: string; pkg: string; title: string; text: string; postedAt: number }

export type Parsed =
  | { kind: 'payment'; type: 'debit' | 'credit'; amount: number; merchant: string; occurredAt: string; method: PaymentMethod
      reference?: string; account?: string; bank?: string; exact: boolean; format: string }
  | { kind: 'upcoming'; amount: number; merchant: string; dueAt: string; bank?: string; format: string }
  | { kind: 'ignored'; reason: string }
  | { kind: 'unknown' }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }
const amountOf = (s: string) => Number(s.replace(/,/g, ''))
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()
const year = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y))

/** "SACHDEV SPORTS JUBILEE 1" -> "Sachdev Sports Jubilee 1". Mixed-case names are kept as they are. */
export function tidyName(s: string): string {
  const t = oneLine(s).replace(/^(vpa|upi)\s+/i, '').replace(/[\s.,:;-]+$/, '')
  if (t !== t.toUpperCase()) return t
  return t.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase())
}

/**
 * Date written in the message, in local time. Without a time of day, the notification's own time is
 * used when it's the same day (bank SMS arrive within seconds), otherwise noon on that day.
 */
function when(d: number, m: number, y: number, postedAt: number, hms?: [number, number, number]): string {
  if (hms) return new Date(y, m, d, ...hms).toISOString()
  const posted = new Date(postedAt)
  if (posted.getFullYear() === y && posted.getMonth() === m && posted.getDate() === d) return posted.toISOString()
  return new Date(y, m, d, 12, 0, 0).toISOString()
}


/** Reads dd/mm/yy, dd-mm-yyyy, dd-MMM-yy, ddMMMyy (SBI) or yyyy-mm-dd. Returns [day, month 0-11, year]. */
export function dateIn(s: string): [number, number, number] | null {
  let m = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  if (m) return [+m[3], +m[2] - 1, +m[1]]
  m = s.match(/\b(\d{1,2})[-/ ]?([A-Za-z]{3})[-/ ]?(\d{2,4})\b/)
  if (m && MONTHS[m[2].toLowerCase()] !== undefined) return [+m[1], MONTHS[m[2].toLowerCase()], year(m[3])]
  m = s.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/)
  if (m && +m[2] >= 1 && +m[2] <= 12) return [+m[1], +m[2] - 1, year(m[3])]
  return null
}
const timeIn = (s: string): [number, number, number] | undefined => { const m = s.match(/\b(\d{2}):(\d{2})(?::(\d{2}))?\b/); return m ? [+m[1], +m[2], +(m[3] ?? 0)] : undefined }
/** Date (and time if written) from the message, else the notification time. */
function dated(s: string, n: RawNotification): string {
  const d = dateIn(s); if (!d) return new Date(n.postedAt).toISOString()
  return when(d[0], d[1], d[2], n.postedAt, timeIn(s))
}
const pay = (type: 'debit' | 'credit', amount: string, merchant: string, occurredAt: string, method: PaymentMethod, bank: string, format: string, account?: string, reference?: string): Parsed =>
  ({ kind: 'payment', type, amount: amountOf(amount), merchant: tidyName(merchant), occurredAt, method, reference, account, bank, exact: true, format })
const AMT = '([\\d,]+(?:\\.\\d{1,2})?)'

const BANKS: Array<[RegExp, string]> = [
  [/HDFC/i, 'HDFC Bank'], [/CANBNK|canara/i, 'Canara Bank'], [/SBI(?!N)|SBIINB|state bank/i, 'SBI'], [/ICICI/i, 'ICICI Bank'],
  [/AXIS/i, 'Axis Bank'], [/KOTAK/i, 'Kotak Bank'], [/IDFC/i, 'IDFC FIRST Bank'], [/YESB|yes bank/i, 'Yes Bank'],
  [/INDUS/i, 'IndusInd Bank'], [/PNB|punjab national/i, 'PNB'], [/BOB|baroda/i, 'Bank of Baroda'], [/UNION/i, 'Union Bank'],
]
export const bankOf = (title: string, text: string) => BANKS.find(([re]) => re.test(title))?.[1] ?? BANKS.find(([re]) => re.test(text))?.[1]

// OTPs etc. are already dropped on the Android side; checked again here.
const SECRET = /\b(otp|one[\s-]?time[\s-]?password|verification code|passcode|password|m?pin|cvv)\b\s*(is|:|for|-)|\b(is|use|enter)\s+(your\s+|the\s+)?(otp|one[\s-]?time[\s-]?password|verification code|passcode|m?pin)\b|\b\d{4,8}\s+is\s+(your|the)\b/i

// ---------------------------------------------------------------------------
// Known formats (from real messages; samples in src/lib/detect/fixtures.ts)
// ---------------------------------------------------------------------------
type Rule = (text: string, n: RawNotification) => Parsed | null

const RULES: Array<[string, Rule]> = [
  // HDFC Bank UPI: "Sent Rs.338.00 From HDFC Bank A/C *1111 To Swiggy Ltd On 27/11/26 Ref 700000000001 Not You? ..."
  ['hdfc-upi-sent', (t, n) => {
    const m = t.match(/Sent Rs\.?\s?([\d,]+(?:\.\d{1,2})?) From (HDFC Bank) A\/C \*?(\d{3,6}) To (.+?) On (\d{2})\/(\d{2})\/(\d{2,4}) Ref:? ?(\w+)/i)
    if (!m) return null
    return { kind: 'payment', type: 'debit', amount: amountOf(m[1]), merchant: tidyName(m[4]), occurredAt: when(+m[5], +m[6] - 1, year(m[7]), n.postedAt),
      method: 'upi', reference: m[8], account: `*${m[3]}`, bank: m[2], exact: true, format: 'hdfc-upi-sent' }
  }],
  // HDFC Bank UPI received: "Received Rs.500.00 in your HDFC Bank A/C *1111 From abc@okaxis On 27/11/26 Ref 1234"
  ['hdfc-upi-received', (t, n) => {
    const m = t.match(/Received Rs\.?\s?([\d,]+(?:\.\d{1,2})?) in your (HDFC Bank) A\/C \*?(\d{3,6}) From (.+?) On (\d{2})\/(\d{2})\/(\d{2,4}) Ref:? ?(\w+)/i)
    if (!m) return null
    return { kind: 'payment', type: 'credit', amount: amountOf(m[1]), merchant: tidyName(m[4]), occurredAt: when(+m[5], +m[6] - 1, year(m[7]), n.postedAt),
      method: 'upi', reference: m[8], account: `*${m[3]}`, bank: m[2], exact: true, format: 'hdfc-upi-received' }
  }],
  // Canara Bank credit card: "INR 2,194.00 spent on CanaraBank CreditCard XX4444: APTAMITRA HEALTHCARE P on 27-NOV-26 14:37:47.Ref.600000000001. Avl limit ..."
  ['canara-cc-spent', (t) => {
    const m = t.match(/INR ([\d,]+(?:\.\d{1,2})?) spent on CanaraBank Credit ?Card XX(\d{3,6}): (.+?) on (\d{2})-([A-Z]{3})-(\d{2,4}) (\d{2}):(\d{2}):(\d{2})\.? ?Ref\.? ?(\w+)/i)
    if (!m || MONTHS[m[5].toLowerCase()] === undefined) return null
    return { kind: 'payment', type: 'debit', amount: amountOf(m[1]), merchant: tidyName(m[3]),
      occurredAt: when(+m[4], MONTHS[m[5].toLowerCase()], year(m[6]), 0, [+m[7], +m[8], +m[9]]),
      method: 'credit_card', reference: m[10], account: `XX${m[2]}`, bank: 'Canara Bank', exact: true, format: 'canara-cc-spent' }
  }],

  // ---- Common formats of other banks, written from their publicly known SMS wording.
  // ---- Not yet seen on this user's phone: if a message isn't read, the log keeps a masked copy to fix it.
  // SBI UPI: "Dear UPI user A/C X1111 debited by 250.0 on date 27Nov26 trf to SWIGGY Refno 400000000001. If not u? call ... -SBI"
  ['sbi-upi-debit', (t, n) => {
    const m = t.match(new RegExp(`A/C ?X?(\\d{3,6}) debited by (?:Rs\\.? ?)?${AMT} on date (\\S+) trf to (.+?) Ref ?no:? ?(\\w+)`, 'i'))
    return m ? pay('debit', m[2], m[4], dated(m[3], n), 'upi', 'SBI', 'sbi-upi-debit', `X${m[1]}`, m[5]) : null
  }],
  // SBI UPI credit: "Dear SBI UPI User, ur A/cX1111 credited by Rs500 on 27Nov26 by (Ref no 400000000002)"
  ['sbi-upi-credit', (t, n) => {
    const m = t.match(new RegExp(`A/c ?X?(\\d{3,6}) credited by (?:Rs\\.? ?)?${AMT} on (\\S+) by (.*?)\\(?Ref ?no:? ?(\\w+)`, 'i'))
    return m ? pay('credit', m[2], m[4].trim() || 'UPI transfer', dated(m[3], n), 'upi', 'SBI', 'sbi-upi-credit', `X${m[1]}`, m[5]) : null
  }],
  // SBI card: "Rs.1,234.00 spent on your SBI Credit Card ending 4444 at AMAZON on 27/11/26."
  ['sbi-card', (t, n) => {
    const m = t.match(new RegExp(`Rs\\.? ?${AMT} spent on your SBI Credit Card ending (?:with )?(\\d{3,6}) at (.+?) on (\\S+?)\\.?(?:\\s|$)`, 'i'))
    return m ? pay('debit', m[1], m[3], dated(m[4], n), 'credit_card', 'SBI Card', 'sbi-card', `XX${m[2]}`) : null
  }],
  // ICICI UPI: "ICICI Bank Acct XX111 debited for Rs 250.00 on 27-Nov-26; SWIGGY credited. UPI:400000000003. Call ..."
  ['icici-upi-debit', (t, n) => {
    const m = t.match(new RegExp(`ICICI Bank Acc(?:oun)?t XX(\\d{3,6}) debited (?:for|with) (?:Rs\\.?|INR) ?${AMT} on (\\S+?);? (.+?) credited\\.? (?:UPI|IMPS|RRN|Ref)[: ]*(\\w+)`, 'i'))
    return m ? pay('debit', m[2], m[4], dated(m[3], n), /UPI/i.test(t) ? 'upi' : 'net_banking', 'ICICI Bank', 'icici-upi-debit', `XX${m[1]}`, m[5]) : null
  }],
  // ICICI card: "INR 1,234.00 spent using ICICI Bank Card XX4444 on 27-Nov-26 on AMAZON. Avl Limit: INR ..."
  ['icici-card', (t, n) => {
    const m = t.match(new RegExp(`(?:INR|Rs\\.?) ?${AMT} spent (?:using|on) ICICI Bank (?:Credit )?Card XX(\\d{3,6}) on (\\S+?) (?:on|at) (.+?)\\. ?(?:Avl|Avbl|Available)`, 'i'))
    return m ? pay('debit', m[1], m[4], dated(m[3], n), 'credit_card', 'ICICI Bank', 'icici-card', `XX${m[2]}`) : null
  }],
  // Axis UPI: "INR 250.00 debited A/c no. XX1111 27-11-26, 14:37:47 UPI/P2M/400000000004/SWIGGY Not you? ..."
  ['axis-upi-debit', (t, n) => {
    const m = t.match(new RegExp(`INR ${AMT} debited A/c no\\.? XX(\\d{3,6}) (\\S+?,? \\d{2}:\\d{2}(?::\\d{2})?) UPI/P2[AM]/(\\w+)/(.+?)(?: Not you| Avl| -Axis|$)`, 'i'))
    return m ? pay('debit', m[1], m[5], dated(m[3], n), 'upi', 'Axis Bank', 'axis-upi-debit', `XX${m[2]}`, m[4]) : null
  }],
  // Axis card: "Spent Card no. XX4444 INR 1234.00 27-11-26 14:37:47 AMAZON Avl Lmt INR ..."
  ['axis-card', (t, n) => {
    const m = t.match(new RegExp(`Spent Card no\\.? XX(\\d{3,6}) INR ${AMT} (\\S+ \\d{2}:\\d{2}(?::\\d{2})?) (.+?) Avl`, 'i'))
    return m ? pay('debit', m[2], m[4], dated(m[3], n), 'credit_card', 'Axis Bank', 'axis-card', `XX${m[1]}`) : null
  }],
  // Kotak UPI: "Sent Rs.250.00 from Kotak Bank AC X1111 to swiggy@icici on 27-11-26.UPI Ref 400000000005. Not you, ..."
  ['kotak-upi-sent', (t, n) => {
    const m = t.match(new RegExp(`Sent Rs\\.? ?${AMT} from Kotak Bank AC X?(\\d{3,6}) to (.+?) on (\\S+?)\\.? ?UPI Ref:? ?(\\w+)`, 'i'))
    return m ? pay('debit', m[1], m[3], dated(m[4], n), 'upi', 'Kotak Bank', 'kotak-upi-sent', `X${m[2]}`, m[5]) : null
  }],
  // HDFC card: "Spent Rs.1234 On HDFC Bank Card 4444 At AMAZON On 2026-11-27:14:37:47 Bal Rs..."
  ['hdfc-card', (t, n) => {
    const m = t.match(new RegExp(`Spent (?:Rs\\.?|INR) ?${AMT} On HDFC Bank (?:Credit |Debit )?Card x?(\\d{3,6}) At (.+?) On (\\d{4}-\\d{2}-\\d{2}):?(\\d{2}:\\d{2}:\\d{2})?`, 'i'))
    return m ? pay('debit', m[1], m[3], dated(`${m[4]} ${m[5] ?? ''}`, n), /debit card/i.test(t) ? 'debit_card' : 'credit_card', 'HDFC Bank', 'hdfc-card', `XX${m[2]}`) : null
  }],
  // E-mandate pre-debit notice: "E-Mandate! Rs.85.00 will be deducted on 28/11/26, 00:00:00 For SAFE GOLD mandate UMN ..."
  // Money hasn't moved yet, so this is shown as upcoming and never recorded as a spend.
  ['emandate-notice', (t, n) => {
    const m = t.match(/Rs\.?\s?([\d,]+(?:\.\d{1,2})?) will be (?:deducted|debited) on (\d{2})\/(\d{2})\/(\d{2,4})(?:,? (\d{2}):(\d{2}):(\d{2}))?.*?For (.+?) mandate/i)
    if (!m) return null
    const hms: [number, number, number] | undefined = m[5] ? [+m[5], +m[6], +m[7]] : undefined
    return { kind: 'upcoming', amount: amountOf(m[1]), merchant: tidyName(m[8]), dueAt: when(+m[2], +m[3] - 1, year(m[4]), n.postedAt, hms),
      bank: bankOf(n.title, t), format: 'emandate-notice' }
  }],
]

// ---------------------------------------------------------------------------
// Not payments
// ---------------------------------------------------------------------------
const SKIP: Array<[RegExp, string]> = [
  [/will be (deducted|debited|charged)|scheduled (for|on)|upcoming (debit|payment)|pre-?debit/i, 'Upcoming debit, not paid yet'],
  [/\b(failed|declined|unsuccessful|could not be processed|was not successful)\b/i, 'Failed payment'],
  [/\b(reversed|reversal|refund(ed)?)\b/i, 'Refund or reversal'],
  [/\b(is due|due date|due on|min(imum)? (amount )?due|total (amount )?due|statement)\b/i, 'Bill or statement reminder'],
  [/(requested|request(ing)?) (money|payment)|collect request/i, 'Payment request, not a payment'],
  [/(payment|amount) (of .{1,25} )?(has been )?received (towards|on|for) your (credit )?card|credited to your (credit )?card/i, 'Card bill payment'],
  [/\b(offer|cashback upto|win |voucher|coupon|pre-?approved|loan of)\b/i, 'Offer or advert'],
]

// ---------------------------------------------------------------------------
// Generic reader for other banks and apps: needs an amount and a clear money-moved word.
// ---------------------------------------------------------------------------
function generic(t: string, n: RawNotification): Parsed {
  const amt = t.match(/(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/i)
  if (!amt) return { kind: 'unknown' }
  const debit = t.search(/\b(debited|spent|sent|paid|withdrawn|purchase|transferred)\b/i)
  const credit = t.search(/\b(credited|received|deposited)\b/i)
  if (debit < 0 && credit < 0) return { kind: 'unknown' }
  const type = debit >= 0 && (credit < 0 || debit < credit) ? 'debit' : 'credit'
  const who = type === 'debit'
    ? t.match(/\b(?:to|at|towards|paid to)\s+(?:vpa\s+)?([A-Za-z0-9][A-Za-z0-9 &.'@_*-]{1,40}?)(?=\s+(?:on|ref|via|using|from|upi|avl|avbl|txn|\(|\.\s)|[.,;](?=\s|$)|$)/i)
    : t.match(/\b(?:from|by)\s+(?:vpa\s+)?([A-Za-z0-9][A-Za-z0-9 &.'@_*-]{1,40}?)(?=\s+(?:on|ref|via|using|to|upi|avl|avbl|txn|\(|\.\s)|[.,;](?=\s|$)|$)/i)
  const ref = t.match(/\b(?:ref(?:erence)?|utr|txn id|rrn)\.?\s*(?:no\.?|number)?\s*[:.-]?\s*([A-Za-z0-9]{6,})/i)
  const acct = t.match(/\b(?:a\/c|acct|account|card)\s*(?:no\.?)?\s*(?:ending\s*)?([x*]+\d{3,6}|\d{4})\b/i)
  const occurredAt = dated(t, n)
  const method: PaymentMethod = /\bupi\b|vpa|@[a-z]{2,}/i.test(t) ? 'upi' : /credit ?card/i.test(t) ? 'credit_card' : /debit ?card/i.test(t) ? 'debit_card'
    : /\b(neft|imps|rtgs|net ?banking)\b/i.test(t) ? 'net_banking' : /wallet/i.test(t) ? 'wallet' : 'other'
  return { kind: 'payment', type, amount: amountOf(amt[1]), merchant: who ? tidyName(who[1]) : (bankOf(n.title, t) ?? 'Unknown payee'), occurredAt, method,
    reference: ref?.[1], account: acct?.[1], bank: bankOf(n.title, t), exact: false, format: 'generic' }
}

export function parseNotification(n: RawNotification): Parsed {
  const t = oneLine(n.text)
  if (SECRET.test(t)) return { kind: 'ignored', reason: 'Contains a one-time code' }
  for (const [, rule] of RULES) { const r = rule(t, n); if (r) return r }
  for (const [re, reason] of SKIP) if (re.test(t)) return { kind: 'ignored', reason }
  const g = generic(t, n)
  if (g.kind === 'payment' && !(g.amount > 0)) return { kind: 'unknown' }
  return g
}
