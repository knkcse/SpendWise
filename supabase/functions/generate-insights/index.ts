// SpendWise: generate-insights (Supabase Edge Function, Deno).
//
// 1. Works out who is calling from their Supabase JWT (never from the request body).
// 2. Computes every number itself, from the user's own rows, through the Phase 4 SQL
//    functions and a few plain queries ("facts").
// 3. Asks an AI model only to phrase those facts and suggest three saving ideas.
// 4. Checks the model's text: any ₹ amount or % that isn't in the facts is removed.
// 5. Saves the result in public.ai_insights and returns it.
//
// Provider is configuration, not code. Secrets (Edge Functions > Secrets):
//   AI_PROVIDER   gemini (default) | anthropic | openai
//   AI_MODEL      optional; defaults below
//   GEMINI_API_KEY / ANTHROPIC_API_KEY / OPENAI_API_KEY   the key for the chosen provider
//   AI_BASE_URL   optional, for OpenAI-compatible providers (Groq, OpenRouter, ...)
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
//
// This file is self-contained so it can be pasted into the Supabase dashboard editor.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type Period = 'daily' | 'weekly' | 'monthly'
export interface Fact { id: string; text: string; numbers: number[] }
export interface Recommendation { title: string; detail: string; estimated_saving: number | null; basis: string[] }
export interface InsightRequest {
  period: Period; from: string; to: string; prevFrom: string; prevTo: string
  periodStart: string; periodEnd: string; label: string; prevLabel: string; tz: string
  /** Start of the current calendar month in the user's time zone, for budget facts. */
  monthFrom: string; monthStart: string
}
interface Bucket { total: number; count: number }
export interface Summary {
  spent: number; income: number; count: number; expense_count: number
  biggest: { merchant: string; amount: number; occurred_at: string } | null
  by_category: Array<Bucket & { category_id: string | null }>
  top_merchants: Array<Bucket & { merchant: string }>
  by_weekday: Array<Bucket & { dow: number }>
}
export interface Txn { amount: number; merchant_name: string; occurred_at: string; type: string; category_id?: string | null }
export interface Inputs {
  cur: Summary; prev: Summary; recent: Txn[]
  categories: Array<{ id: string; name: string }>
  recurring: Array<{ merchant_name: string; expected_amount: number; frequency: string }>
  budgets: Array<{ category_id: string | null; amount: number }>
  monthSpent: number; monthByCategory: Map<string | null, number>
}

// ---------------------------------------------------------------------------
// Facts: all numbers are computed here, never by the model
// ---------------------------------------------------------------------------
const r2 = (n: number) => Math.round(n * 100) / 100
export function inr(n: number): string {
  const v = Math.round(n * 100) / 100
  return (v < 0 ? '-' : '') + '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 2 }).format(Math.abs(v))
}
const pct = (a: number, b: number) => Math.round(((a - b) / b) * 100)
// Big but expected payments (rent, EMIs, insurance, fees, SIPs, confirmed recurring, or a repeat of a
// similar payment to the same merchant) are never called unusual. Same rule as src/lib/analytics.ts.
export const PLANNED_CATEGORY = /\b(rent|emi|emis|loans?|insurance|investments?|sip|education|school|fees?|tuition)\b/i
const mkey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
export function planned(t: Txn, hist: Txn[], name: (id: string | null) => string, recurring: Array<{ merchant_name: string }>): boolean {
  if (t.category_id && PLANNED_CATEGORY.test(name(t.category_id))) return true
  const k = mkey(t.merchant_name)
  if (recurring.some((r) => mkey(r.merchant_name) === k)) return true
  // A monthly repeat of a similar large payment (the same merchant 25 to 35 days earlier, within 15%).
  const x = Date.parse(t.occurred_at)
  return t.amount >= 1000 && hist.some((h) => { const gap = (x - Date.parse(h.occurred_at)) / 86400000; return h !== t && gap >= 25 && gap <= 35 && mkey(h.merchant_name) === k && Math.abs(h.amount - t.amount) <= t.amount * 0.15 })
}
const DAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays']

