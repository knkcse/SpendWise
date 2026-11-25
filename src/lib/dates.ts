import {
  startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, subMonths, subWeeks, format,
} from 'date-fns'

export type RangePreset = 'today' | 'yesterday' | 'week' | 'month' | 'prev_month' | 'custom' | 'all'
export interface DateRange { from: Date; to: Date }

export const PRESET_LABELS: Record<RangePreset, string> = {
  today: 'Today', yesterday: 'Yesterday', week: 'This week', month: 'This month',
  prev_month: 'Previous month', custom: 'Custom', all: 'All time',
}

export function rangeFor(preset: RangePreset, now = new Date(), weekStartsOn: 0 | 1 = 1, custom?: DateRange): DateRange {
  switch (preset) {
    case 'today': return { from: startOfDay(now), to: endOfDay(now) }
    case 'yesterday': { const y = subDays(now, 1); return { from: startOfDay(y), to: endOfDay(y) } }
    case 'week': return { from: startOfWeek(now, { weekStartsOn }), to: endOfWeek(now, { weekStartsOn }) }
    case 'month': return { from: startOfMonth(now), to: endOfMonth(now) }
    case 'prev_month': { const p = subMonths(now, 1); return { from: startOfMonth(p), to: endOfMonth(p) } }
    case 'custom': return custom ?? { from: startOfMonth(now), to: endOfDay(now) }
    case 'all': return { from: new Date(2000, 0, 1), to: endOfDay(now) }
  }
}

export function previousWeek(now = new Date(), weekStartsOn: 0 | 1 = 1): DateRange {
  const p = subWeeks(now, 1)
  return { from: startOfWeek(p, { weekStartsOn }), to: endOfWeek(p, { weekStartsOn }) }
}

export function monthKey(d: Date): string { return format(d, 'yyyy-MM-01') }

/** value for <input type="datetime-local"> */
export function toLocalInput(iso: string): string { return format(new Date(iso), "yyyy-MM-dd'T'HH:mm") }
export function toDateInput(d: Date): string { return format(d, 'yyyy-MM-dd') }
