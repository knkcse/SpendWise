import { describe, expect, it } from 'vitest'
import { parseNotification, type RawNotification } from './parse'
import { SAMPLES } from './fixtures'

const raw = (s: Omit<RawNotification, 'id'>): RawNotification => ({ id: 'x', ...s })
const local = (iso: string) => { const d = new Date(iso); return [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()] }

describe('real bank messages', () => {
  it('HDFC UPI payment', () => {
    const p = parseNotification(raw(SAMPLES.hdfcUpiSports))
    expect(p).toMatchObject({ kind: 'payment', type: 'debit', amount: 2371, merchant: 'Sachdev Sports Jubilee 1', method: 'upi', reference: '300000000001', account: '*1111', bank: 'HDFC Bank', exact: true })
    if (p.kind === 'payment') expect(local(p.occurredAt)).toEqual([2026, 11, 26, 18, 36]) // date from the SMS, time from the notification
  })
  it('HDFC UPI from the other sender keeps mixed-case names', () =>
    expect(parseNotification(raw(SAMPLES.hdfcUpiSwiggy))).toMatchObject({ kind: 'payment', amount: 338, merchant: 'Swiggy Ltd', reference: '700000000002' }))
  it('Canara credit card spend uses the time in the message', () => {
    const p = parseNotification(raw(SAMPLES.canaraCard))
    expect(p).toMatchObject({ kind: 'payment', type: 'debit', amount: 2194, merchant: 'Aptamitra Healthcare P', method: 'credit_card', reference: '600000000003', account: 'XX4444', bank: 'Canara Bank' })
    if (p.kind === 'payment') expect(local(p.occurredAt)).toEqual([2026, 11, 27, 14, 37])
  })
  it('E-mandate notice is upcoming, not a spend', () => {
    const p = parseNotification(raw(SAMPLES.hdfcMandate))
    expect(p).toMatchObject({ kind: 'upcoming', amount: 85, merchant: 'Safe Gold', bank: 'HDFC Bank' })
    if (p.kind === 'upcoming') expect(local(p.dueAt)).toEqual([2026, 11, 28, 0, 0])
  })
  it('a date in the message on another day than the notification falls back to noon', () => {
    const p = parseNotification(raw({ ...SAMPLES.hdfcUpiSwiggy, postedAt: new Date(2026, 10, 28, 1, 0).getTime() }))
    if (p.kind === 'payment') expect(local(p.occurredAt)).toEqual([2026, 11, 27, 12, 0])
  })
})

describe('other messages', () => {
  const t = (text: string, title = 'VK-ICICIB') => parseNotification(raw({ pkg: 'com.google.android.apps.messaging', title, text, postedAt: new Date(2026, 10, 27, 10, 0).getTime() }))
  it('OTPs are never parsed', () => expect(t('123456 is your OTP for txn of Rs 2,000 at Amazon')).toEqual({ kind: 'ignored', reason: 'Contains a one-time code' }))
  it('failed, reminders, refunds and requests are skipped', () => {
    expect(t('Your UPI txn of Rs 500 to abc@ybl has failed')).toMatchObject({ kind: 'ignored' })
    expect(t('Your credit card bill of Rs 12,000 is due on 05-12-26')).toMatchObject({ kind: 'ignored' })
    expect(t('Refund of Rs 299 credited to your a/c XX1111')).toMatchObject({ kind: 'ignored' })
    expect(t('Ravi has requested money Rs 100 on Google Pay')).toMatchObject({ kind: 'ignored' })
    expect(t('Payment of Rs 5,000 received towards your credit card XX4444. Thank you')).toMatchObject({ kind: 'ignored' })
  })
  it('generic debit with payee and reference, marked for review', () =>
    expect(t('Rs 500.00 debited from A/c XX1111 on 27-11-26 to VPA chai.point@okicici. UPI Ref No 432100000001. Never share your OTP/PIN.'))
      .toMatchObject({ kind: 'payment', type: 'debit', amount: 500, merchant: 'chai.point@okicici', method: 'upi', reference: '432100000001', bank: 'ICICI Bank', exact: false }))
  it('generic credit', () =>
    expect(t('Rs.1,250.00 credited to your A/c XX1111 by RAMESH KUMAR on 27-Nov-26. Avl bal Rs 9,000', 'VM-SBIINB'))
      .toMatchObject({ kind: 'payment', type: 'credit', amount: 1250, merchant: 'Ramesh Kumar', bank: 'SBI' }))
  it('chat text with money but no payment word is not understood', () => expect(t('can you send Rs 200 for the cab')).toEqual({ kind: 'unknown' }))
})