export function buildFacts(req: InsightRequest, d: Inputs): Fact[] {
  const name = (id: string | null) => (id ? d.categories.find((c) => c.id === id)?.name : null) ?? 'Uncategorised'
  const f: Fact[] = []
  const add = (id: string, text: string, ...numbers: number[]) => f.push({ id, text, numbers: numbers.map(r2) })
  const c = d.cur, p = d.prev
  add('total', `You spent ${inr(c.spent)} ${req.label} across ${c.expense_count} payment${c.expense_count === 1 ? '' : 's'}.`, c.spent, c.expense_count)
  if (p.spent > 0) {
    const ch = pct(c.spent, p.spent)
    add('change', `That is ${ch >= 0 ? 'up' : 'down'} ${Math.abs(ch)}% compared with ${req.prevLabel} (${inr(p.spent)}).`, Math.abs(ch), p.spent)
  } else add('change', `Nothing was spent ${req.prevLabel}, so there is no comparison.`)
  if (c.income > 0) {
    const net = c.income - c.spent
    add('income', net >= 0
      ? `Income recorded ${req.label}: ${inr(c.income)}. You kept ${inr(net)} after expenses.`
      : `Income recorded ${req.label}: ${inr(c.income)}. You spent ${inr(-net)} more than that, so you are overspent by ${inr(-net)}.`, c.income, Math.abs(net))
  }

  const cats = [...c.by_category].sort((a, b) => b.total - a.total)
  cats.slice(0, 3).forEach((x, i) => {
    const share = c.spent ? Math.round((x.total / c.spent) * 100) : 0
    add(`cat-${i + 1}`, `${i === 0 ? 'Highest spending category' : `Number ${i + 1} category`}: ${name(x.category_id)} at ${inr(x.total)} (${share}% of spending, ${x.count} payment${x.count === 1 ? '' : 's'}).`, x.total, share, x.count)
  })
  const prevCat = new Map(p.by_category.map((x) => [x.category_id, x.total]))
  for (const x of cats.slice(0, 6)) {
    const before = prevCat.get(x.category_id) ?? 0
    if (before >= 300 && Math.abs(pct(x.total, before)) >= 15)
      add(`trend-${x.category_id ?? 'none'}`, `${name(x.category_id)} is ${x.total > before ? 'up' : 'down'} ${Math.abs(pct(x.total, before))}% compared with ${req.prevLabel} (${inr(before)} → ${inr(x.total)}).`, Math.abs(pct(x.total, before)), before, x.total, Math.abs(x.total - before))
  }
  const frequent = [...c.top_merchants].sort((a, b) => b.count - a.count)[0]
  if (frequent && frequent.count >= 3) add('frequent-merchant', `You paid ${frequent.merchant} ${frequent.count} times ${req.label}, ${inr(frequent.total)} in total.`, frequent.count, frequent.total)
  const topM = c.top_merchants[0]
  if (topM && topM !== frequent) add('top-merchant', `Most money went to ${topM.merchant}: ${inr(topM.total)} over ${topM.count} payment${topM.count === 1 ? '' : 's'}.`, topM.total, topM.count)
  if (c.biggest) add('biggest', `Biggest single expense: ${inr(c.biggest.amount)} at ${c.biggest.merchant}.`, c.biggest.amount)

  const from = Date.parse(req.from), to = Date.parse(req.to)
  const inPeriod = d.recent.filter((t) => t.type === 'debit' && Date.parse(t.occurred_at) >= from && Date.parse(t.occurred_at) <= to)
  const small = inPeriod.filter((t) => t.amount <= 200)
  if (small.length >= (req.period === 'daily' ? 3 : 6)) add('small', `${small.length} small payments of ₹200 or less added up to ${inr(small.reduce((a, t) => a + t.amount, 0))} ${req.label}.`, small.length, small.reduce((a, t) => a + t.amount, 0), 200)

  const hist = d.recent.filter((t) => t.type === 'debit')
  // Usual payments: planned ones (rent, EMIs, ...) are left out so they don't hide a real outlier.
  const usual = hist.filter((t) => !planned(t, hist, name, d.recurring))
  if (usual.length >= 10) {
    const amts = usual.map((t) => t.amount).sort((a, b) => a - b)
    const mean = amts.reduce((a, x) => a + x, 0) / amts.length
    const sd = Math.sqrt(amts.reduce((a, x) => a + (x - mean) ** 2, 0) / amts.length)
    const median = amts[Math.floor(amts.length / 2)]
    inPeriod.filter((t) => t.amount > mean + 3 * sd && usual.includes(t)).sort((a, b) => b.amount - a.amount).slice(0, 2).forEach((t, i) =>
      add(`unusual-${i + 1}`, `${inr(t.amount)} at ${t.merchant_name} is much larger than your usual payment (typically about ${inr(median)} over the last 90 days).`, t.amount, median))
  }
  if (req.period !== 'daily' && c.expense_count >= 5) {
    const day = [...c.by_weekday].sort((a, b) => b.total - a.total)[0]
    if (day) add('weekday', `You spend the most on ${DAYS[day.dow]} (${inr(day.total)} ${req.label}).`, day.total)
  }
  if (d.recurring.length) {
    const per = (x: { expected_amount: number; frequency: string }) => x.frequency === 'weekly' ? x.expected_amount * 4.33 : x.frequency === 'quarterly' ? x.expected_amount / 3 : x.frequency === 'yearly' ? x.expected_amount / 12 : x.expected_amount
    const monthly = d.recurring.reduce((a, x) => a + per(x), 0)
    add('recurring', `Confirmed recurring payments: ${d.recurring.slice(0, 5).map((x) => `${x.merchant_name} ${inr(x.expected_amount)} ${x.frequency}`).join(', ')}. Together about ${inr(monthly)} a month.`, monthly, ...d.recurring.map((x) => x.expected_amount))
  }
  for (const b of d.budgets) {
    const spent = b.category_id ? d.monthByCategory.get(b.category_id) ?? 0 : d.monthSpent
    const used = Math.round((spent / b.amount) * 100)
    if (!b.category_id || used >= 75)
      add(`budget-${b.category_id ?? 'overall'}`, `${b.category_id ? `${name(b.category_id)} budget` : 'Overall monthly budget'}: ${inr(spent)} of ${inr(b.amount)} used this month (${used}%).`, spent, b.amount, used, Math.abs(b.amount - spent))
  }
  return f
}

