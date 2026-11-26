import { useState } from 'react'
import { cn } from '@/lib/utils'

export function Avatar({ url, name, className }: { url?: string | null; name: string; className?: string }) {
  const [broken, setBroken] = useState(false)
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || 'S'
  return url && !broken
    ? <img src={url} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} className={cn('size-12 shrink-0 rounded-full object-cover', className)} />
    : <span className={cn('grid size-12 shrink-0 place-items-center rounded-full bg-primary text-lg font-semibold text-primary-foreground', className)}>{initials}</span>
}
