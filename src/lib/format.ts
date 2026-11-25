const inr0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const inr2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const inrCompact = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1 })

/** ₹1,23,456 or ₹1,23,456.50 (Indian lakh grouping; paise shown only when present) */
export function formatINR(n: number): string {
  return Number.isInteger(Math.round(n * 100) / 100) ? inr0.format(n) : inr2.format(n)
}

/** ₹1.2L / ₹12K for chart axes */
export function formatINRCompact(n: number): string {
  if (Math.abs(n) < 1000) return inr0.format(Math.round(n))
  return inrCompact.format(n)
}

export function formatPct(n: number): string {
  return `${n > 0 ? '+' : ''}${n.toFixed(0)}%`
}