// ---------------------------------------------------------------------------
// Prompt and grounding
// ---------------------------------------------------------------------------
export const SYSTEM = `You are SpendWise's money assistant for a user in India. You receive FACTS computed from the user's own transactions.
Rules:
- Use only the facts. Never invent, estimate or recalculate statistics. Copy ₹ amounts and percentages exactly as written in the facts.
- Write amounts in rupees with the ₹ sign and Indian digit grouping, as in the facts.
- Do not call any purchase unnecessary or wasteful. You may suggest reviewing a category or merchant when a fact shows it is large, rising or frequent.
- Savings ideas are estimates, not money already saved. Base each one on specific facts and give an estimated monthly saving in rupees that is smaller than the spending it comes from, or null.
- Never write a negative amount or "negative savings". When expenses are more than income, say "overspent by ₹X".
- Rent, EMIs, insurance and other planned or recurring payments are expected. Never call them unusual, surprising or wasteful.
- Plain, friendly, short sentences. No markdown.
Reply with JSON only, in exactly this shape:
{"summary": "2 to 4 sentences", "highlights": ["up to 4 short points"], "recommendations": [{"title": "short", "detail": "1 to 2 sentences", "estimated_saving": 1000, "basis": ["fact ids"]}]}
Give exactly three recommendations when the facts support them, fewer if they don't.`

