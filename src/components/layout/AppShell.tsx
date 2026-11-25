import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { ArrowLeft, Home, ListOrdered, PieChart, Sparkles, User } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

const TABS = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/transactions', label: 'Transactions', icon: ListOrdered },
  { to: '/insights', label: 'Insights', icon: Sparkles },
  { to: '/budgets', label: 'Budgets', icon: PieChart },
  { to: '/profile', label: 'Profile', icon: User },
]

export function AppShell() {
  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col">
      <main className="flex-1 pb-24"><Outlet /></main>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur safe-bottom">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {TABS.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => cn('flex flex-col items-center gap-1 pb-1 pt-2.5 text-[10.5px] font-medium', isActive ? 'text-primary' : 'text-muted-foreground')}>
              {({ isActive }) => (<>
                <span className={cn('grid h-7 w-12 place-items-center rounded-full transition-colors', isActive && 'bg-accent')}><Icon className="size-[18px]" /></span>
                {label}
              </>)}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

/** Header for every screen. `back` shows a back arrow (pushes history -1). */
export function PageHeader({ title, subtitle, back, right }: { title: string; subtitle?: string; back?: boolean; right?: ReactNode }) {
  const nav = useNavigate()
  return (
    <header className="sticky top-0 z-30 bg-background/90 px-4 pb-3 pt-4 backdrop-blur safe-top">
      <div className="flex items-center gap-2">
        {back && (
          <button onClick={() => (history.length > 1 ? nav(-1) : nav('/'))} className="-ml-2 grid size-10 place-items-center rounded-full hover:bg-muted" aria-label="Back">
            <ArrowLeft className="size-5" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {right}
      </div>
    </header>
  )
}

/** Full-screen page outside the tab bar (forms, details) */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto min-h-full max-w-lg pb-10', className)}>{children}</div>
}
