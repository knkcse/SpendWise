import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export const Card = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) =>
  <div className={cn('rounded-2xl border bg-card text-card-foreground shadow-sm shadow-black/[.03]', className)} {...p} />
export const CardHeader = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) =>
  <div className={cn('flex items-center justify-between gap-2 p-4 pb-2', className)} {...p} />
export const CardTitle = ({ className, ...p }: HTMLAttributes<HTMLHeadingElement>) =>
  <h3 className={cn('text-sm font-semibold', className)} {...p} />
export const CardContent = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) =>
  <div className={cn('p-4 pt-0', className)} {...p} />
