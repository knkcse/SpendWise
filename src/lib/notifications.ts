// Local notifications on the phone (Phase 6). Nothing here goes through a server:
// alerts are worked out from the data on the phone and shown by Android.
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { BUDGET_BASE, notificationId, REMINDER_BASE, type BudgetAlert, type Reminder } from './alerts'

export const notificationsSupported = Capacitor.isNativePlatform()

// Per-device settings: notifications are shown by this phone, so they're stored on this phone.
export interface NotifySettings { reminders: boolean; daysBefore: 0 | 1 | 3 }
const SETTINGS = 'spendwise.notify', SENT = 'spendwise.budgetAlertsSent', SCAN = 'spendwise.recurringScanAt'
const read = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? { ...d, ...JSON.parse(v) } as T : d } catch { return d } }
const readArr = (k: string): string[] => { try { const v = JSON.parse(localStorage.getItem(k) ?? '[]'); return Array.isArray(v) ? v : [] } catch { return [] } }
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* storage unavailable */ } }

export const getNotifySettings = () => read<NotifySettings>(SETTINGS, { reminders: true, daysBefore: 1 })
export const setNotifySettings = (s: NotifySettings) => { write(SETTINGS, s); window.dispatchEvent(new Event('spendwise:notify')) }
export const getSentAlerts = () => readArr(SENT)
export const setSentAlerts = (v: string[]) => write(SENT, v)
export const lastRecurringScan = () => Number(readArr(SCAN)[0] ?? 0)
export const markRecurringScan = () => write(SCAN, [Date.now()])

export type Permission = 'granted' | 'denied' | 'prompt' | 'unsupported'
export async function permission(ask = false): Promise<Permission> {
  if (!notificationsSupported) return 'unsupported'
  let p = (await LocalNotifications.checkPermissions()).display
  if (ask && p !== 'granted' && p !== 'denied') p = (await LocalNotifications.requestPermissions()).display
  return p === 'granted' ? 'granted' : p === 'denied' ? 'denied' : 'prompt'
}

let channels = false
async function ensureChannels() {
  if (channels || Capacitor.getPlatform() !== 'android') return
  await LocalNotifications.createChannel({ id: 'budget', name: 'Budget alerts', description: 'When a budget reaches its alert level or goes over', importance: 4 })
  await LocalNotifications.createChannel({ id: 'reminders', name: 'Payment reminders', description: 'Before a recurring payment is due', importance: 3 })
  channels = true
}

export async function showBudgetAlerts(alerts: BudgetAlert[]) {
  if (!alerts.length || (await permission(true)) !== 'granted') return false
  await ensureChannels()
  await LocalNotifications.schedule({ notifications: alerts.map((a) => ({
    id: notificationId(`${a.budgetId}:${a.threshold}`, BUDGET_BASE), title: a.title, body: a.body, channelId: 'budget',
    smallIcon: 'ic_stat_spendwise', extra: { route: '/budgets' },
  })) })
  return true
}

/** Replaces every pending payment reminder with the given ones. */
export async function syncReminders(list: Reminder[]) {
  if (!notificationsSupported) return
  const pending = (await LocalNotifications.getPending()).notifications.filter((n) => n.id >= REMINDER_BASE && n.id < REMINDER_BASE + 1_000_000)
  if (pending.length) await LocalNotifications.cancel({ notifications: pending.map((n) => ({ id: n.id })) })
  if (!list.length || (await permission(true)) !== 'granted') return
  await ensureChannels()
  await LocalNotifications.schedule({ notifications: list.map((r) => ({
    id: r.id, title: r.title, body: r.body, channelId: 'reminders', smallIcon: 'ic_stat_spendwise',
    schedule: { at: r.at, allowWhileIdle: true }, extra: { route: '/recurring' },
  })) })
}

export async function sendTest() {
  if ((await permission(true)) !== 'granted') return false
  await ensureChannels()
  await LocalNotifications.schedule({ notifications: [{ id: 999, title: 'SpendWise notifications work', body: 'Budget alerts and payment reminders will look like this.', channelId: 'budget', smallIcon: 'ic_stat_spendwise', extra: { route: '/profile' } }] })
  return true
}

export function onNotificationTap(go: (route: string) => void) {
  if (!notificationsSupported) return () => {}
  const h = LocalNotifications.addListener('localNotificationActionPerformed', (e) => { const r = e.notification.extra?.route; if (typeof r === 'string') go(r) })
  return () => { void h.then((x) => x.remove()) }
}
