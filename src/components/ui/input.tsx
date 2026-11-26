import { forwardRef, type InputHTMLAttributes, type LabelHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const field = 'flex w-full rounded-xl border border-input bg-card px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) =>
  <input ref={ref} className={cn(field, 'h-11', className)} {...p} />)
Input.displayName = 'Input'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) =>
  <textarea ref={ref} className={cn(field, 'min-h-[80px] py-2', className)} {...p} />)
Textarea.displayName = 'Textarea'

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...p }, ref) =>
  <select ref={ref} className={cn(field, 'h-11 appearance-none bg-[length:16px] bg-[position:right_12px_center] bg-no-repeat pr-9', className)}
    style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...p} />)
Select.displayName = 'Select'

export const Label = ({ className, ...p }: LabelHTMLAttributes<HTMLLabelElement>) =>
  <label className={cn('mb-1.5 block text-xs font-medium text-muted-foreground', className)} {...p} />
