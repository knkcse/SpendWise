import { useEffect, useRef } from 'react'
import { useStore } from '@/data/store'

/** Pull other devices' changes when the app comes back to the foreground (at most once a minute). */
export function useAutoRefresh() {
  const { refresh, repoKind } = useStore()
  const last = useRef(Date.now())
  useEffect(() => {
    if (repoKind !== 'supabase') return
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || Date.now() - last.current < 60_000) return
      last.current = Date.now(); void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refresh, repoKind])
}
