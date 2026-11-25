import { merchantKey } from './utils'

interface DedupeInput {
  type: string; amount: number; merchantName: string; occurredAt: string
  transactionReference?: string; paymentSourceId?: string | null; sourceNotificationId?: string
}

/**
 * Fingerprint used to spot the same payment arriving twice (notification
 * re-posted, SMS + app notification, CSV re-import). Same rule runs in the
 * ingest-android-transaction edge function.
 *  1. UPI / bank reference number when present (strongest signal)
 *  2. otherwise type + amount + merchant + 10-minute time bucket
 */
export function fingerprint(t: DedupeInput): string {
  if (t.transactionReference?.trim()) return `ref:${t.transactionReference.trim().toLowerCase()}`
  const bucket = Math.floor(new Date(t.occurredAt).getTime() / 600_000)
  return `fp:${t.type}:${t.amount.toFixed(2)}:${merchantKey(t.merchantName)}:${bucket}`
}