describe('turning messages into transactions', async () => {
  const { plan, maskDigits } = await import('./ingest')
  const sources = [{ id: 'src_bank', code: 'bank' as const, displayName: 'Bank apps', androidPackage: null, detectionEnabled: true }]
  const items = Object.values(SAMPLES).map((s, i) => ({ id: String(i), ...s }))
  it('records the three payments, not the mandate notice, and drops repeats', () => {
    const r = plan([...items, { ...items[1], id: 'again' }], [], sources)
    expect(r.add.map((t) => [t.amount, t.merchantName, t.paymentMethod, t.status, t.paymentSourceId])).toEqual([
      [2371, 'Sachdev Sports Jubilee 1', 'upi', 'confirmed', 'src_bank'], [338, 'Swiggy Ltd', 'upi', 'confirmed', 'src_bank'], [2194, 'Aptamitra Healthcare P', 'credit_card', 'confirmed', 'src_bank']])
    expect(r.add[0].description).toBe('Detected from SMS · HDFC Bank · A/c *1111')
    expect(r.log.map((l) => l.kind)).toEqual(['recorded', 'recorded', 'recorded', 'upcoming', 'duplicate'])
  })
  it('skips a payment already entered by hand', () => {
    const hand = { id: 'h', type: 'debit', amount: 338, merchantName: 'Swiggy', occurredAt: new Date(2026, 10, 27, 21, 0).toISOString(), origin: 'manual', transactionReference: undefined } as never
    const r = plan([items[1]], [hand], sources)
    expect(r.add).toHaveLength(0); expect(r.log[0].detail).toBe('You already added this by hand')
  })
  it('masks long numbers but keeps amounts', () =>
    expect(maskDigits('Rs.2371.00 from A/C *2300 Ref 321721590625 call 18002586161')).toBe('Rs.2371.00 from A/C *XXXX Ref XXXXXXXXXXXX call XXXXXXXXXXX'))
})

// Format examples written from banks' publicly known wording (numbers made up), not real messages.
describe('other banks', () => {
  const t = (title: string, text: string) => parseNotification(raw({ pkg: 'com.google.android.apps.messaging', title, text, postedAt: new Date(2026, 10, 27, 15, 0).getTime() }))
  const cases: Array<[string, string, string, Record<string, unknown>]> = [
    ['sbi-upi-debit', 'VM-SBIUPI', 'Dear UPI user A/C X1111 debited by 250.0 on date 27Nov26 trf to SWIGGY Refno 400000000001. If not u? call 1800111109. -SBI', { type: 'debit', amount: 250, merchant: 'Swiggy', reference: '400000000001', method: 'upi' }],
    ['sbi-upi-credit', 'VM-SBIUPI', 'Dear SBI UPI User, ur A/cX1111 credited by Rs500 on 27Nov26 by (Ref no 400000000002)', { type: 'credit', amount: 500, reference: '400000000002' }],
    ['sbi-card', 'VM-SBICRD', 'Rs.1,234.00 spent on your SBI Credit Card ending 4444 at AMAZON on 27/11/26. Trxn. not done by you? Report at https://sbicard.com/Dispute', { amount: 1234, merchant: 'Amazon', method: 'credit_card' }],
    ['icici-upi-debit', 'VM-ICICIT', 'ICICI Bank Acct XX111 debited for Rs 250.00 on 27-Nov-26; SWIGGY credited. UPI:400000000003. Call 18002662 for dispute.', { amount: 250, merchant: 'Swiggy', reference: '400000000003' }],
    ['icici-card', 'VM-ICICIT', 'INR 1,234.00 spent using ICICI Bank Card XX4444 on 27-Nov-26 on AMAZON PAY. Avl Limit: INR 1,00,000.00. If not you, call 1800 2080.', { amount: 1234, merchant: 'Amazon Pay', method: 'credit_card' }],
    ['axis-upi-debit', 'VM-AXISBK', 'INR 250.00 debited\nA/c no. XX1111\n27-11-26, 14:37:47\nUPI/P2M/400000000004/SWIGGY\nNot you? SMS BLOCKUPI Cust ID to 919951860002\nAxis Bank', { amount: 250, merchant: 'Swiggy', reference: '400000000004' }],
    ['axis-card', 'VM-AXISBK', 'Spent\nCard no. XX4444\nINR 1234.00\n27-11-26 14:37:47\nAMAZON\nAvl Lmt INR 99,000.00\nSMS BLOCK 4444 to 919951860002', { amount: 1234, merchant: 'Amazon', method: 'credit_card' }],
    ['kotak-upi-sent', 'VM-KOTAKB', 'Sent Rs.250.00 from Kotak Bank AC X1111 to swiggy@icici on 27-11-26.UPI Ref 400000000005. Not you, https://kotak.com/KBANKT/Fraud', { amount: 250, merchant: 'swiggy@icici', reference: '400000000005' }],
    ['hdfc-card', 'VM-HDFCBK', 'Spent Rs.1234 On HDFC Bank Card 4444 At AMAZON On 2026-11-27:14:37:47 Bal Rs.50000 Not You? Call 18002586161', { amount: 1234, merchant: 'Amazon', method: 'credit_card' }],
  ]
  for (const [format, title, text, want] of cases) it(format, () => expect(t(title, text)).toMatchObject({ kind: 'payment', format, exact: true, ...want }))
  it('an unknown bank still goes through the fallback, marked for review', () =>
    expect(t('VM-FEDBNK', 'Rs 640.00 debited from your A/c XX1111 to MEDPLUS on 27-11-2026. Ref 400000000006')).toMatchObject({ kind: 'payment', amount: 640, merchant: 'Medplus', exact: false, format: 'generic' }))
})