export function userPrompt(req: InsightRequest, facts: Fact[]): string {
  return `Period: ${req.period} (${req.label}).\nFACTS:\n${facts.map((f) => `[${f.id}] ${f.text}`).join('\n')}`
}

/** Every ₹ amount and % in the text, as numbers. */
export function numbersIn(text: string): Array<{ value: number; kind: 'inr' | 'pct' }> {
  const out: Array<{ value: number; kind: 'inr' | 'pct' }> = []
  for (const m of text.matchAll(/(?:₹|Rs\.?|INR)\s?(-?[\d,]+(?:\.\d+)?)\s*(k|K|L|lakh|lakhs)?/g)) {
    let v = Number(m[1].replace(/,/g, '')); const u = m[2]?.toLowerCase()
    if (u === 'k') v *= 1000; else if (u && u.startsWith('l')) v *= 100000
    out.push({ value: Math.abs(v), kind: 'inr' })
  }
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s?%/g)) out.push({ value: Number(m[1]), kind: 'pct' })
  return out
}

const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.005)

/** Removes sentences that cite a number not present in the facts. */
export function groundText(text: string, allowed: number[]): { text: string; removed: number } {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean)
  // Negative money ("-₹500", "₹-500") and "negative savings" are never shown; the facts say "overspent by" instead.
  const kept = sentences.filter((s) => !/-\s*₹|₹\s*-|negative (net )?savings/i.test(s) && numbersIn(s).every((n) => allowed.some((a) => close(n.value, a))))
  return { text: kept.join(' '), removed: sentences.length - kept.length }
}

interface ModelOut { summary?: unknown; highlights?: unknown; recommendations?: unknown }

export function parseModelJson(raw: string): ModelOut {
  const s = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  const a = s.indexOf('{'), b = s.lastIndexOf('}')
  return JSON.parse(a >= 0 && b > a ? s.slice(a, b + 1) : s)
}

/** Keeps only what the facts support; tops up recommendations from the facts if needed. */
export function validate(out: ModelOut, facts: Fact[]): { summary: string; highlights: string[]; recommendations: Recommendation[]; removed: number } {
  const allowed = facts.flatMap((f) => f.numbers)
  let removed = 0
  const g = (t: unknown) => { const r = groundText(String(t ?? ''), allowed); removed += r.removed; return r.text }
  const summary = g(out.summary)
  const highlights = (Array.isArray(out.highlights) ? out.highlights : []).slice(0, 4).map(g).filter(Boolean)
  const ids = new Set(facts.map((f) => f.id))
  const recs: Recommendation[] = []
  for (const x of Array.isArray(out.recommendations) ? out.recommendations : []) {
    if (recs.length >= 3 || !x || typeof x !== 'object') continue
    const o = x as Record<string, unknown>
    const basis = (Array.isArray(o.basis) ? o.basis : []).map(String).filter((id) => ids.has(id))
    if (!basis.length) { removed++; continue }
    // A saving can't be bigger than the spending it is based on.
    const ceiling = Math.max(0, ...facts.filter((f) => basis.includes(f.id)).flatMap((f) => f.numbers))
    const est = typeof o.estimated_saving === 'number' && o.estimated_saving > 0 && o.estimated_saving < ceiling ? Math.round(o.estimated_saving) : null
    const okNums = [...allowed, ...(est ? [est] : [])]
    const detail = groundTextLoose(String(o.detail ?? ''), okNums, ceiling)
    const title = String(o.title ?? '').slice(0, 80)
    if (!title || !detail) { removed++; continue }
    recs.push({ title, detail, estimated_saving: est, basis })
  }
  for (const r of fallbackRecs(facts)) if (recs.length < 3 && !recs.some((x) => x.basis[0] === r.basis[0])) recs.push(r)
  return { summary: summary || facts.slice(0, 2).map((f) => f.text).join(' '), highlights, recommendations: recs, removed }
}

