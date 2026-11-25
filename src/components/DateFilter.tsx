import { useState } from 'react'
import { CalendarRange } from 'lucide-react'
import { PRESET_LABELS, rangeFor, toDateInput, type DateRange, type RangePreset } from '@/lib/dates'
import { endOfDay, format, startOfDay } from 'date-fns'
import { Sheet } from './ui/misc'
import { Button } from './ui/button'
import { Input, Label } from './ui/input'
import { cn } from '@/lib/utils'

const PRESETS: RangePreset[] = ['today', 'yesterday', 'week', 'month', 'prev_month', 'custom']

export function useDateFilter(initial: RangePreset = 'month', weekStartsOn: 0 | 1 = 1) {
  const [preset, setPreset] = useState<RangePreset>(initial)
  const [custom, setCustom] = useState<DateRange | undefined>()
  const range = rangeFor(preset, new Date(), weekStartsOn, custom)
  return { preset, setPreset, custom, setCustom, range }
}

export function DateFilter({ f, presets = PRESETS }: { f: ReturnType<typeof useDateFilter>; presets?: RangePreset[] }) {
  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState(toDateInput(f.range.from))
  const [to, setTo] = useState(toDateInput(f.range.to))
  return (
    <>
      <div className="flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {presets.map((p) => (
          <button key={p} onClick={() => (p === 'custom' ? setOpen(true) : f.setPreset(p))}
            className={cn('flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium',
              f.preset === p ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground')}>
            {p === 'custom' && <CalendarRange className="size-3.5" />}
            {p === 'custom' && f.preset === 'custom' ? `${format(f.range.from, 'd MMM')} – ${format(f.range.to, 'd MMM')}` : PRESET_LABELS[p]}
          </button>
        ))}
      </div>
      <Sheet open={open} onOpenChange={setOpen} title="Custom date range">
        <div className="grid grid-cols-2 gap-3">
          <div><Label htmlFor="df-from">From</Label><Input id="df-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label htmlFor="df-to">To</Label><Input id="df-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></div>
        </div>
        <Button className="mt-5 w-full" disabled={!from || !to || from > to} onClick={() => {
          f.setCustom({ from: startOfDay(new Date(from + 'T00:00')), to: endOfDay(new Date(to + 'T00:00')) }); f.setPreset('custom'); setOpen(false)
        }}>Apply</Button>
      </Sheet>
    </>
  )
}
