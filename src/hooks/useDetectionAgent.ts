import { useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { App as CapApp } from '@capacitor/app'
import { useStore } from '@/data/store'
import { useToast } from '@/components/toast'
import { appendLog, plan } from '@/lib/detect/ingest'
import { detectionAvailable, PaymentDetection } from '@/lib/detect/plugin'

/**
 * Connects the Android listener to the app: passes on the user's switches, and reads waiting
 * messages when the app opens, comes to the front, or a new one arrives while it's open.
 */
export function useDetectionAgent() {
  const s = useStore(); const toast = useToast(); const nav = useNavigate()
  const ref = useRef(s); ref.current = s
  const active = s.ready && s.profile.onboarded && detectionAvailable()
  const bank = s.sources.find((x) => x.code === 'bank')

  useEffect(() => {
    if (!active) return
    const packages = s.sources.filter((x) => x.detectionEnabled && x.androidPackage).map((x) => x.androidPackage!)
    void PaymentDetection.configure({ enabled: s.prefs.detectionEnabled, sms: bank?.detectionEnabled ?? true, packages }).catch(() => {})
  }, [active, s.prefs.detectionEnabled, s.sources, bank?.detectionEnabled])

  const busy = useRef(false)
  const drain = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    try {
      const { items } = await PaymentDetection.drain()
      if (!items?.length) return
      const st = ref.current
      const { add, log } = plan(items, st.transactions, st.sources)
      const r = add.length ? st.importTransactions(add) : { added: 0 }
      appendLog(log)
      if (r.added) toast(`${r.added} payment${r.added === 1 ? '' : 's'} detected and added`)
    } catch { /* plugin unavailable */ } finally { busy.current = false }
  }, [toast])

  // A bank SMS shared to SpendWise ("Share" › SpendWise in the Messages app)
  const takeShared = useCallback(async () => {
    try {
      const { text } = await PaymentDetection.takeShared()
      if (!text?.trim()) return
      const st = ref.current
      const { add, log } = plan([{ id: `share-${Date.now()}`, pkg: 'share', title: 'Shared message', text, postedAt: Date.now() }], st.transactions, st.sources)
      if (add.length) st.importTransactions(add)
      appendLog(log)
      const l = log[0]
      toast(l.kind === 'recorded' ? `Added ${l.title}` : l.kind === 'duplicate' ? `${l.title}: ${l.detail.toLowerCase()}` : l.kind === 'upcoming' ? `Upcoming ${l.title}, not added until it's paid` : l.kind === 'ignored' ? l.detail : 'Couldn’t read this message')
      nav(add.length ? '/transactions' : '/settings/detection')
    } catch { /* plugin unavailable */ }
  }, [toast, nav])

  useEffect(() => {
    if (!active) return
    void takeShared()
    const c = PaymentDetection.addListener('shared', () => { void takeShared() })
    return () => { void c.then((h) => h.remove()) }
  }, [active, takeShared])

  useEffect(() => {
    if (!active) return
    void drain()
    const a = PaymentDetection.addListener('detected', () => { void drain() })
    const b = CapApp.addListener('appStateChange', (st) => { if (st.isActive) void drain() })
    return () => { void a.then((h) => h.remove()); void b.then((h) => h.remove()) }
  }, [active, drain])
}
