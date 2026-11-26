import { Area, AreaChart, Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts'
import { useState } from 'react'
import { formatINR, formatINRCompact } from '@/lib/format'
import { cn } from '@/lib/utils'

const axis = { fontSize: 11, fill: 'hsl(var(--muted-foreground))' }
const tip = {
  contentStyle: { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 10, fontSize: 12, color: 'hsl(var(--foreground))', padding: '6px 10px', boxShadow: '0 4px 14px rgb(0 0 0 / 0.12)' },
  allowEscapeViewBox: { x: false, y: false },
  // Explicit colours: bars coloured per cell have no series colour, so recharts fell back to black text.
  labelStyle: { color: 'hsl(var(--foreground))', fontWeight: 600 },
  itemStyle: { color: 'hsl(var(--foreground))' },
  formatter: (v: number) => formatINR(v),
  cursor: { fill: 'hsl(var(--muted-foreground) / 0.08)' },
}

export function BarSeries({ data, x, y, height = 180, highlightMax }: { data: object[]; x: string; y: string; height?: number; highlightMax?: boolean }) {
  const max = Math.max(...data.map((d) => Number((d as Record<string, unknown>)[y]) || 0))
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
        <XAxis dataKey={x} tick={axis} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={formatINRCompact} width={52} />
        <Tooltip {...tip} />
        <Bar animationDuration={500} dataKey={y} name="Spent" radius={[6, 6, 0, 0]} maxBarSize={28}>
          {data.map((d, i) => (
            <Cell key={i} fill={highlightMax && max > 0 && Number((d as Record<string, unknown>)[y]) === max ? 'hsl(var(--warning))' : 'hsl(var(--primary))'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function TrendArea({ data, height = 180 }: { data: Array<{ month: string; expenses: number; income: number }>; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} /><stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} /></linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
        <XAxis dataKey="month" tick={axis} tickLine={false} axisLine={false} />
        <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={formatINRCompact} width={52} />
        <Tooltip {...tip} cursor={{ stroke: 'hsl(var(--border))' }} />
        <Area animationDuration={500} type="monotone" dataKey="expenses" name="Expenses" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#gExp)" />
        <Area animationDuration={500} type="monotone" dataKey="income" name="Income" stroke="hsl(var(--success))" strokeWidth={2} fill="none" strokeDasharray="4 3" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export interface Slice { name: string; value: number; color: string }

/** Tap a slice (or a legend row) to show its amount in the centre; tap again to go back to the total. */
export function Donut({ data, total }: { data: Slice[]; total: number }) {
  const [active, setActive] = useState<number | null>(null)
  const sel = active !== null ? data[active] : undefined
  const toggle = (i: number) => setActive((a) => (a === i ? null : i))
  return (
    <div className="flex items-center gap-4">
      <div className="relative size-36 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie animationDuration={500} data={data} dataKey="value" nameKey="name" innerRadius="68%" outerRadius="100%" paddingAngle={data.length > 1 ? 2 : 0} stroke="none"
              className="cursor-pointer">
              {data.map((d, i) => <Cell key={d.name} fill={d.color} opacity={sel && active !== i ? 0.35 : 1} onClick={() => toggle(i)} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center px-6 text-center">
          {sel ? (
            <div className="min-w-0"><p className="truncate text-[10px] text-muted-foreground">{sel.name}</p><p className="text-sm font-semibold">{formatINRCompact(sel.value)}</p>
              <p className="text-[10px] text-muted-foreground">{total ? Math.round((sel.value / total) * 100) : 0}%</p></div>
          ) : (
            <div><p className="text-[10px] text-muted-foreground">Total</p><p className="text-sm font-semibold">{formatINRCompact(total)}</p></div>
          )}
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-0.5">
        {data.slice(0, 6).map((d, i) => (
          <li key={d.name}>
            <button type="button" onClick={() => toggle(i)} aria-pressed={active === i}
              className={cn('flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-xs', active === i && 'bg-muted', sel && active !== i && 'opacity-60')}>
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
              <span className="min-w-0 flex-1 truncate">{d.name}</span>
              <span className="font-medium">{active === i ? formatINR(d.value) : `${total ? Math.round((d.value / total) * 100) : 0}%`}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Horizontal ranked bars, used for merchant / payment-app breakdowns */
export function RankBars({ rows }: { rows: Array<{ label: string; value: number; sub?: string }> }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-1 flex justify-between gap-2 text-xs"><span className="truncate font-medium">{r.label}{r.sub && <span className="ml-1 font-normal text-muted-foreground">{r.sub}</span>}</span><span className="shrink-0">{formatINR(r.value)}</span></div>
          <div className="h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  )
}