/** For suggestions: ₹ amounts may be smaller targets (e.g. "₹500 less"), but never above the basis. */
function groundTextLoose(text: string, allowed: number[], ceiling: number): string {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean)
  return sentences.filter((s) => numbersIn(s).every((n) => n.kind === 'inr' ? n.value <= ceiling || allowed.some((a) => close(n.value, a)) : allowed.some((a) => close(n.value, a)))).join(' ')
}

/** Rule-based ideas used when the model gives fewer than three usable ones. Always labelled estimates. */
export function fallbackRecs(facts: Fact[]): Recommendation[] {
  const out: Recommendation[] = []
  for (const f of facts.filter((x) => x.id.startsWith('trend-') && x.text.includes(' is up '))) {
    const [, before, now, diff] = f.numbers
    const cat = f.text.split(' is up ')[0]
    out.push({ title: `Bring ${cat} back to its earlier level`, detail: `${cat} went from ${inr(before)} to ${inr(now)}. Spending at the earlier level would keep about ${inr(diff)}.`, estimated_saving: Math.round(diff), basis: [f.id] })
  }
  const freq = facts.find((x) => x.id === 'frequent-merchant')
  if (freq) {
    const [count, total] = freq.numbers
    const est = Math.round(total / count) * Math.max(1, Math.floor(count / 3))
    const who = freq.text.replace(/^You paid /, '').split(/ \d+ times/)[0]
    out.push({ title: `Fewer orders from ${who}`, detail: `You paid ${who} ${count} times. Skipping about one in three would save roughly ${inr(est)}.`, estimated_saving: est, basis: [freq.id] })
  }
  const small = facts.find((x) => x.id === 'small')
  if (small) {
    const [n, total] = small.numbers
    out.push({ title: 'Watch the small payments', detail: `${n} small payments added up to ${inr(total)}. Cutting them by half would save about ${inr(Math.round(total / 2))}.`, estimated_saving: Math.round(total / 2), basis: [small.id] })
  }
  const rec = facts.find((x) => x.id === 'recurring')
  if (rec) out.push({ title: 'Review your subscriptions', detail: 'Check whether you still use each recurring payment. Cancelling one you no longer need saves its full amount every cycle.', estimated_saving: null, basis: [rec.id] })
  return out
}

// ---------------------------------------------------------------------------
// Providers: swap by setting AI_PROVIDER / AI_MODEL / the key. Nothing else changes.
// ---------------------------------------------------------------------------
export interface ProviderConfig { provider: string; model: string; key: string; baseUrl?: string; /** true when AI_MODEL was set; Gemini then tries it first */ pinned?: boolean }
type Fetch = typeof fetch

export function providerConfig(env: (k: string) => string | undefined): ProviderConfig {
  const provider = (env('AI_PROVIDER') ?? 'gemini').toLowerCase()
  const defaults: Record<string, [string, string]> = {
    gemini: ['auto', 'GEMINI_API_KEY'], anthropic: ['claude-haiku-5-5', 'ANTHROPIC_API_KEY'], openai: ['gpt-4o-mini', 'OPENAI_API_KEY'],
  }
  const [model, keyName] = defaults[provider] ?? defaults.openai
  const key = env(keyName) ?? ''
  if (!key) throw new HttpError(503, `AI is not set up: add the ${keyName} secret in Supabase.`)
  return { provider, model: env('AI_MODEL') ?? model, key, baseUrl: env('AI_BASE_URL'), pinned: !!env('AI_MODEL') }
}

// Google retires Gemini model names often (and refuses old ones for new keys), so the model is
// picked at run time: AI_MODEL if set, then the newest stable Flash models this key can list,
// then a built-in list. A model that is refused or missing is skipped and the next one is tried.
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta'
export const GEMINI_FALLBACK = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-flash-latest', 'gemini-3.5-flash-lite']
let geminiListCache: { key: string; at: number; models: string[] } | null = null

