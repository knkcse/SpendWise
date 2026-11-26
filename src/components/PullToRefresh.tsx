import { useRef, useState, type ReactNode } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { useStore } from '@/data/store'
import { useToast } from './toast'

const THRESHOLD = 70

/** Drag down from the top of the page to fetch the latest data (signed-in only). */
export function PullToRefresh({ children }: { children: ReactNode }) {
  const { refresh, repoKind } = useStore()
  const toast = useToast()
  const start = useRef<number | null>(null)
  const [pull, setPull] = useState(0)
  const [busy, setBusy] = useState(false)
  if (repoKind !== 'supabase') return <>{children}</>

  return (
    <div
      onTouchStart={(e) => { start.current = window.scrollY <= 0 && !busy ? e.touches[0].clientY : null }}
      onTouchMove={(e) => { if (start.current !== null) setPull(Math.max(0, Math.min(110, (e.touches[0].clientY - start.current) * 0.5))) }}
      onTouchEnd={async () => {
        const go = pull >= THRESHOLD; start.current = null; setPull(0)
        if (!go) return
        setBusy(true)
        const ok = await refresh()
        setBusy(false)
        toast(ok ? 'Up to date' : 'Couldn’t refresh. Your changes are saved and will sync when you’re online.')
      }}>
      <div className="flex items-center justify-center overflow-hidden text-muted-foreground transition-[height]" style={{ height: busy ? 40 : pull }}>
        {busy ? <Loader2 className="size-5 animate-spin" /> : <RefreshCw className="size-5" style={{ transform: `rotate(${pull * 3}deg)`, opacity: pull / THRESHOLD }} />}
      </div>
      {children}
    </div>
  )
}
