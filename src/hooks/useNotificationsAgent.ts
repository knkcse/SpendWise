import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { App as CapApp } from '@capacitor/app'
import { useLookups, useStore } from '@/data/store'
import { budgetAlerts, reminderPlan } from '@/lib/alerts'
import {
  getNotifySettings, getSentAlerts, lastRecurringScan, markRecurringScan, notificationsSupported,
  onNotificationTap, setSentAlerts, showBudgetAlerts, syncReminders,
} from '@/lib/notifications'

const SCAN_EVERY = 12 * 3600_000

/**
 * Runs in the background while the app is open:
 * - scans transactions for recurring payments about twice a day,
 * - checks budgets whenever spending changes and shows an alert when one crosses its level,
 * - keeps payment reminders scheduled with Android (they fire even when the app is closed).
 */
export function useNotificationsAgent() {
  const s = useStore()
  const { catName } = useLookups()
  const nav = useNavigate()
  const [tick, setTick] = useState(0) // bumps when the app comes back to the front or settings change
  const active = s.ready && s.profile.onboarded

  useEffect(() => onNotificationTap((route) => nav(route)), [nav])
  useEffect(() => {
    const bump = () => setTick((t) => t + 1)
    window.addEventListener('spendwise:notify', bump)
    const h = notificationsSupported ? CapApp.addListener('appStateChange', (st) => { if (st.isActive) bump() }) : null
    return () => { window.removeEventListener('spendwise:notify', bump); void h?.then((x) => x.remove()) }
  }, [])

  // Recurring scan on a schedule
  useEffect(() => {
    if (!active || !s.transactions.length) return
    if (Date.now() - lastRecurringScan() < SCAN_EVERY) return
    s.refreshRecurring(); markRecurringScan()
  }, [active, tick, s.transactions.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Budget alerts, a moment after spending or budgets change
  useEffect(() => {
    if (!active || !s.prefs.budgetAlerts) return
    const t = setTimeout(() => {
      const { alerts, sent } = budgetAlerts(s.budgets, s.transactions, getSentAlerts(), catName)
      if (!notificationsSupported) return setSentAlerts(sent)
      void showBudgetAlerts(alerts).then((shown) => { if (shown || !alerts.length) setSentAlerts(sent) }).catch(() => {})
    }, 1500)
    return () => clearTimeout(t)
  }, [active, s.budgets, s.transactions, s.prefs.budgetAlerts, tick, catName])

  // Payment reminders
  useEffect(() => {
    if (!active || !notificationsSupported) return
    const cfg = getNotifySettings()
    void syncReminders(cfg.reminders ? reminderPlan(s.recurring, new Date(), cfg.daysBefore) : []).catch(() => {})
  }, [active, s.recurring, tick])
}