/** Stable text Flash models the key can use, newest first (no preview, image, audio or live variants). */
export async function listGeminiModels(key: string, f: Fetch = fetch): Promise<string[]> {
  if (geminiListCache?.key === key && Date.now() - geminiListCache.at < 3600_000) return geminiListCache.models
  try {
    const res = await f(`${GEMINI}/models?pageSize=200`, { headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(8000) })
    if (!res.ok) return []
    const b = await res.json() as { models?: Array<{ name: string; supportedGenerationMethods?: string[] }> }
    const ver = (n: string) => Number(n.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 0)
    const models = (b.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''))
      .filter((n) => /^gemini-\d+(\.\d+)?-flash(-lite)?$/.test(n))
      .sort((a, z) => Number(a.includes('lite')) - Number(z.includes('lite')) || ver(z) - ver(a))
    geminiListCache = { key, at: Date.now(), models }
    return models
  } catch { return [] }
}

const retired = (status: number, msg: string) => status === 404 || ((status === 400 || status === 403) && /no longer available|not found|not supported|deprecated|retired|unsupported model|is not available/i.test(msg))

// Busy: Google's "high demand" / UNAVAILABLE (503), rate or quota limits (429), and other 5xx or timeouts.
// These are temporary, so the same model is retried once after a short pause, then the next model is tried.
const busy = (status: number, msg: string) => status === 429 || status >= 500 || /high demand|overloaded|unavailable|resource.?exhausted|try again later/i.test(msg)
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function callModel(cfg: ProviderConfig, system: string, user: string, f: Fetch = fetch, wait: (ms: number) => Promise<unknown> = pause): Promise<string> {
  const order = cfg.provider === 'gemini'
    ? [...new Set([...(cfg.pinned ? [cfg.model] : []), ...(await listGeminiModels(cfg.key, f)), ...GEMINI_FALLBACK])].slice(0, 6)
    : [cfg.model]
  let retiredMsg = '', busyMsg = ''
  for (const model of order) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try { const text = await callOne({ ...cfg, model }, system, user, f); cfg.model = model; return text } catch (e) {
        if (e instanceof RetiredModel) { retiredMsg = e.message; break }
        if (e instanceof BusyModel) { busyMsg = e.message; if (attempt === 0) await wait(1500); continue }
        throw e
      }
    }
  }
  if (busyMsg) throw new HttpError(503, 'The AI service is busy right now. Try again in a minute.')
  throw new HttpError(502, `No Gemini model was available for this key. Set the AI_MODEL secret to a model listed in Google AI Studio. (${retiredMsg})`)
}

class RetiredModel extends Error {}
class BusyModel extends Error {}

