import * as SwitchPrimitive from '@radix-ui/react-switch'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Switch({ className, ...p }: SwitchPrimitive.SwitchProps) {
  return (
    <SwitchPrimitive.Root className={cn('peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors data-[state=checked]:bg-primary data-[state=unchecked]:bg-input disabled:cursor-not-allowed disabled:opacity-50', className)} {...p}>
      <SwitchPrimitive.Thumb className="pointer-events-none block h-5 w-5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0" />
    </SwitchPrimitive.Root>
  )
}

const badgeTone = {
  default: 'bg-secondary text-secondary-foreground', primary: 'bg-accent text-accent-foreground',
  warning: 'bg-warning/15 text-warning', danger: 'bg-destructive/15 text-destructive', success: 'bg-success/15 text-success',
}
export const Badge = ({ className, tone = 'default', ...p }: HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof badgeTone }) =>
  <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', badgeTone[tone], className)} {...p} />

export function Progress({ value, className, tone }: { value: number; className?: string; tone?: 'ok' | 'warn' | 'over' }) {
  const color = tone === 'over' ? 'bg-destructive' : tone === 'warn' ? 'bg-warning' : 'bg-primary'
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)} role="progressbar" aria-valuenow={Math.round(value)}>
      <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  )
}

/** Bottom sheet built on Radix Dialog */
export function Sheet({ open, onOpenChange, title, children }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; children: ReactNode }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content aria-describedby={undefined} className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[90vh] max-w-lg overflow-y-auto rounded-t-3xl border bg-card p-5 safe-bottom data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom">
          <div className="mb-4 flex items-center justify-between">
            <DialogPrimitive.Title className="text-base font-semibold">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close className="rounded-full p-1.5 hover:bg-muted" aria-label="Close"><X className="size-4" /></DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/** Confirmation dialog (in-app, never window.confirm) */
export function Confirm({ open, onOpenChange, title, body, confirmLabel = 'Delete', onConfirm, destructive = true }:
  { open: boolean; onOpenChange: (o: boolean) => void; title: string; body: ReactNode; confirmLabel?: string; onConfirm: () => void; destructive?: boolean }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <DialogPrimitive.Content aria-describedby={undefined} className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-card p-5">
          <DialogPrimitive.Title className="text-base font-semibold">{title}</DialogPrimitive.Title>
          <div className="mt-2 text-sm text-muted-foreground">{body}</div>
          <div className="mt-5 flex justify-end gap-2">
            <DialogPrimitive.Close className="h-10 rounded-xl px-4 text-sm font-medium hover:bg-muted">Cancel</DialogPrimitive.Close>
            <button className={cn('h-10 rounded-xl px-4 text-sm font-medium', destructive ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground')}
              onClick={() => { onConfirm(); onOpenChange(false) }}>{confirmLabel}</button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string }>; className?: string }) {
  return (
    <div className={cn('flex gap-1 overflow-x-auto rounded-xl bg-muted p-1 [scrollbar-width:none]', className)}>
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={cn('h-8 shrink-0 flex-1 whitespace-nowrap rounded-lg px-3 text-xs font-medium transition-colors', value === o.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Empty({ icon, title, body, action }: { icon: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-accent text-accent-foreground [&_svg]:size-6">{icon}</div>
      <p className="font-medium">{title}</p>
      {body && <p className="mt-1 max-w-xs text-sm text-muted-foreground">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