async function callOne(cfg: ProviderConfig, system: string, user: string, f: Fetch): Promise<string> {
  try { return await requestOne(cfg, system, user, f) } catch (e) {
    if (e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError')) throw new BusyModel(`${cfg.model}: timed out`)
    throw e
  }
}

async function requestOne(cfg: ProviderConfig, system: string, user: string, f: Fetch): Promise<string> {
  const signal = AbortSignal.timeout(25000)
  let res: Response
  if (cfg.provider === 'gemini') {
    res = await f(`${GEMINI}/models/${encodeURIComponent(cfg.model)}:generateContent`, {
      method: 'POST', signal, headers: { 'content-type': 'application/json', 'x-goog-api-key': cfg.key },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { temperature: 0.3, responseMimeType: 'application/json' } }),
    })
  } else if (cfg.provider === 'anthropic') {
    res = await f('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal, headers: { 'content-type': 'application/json', 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: cfg.model, max_tokens: 1200, temperature: 0.3, system, messages: [{ role: 'user', content: user }] }),
    })
  } else {
    res = await f(`${(cfg.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '')}/chat/completions`, {
      method: 'POST', signal, headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify({ model: cfg.model, temperature: 0.3, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    })
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = (body as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`
    if (cfg.provider === 'gemini' && retired(res.status, msg)) throw new RetiredModel(`${cfg.model}: ${msg}`)
    if (busy(res.status, msg)) throw new BusyModel(`${cfg.model}: ${msg}`)
    throw new HttpError(502, `The AI service returned an error: ${msg}`)
  }
  const b = body as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  const text = cfg.provider === 'gemini' ? b.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('')
    : cfg.provider === 'anthropic' ? b.content?.find((c: { type: string }) => c.type === 'text')?.text
    : b.choices?.[0]?.message?.content
  if (!text) throw new HttpError(502, 'The AI service returned an empty answer.')
  return text
}

// ---------------------------------------------------------------------------
// Request handling
// ---------------------------------------------------------------------------
export class HttpError extends Error { constructor(public status: number, message: string) { super(message) } }

export function parseRequest(body: unknown): InsightRequest {
  const b = (body ?? {}) as Record<string, unknown>
  const period = b.period
  if (period !== 'daily' && period !== 'weekly' && period !== 'monthly') throw new HttpError(400, 'period must be daily, weekly or monthly')
  const iso = (k: string) => { const v = String(b[k] ?? ''); if (isNaN(Date.parse(v))) throw new HttpError(400, `${k} must be a date`); return new Date(v).toISOString() }
  const day = (k: string) => { const v = String(b[k] ?? ''); if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new HttpError(400, `${k} must be yyyy-mm-dd`); return v }
  const req: InsightRequest = {
    period, from: iso('from'), to: iso('to'), prevFrom: iso('prevFrom'), prevTo: iso('prevTo'), periodStart: day('periodStart'), periodEnd: day('periodEnd'),
    monthFrom: iso('monthFrom'), monthStart: day('monthStart'),
    label: String(b.label ?? 'in this period').slice(0, 40), prevLabel: String(b.prevLabel ?? 'the previous period').slice(0, 40), tz: String(b.tz ?? 'Asia/Kolkata').slice(0, 64),
  }
  const span = Date.parse(req.to) - Date.parse(req.from)
  if (span < 0 || span > 40 * 86400000) throw new HttpError(400, 'from/to must be at most 40 days apart')
  return req
}

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type', 'access-control-allow-methods': 'POST, OPTIONS' }
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Deps { env: (k: string) => string | undefined; createClient: (url: string, key: string, opts?: any) => any; fetch: Fetch; now: () => Date }

export function makeHandler(deps: Deps) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
    try {
      if (req.method !== 'POST') throw new HttpError(405, 'Use POST')
      const auth = req.headers.get('authorization') ?? ''
      if (!/^Bearer\s+\S+/.test(auth)) throw new HttpError(401, 'Sign in first')
      const url = deps.env('SUPABASE_URL')!, anon = deps.env('SUPABASE_ANON_KEY')!, service = deps.env('SUPABASE_SERVICE_ROLE_KEY')!
      // Reads go through the caller's JWT, so RLS applies. Only the final insert uses the service role.
      const db = deps.createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } })
      const { data: u, error: ue } = await db.auth.getUser(auth.replace(/^Bearer\s+/, ''))
      if (ue || !u?.user) throw new HttpError(401, 'Your session has expired. Sign in again.')
      const uid: string = u.user.id
      const r = parseRequest(await req.json().catch(() => ({})))

      const { data: prefs } = await db.from('user_preferences').select('ai_insights_enabled').eq('user_id', uid).maybeSingle()
      if (prefs && prefs.ai_insights_enabled === false) throw new HttpError(403, 'AI insights are turned off in your settings.')

      const admin = deps.createClient(url, service, { auth: { persistSession: false } })
      const { data: existing } = await admin.from('ai_insights').select('*').eq('user_id', uid).eq('period', r.period).eq('period_start', r.periodStart).maybeSingle()
      if (existing && deps.now().getTime() - Date.parse(existing.updated_at) < 60_000) return json(200, { insight: existing, cached: true })

      const now = deps.now()
      const since = new Date(now.getTime() - 90 * 86400000).toISOString()
      const call = async <T,>(p: PromiseLike<{ data: T; error: { message: string; code?: string } | null }>) => {
        const { data, error } = await p
        if (error) throw new HttpError(error.code === 'PGRST202' ? 503 : 500, error.code === 'PGRST202' ? 'Run phase4-analytics.sql in Supabase first.' : error.message)
        return data
      }
      const [cur, prev, recent, categories, recurring, budgets, month] = await Promise.all([
        call<Summary>(db.rpc('analytics_summary', { p_from: r.from, p_to: r.to, p_tz: r.tz })),
        call<Summary>(db.rpc('analytics_summary', { p_from: r.prevFrom, p_to: r.prevTo, p_tz: r.tz })),
        call<Txn[]>(db.from('transactions').select('amount, merchant_name, occurred_at, type, category_id').eq('exclude_from_reports', false).gte('occurred_at', since).order('occurred_at', { ascending: false }).limit(5000)),
        call<Array<{ id: string; name: string }>>(db.from('categories').select('id, name')),
        call<Inputs['recurring']>(db.from('recurring_transactions').select('merchant_name, expected_amount, frequency').eq('state', 'confirmed')),
        call<Inputs['budgets']>(db.from('budgets').select('category_id, amount').eq('month', r.monthStart)),
        call<Summary>(db.rpc('analytics_summary', { p_from: r.monthFrom, p_to: now.toISOString(), p_tz: r.tz })),
      ])
      const num = (s: Summary): Summary => ({ ...s, spent: Number(s.spent), income: Number(s.income), by_category: s.by_category.map((x) => ({ ...x, total: Number(x.total) })), top_merchants: s.top_merchants.map((x) => ({ ...x, total: Number(x.total) })), by_weekday: s.by_weekday.map((x) => ({ ...x, total: Number(x.total) })), biggest: s.biggest ? { ...s.biggest, amount: Number(s.biggest.amount) } : null })
      const facts = buildFacts(r, {
        cur: num(cur), prev: num(prev), recent: recent.map((t) => ({ ...t, amount: Number(t.amount) })), categories,
        recurring: recurring.map((x) => ({ ...x, expected_amount: Number(x.expected_amount) })), budgets: budgets.map((b) => ({ ...b, amount: Number(b.amount) })),
        monthSpent: Number(month.spent), monthByCategory: new Map(month.by_category.map((x) => [x.category_id, Number(x.total)])),
      })

      let narrative: string, recommendations: Recommendation[], model: string | null = null, highlights: string[] = []
      if (Number(cur.expense_count) < (r.period === 'daily' ? 1 : 3)) {
        narrative = `Not enough transactions ${r.label} for a summary yet. Insights appear once you have a few expenses recorded.`
        recommendations = []
      } else {
        const cfg = providerConfig(deps.env)
        const raw = await callModel(cfg, SYSTEM, userPrompt(r, facts), deps.fetch)
        let parsed: ModelOut
        try { parsed = parseModelJson(raw) } catch { parsed = {} }
        const v = validate(parsed, facts)
        narrative = v.summary; highlights = v.highlights; recommendations = v.recommendations; model = `${cfg.provider}:${cfg.model}`
      }
      const row = {
        user_id: uid, period: r.period, period_start: r.periodStart, period_end: r.periodEnd,
        facts: facts.map(({ id, text }) => ({ id, text })), narrative: [narrative, ...highlights.map((h) => `• ${h}`)].join('\n'), recommendations, model,
      }
      const { data: saved, error: se } = await admin.from('ai_insights').upsert(row, { onConflict: 'user_id,period,period_start' }).select().single()
      if (se) throw new HttpError(500, se.message)
      return json(200, { insight: saved, cached: false })
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500
      return json(status, { error: e instanceof Error ? e.message : 'Something went wrong' })
    }
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Start the server when running on Supabase (tests import this file with SPENDWISE_TEST=1).
declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Promise<Response>): void } | undefined
if (typeof Deno !== 'undefined' && !Deno.env.get('SPENDWISE_TEST')) {
  const { createClient } = await import('npm:@supabase/supabase-js@2')
  Deno.serve(makeHandler({ env: (k) => Deno!.env.get(k), createClient, fetch, now: () => new Date() }))
}
