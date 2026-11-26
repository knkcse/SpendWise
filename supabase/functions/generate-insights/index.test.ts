// deno test --allow-env supabase/functions/generate-insights/   (SPENDWISE_TEST=1 is set below)
import { assert, assertEquals, assertMatch } from 'jsr:@std/assert@1'
Deno.env.set('SPENDWISE_TEST', '1')
const m = await import('./index.ts')

const req = {
  period: 'monthly', from: '2026-10-31T18:30:00.000Z', to: '2026-11-26T12:00:00.000Z', prevFrom: '2026-09-30T18:30:00.000Z', prevTo: '2026-10-26T12:00:00.000Z',
  periodStart: '2026-11-01', periodEnd: '2026-11-30', label: 'this month so far', prevLabel: 'the same point last month', tz: 'Asia/Kolkata',
  monthFrom: '2026-10-31T18:30:00.000Z', monthStart: '2026-11-01',
}
const cur = {
  spent: '24500.00', income: '85000', count: 15, expense_count: 14, biggest: { merchant: 'House Owner', amount: '12000', occurred_at: '2026-11-01T04:00:00Z' },
  by_category: [{ category_id: 'rent', total: '12000', count: 1 }, { category_id: 'food', total: '6200', count: 9 }, { category_id: 'groc', total: '6300', count: 4 }],
  top_merchants: [{ merchant: 'House Owner', total: '12000', count: 1 }, { merchant: 'Swiggy', total: '4100', count: 7 }, { merchant: 'DMart', total: '6300', count: 4 }],
  by_weekday: [{ dow: 3, total: '9000', count: 5 }, { dow: 6, total: '15500', count: 9 }],
}
const prev = { ...cur, spent: '19000', income: '85000', expense_count: 10, by_category: [{ category_id: 'rent', total: '12000', count: 1 }, { category_id: 'food', total: '4000', count: 6 }, { category_id: 'groc', total: '3000', count: 3 }], top_merchants: [], by_weekday: [] }
const recent = Array.from({ length: 30 }, (_, i) => ({ amount: i === 0 ? 12000 : 150 + i * 10, merchant_name: i % 2 ? 'Swiggy' : 'Chai Point', occurred_at: `2026-11-${String((i % 25) + 1).padStart(2, '0')}T08:00:00Z`, type: 'debit' }))
const categories = [{ id: 'rent', name: 'Rent' }, { id: 'food', name: 'Food & Dining' }, { id: 'groc', name: 'Groceries' }]

// A tiny stand-in for supabase-js: records calls, returns canned rows.
function fakeSupabase(log: string[], stored: Record<string, unknown>[]) {
  const tables: Record<string, unknown> = {
    user_preferences: { ai_insights_enabled: true }, transactions: recent, categories,
    recurring_transactions: [{ merchant_name: 'Netflix', expected_amount: '649', frequency: 'monthly' }], budgets: [{ category_id: null, amount: '30000' }],
  }
  return (_url: string, key: string, opts?: { global?: { headers?: Record<string, string> } }) => {
    log.push(`client:${key}:${opts?.global?.headers?.Authorization ?? '-'}`)
    const q = (table: string) => {
      let single = false
      const b: Record<string, unknown> = {}
      for (const k of ['select', 'eq', 'gte', 'order', 'limit']) b[k] = () => b
      b.maybeSingle = () => { single = true; return b }
      b.single = () => { single = true; return b }
      b.upsert = (row: Record<string, unknown>) => { stored.push(row); tables.ai_insights = { ...row, id: 'x', updated_at: new Date().toISOString() }; return b }
      b.then = (res: (v: unknown) => void) => {
        const rows = table === 'ai_insights' ? (tables.ai_insights ?? null) : tables[table]
        res({ data: single && Array.isArray(rows) ? rows[0] : rows, error: null })
      }
      return b
    }
    return {
      auth: { getUser: (jwt: string) => Promise.resolve(jwt === 'good' ? { data: { user: { id: 'user-1' } }, error: null } : { data: null, error: { message: 'bad' } }) },
      rpc: (name: string, args: Record<string, string>) => { log.push(`rpc:${name}:${args.p_from}`); return Promise.resolve({ data: args.p_from === req.prevFrom ? prev : cur, error: null }) },
      from: q,
    }
  }
}

Deno.test('facts carry the exact numbers and leave nothing to the model', () => {
  const num = (s: typeof cur) => ({ ...s, spent: +s.spent, income: +s.income, by_category: s.by_category.map((x) => ({ ...x, total: +x.total })), top_merchants: s.top_merchants.map((x) => ({ ...x, total: +x.total })), by_weekday: s.by_weekday.map((x) => ({ ...x, total: +x.total })), biggest: { ...s.biggest, amount: +s.biggest.amount } })
  const facts = m.buildFacts(req as never, { cur: num(cur), prev: num(prev as never), recent, categories, recurring: [], budgets: [], monthSpent: 24500, monthByCategory: new Map() } as never)
  const t = Object.fromEntries(facts.map((f) => [f.id, f.text]))
  assertEquals(t.total, 'You spent ₹24,500 this month so far across 14 payments.')
  assertEquals(t.change, 'That is up 29% compared with the same point last month (₹19,000).')
  assertMatch(t['trend-groc'], /Groceries is up 110% .*₹3,000 → ₹6,300/)
  assertMatch(t['frequent-merchant'], /Swiggy 7 times/)
  assert(t['unusual-1']?.includes('₹12,000'))
})

Deno.test('model text with made-up numbers is removed; recommendations topped up from facts', () => {
  const facts = [
    { id: 'total', text: 'You spent ₹24,500 this month.', numbers: [24500, 14] },
    { id: 'trend-food', text: 'Food & Dining is up 55% compared with last month (₹4,000 → ₹6,200).', numbers: [55, 4000, 6200, 2200] },
  ]
  const v = m.validate({
    summary: 'You spent ₹24,500 this month. Food is up 55%. You also wasted ₹9,999 on gadgets.',
    highlights: ['Food & Dining rose to ₹6,200', 'Shopping is up 80%'],
    recommendations: [
      { title: 'Cook more', detail: 'Food went from ₹4,000 to ₹6,200. Aim for ₹5,000 next month.', estimated_saving: 1200, basis: ['trend-food'] },
      { title: 'Made up', detail: 'Cancel your gym for ₹2,000.', estimated_saving: 2000, basis: ['nope'] },
      { title: 'Too big', detail: 'Save a lot.', estimated_saving: 50000, basis: ['trend-food'] },
    ],
  }, facts)
  assertEquals(v.summary, 'You spent ₹24,500 this month. Food is up 55%.')
  assertEquals(v.highlights, ['Food & Dining rose to ₹6,200'])
  assertEquals(v.recommendations[0], { title: 'Cook more', detail: 'Food went from ₹4,000 to ₹6,200. Aim for ₹5,000 next month.', estimated_saving: 1200, basis: ['trend-food'] })
  assertEquals(v.recommendations[1].estimated_saving, null) // 50,000 is more than the spending it is based on
  assertEquals(v.recommendations.length, 2)
})

Deno.test('end to end: JWT user, facts from SQL, Gemini call, grounded result saved', async () => {
  const log: string[] = [], stored: Record<string, unknown>[] = []
  let sent: { url: string; headers: Record<string, string>; body: Record<string, unknown> } | null = null
  const fakeFetch = (url: string, init: RequestInit) => {
    sent = { url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) }
    const out = { summary: 'You spent ₹24,500 this month so far, up 29% compared with the same point last month. Rent was your biggest cost at ₹12,000.', highlights: ['Swiggy: 7 orders'],
      recommendations: [{ title: 'Order in less', detail: 'You paid Swiggy 7 times, ₹4,100 in total.', estimated_saving: 1000, basis: ['frequent-merchant'] }] }
    return Promise.resolve(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] }), { status: 200 }))
  }
  const env: Record<string, string> = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', GEMINI_API_KEY: 'AIza-test' }
  const h = m.makeHandler({ env: (k) => env[k], createClient: fakeSupabase(log, stored), fetch: fakeFetch as never, now: () => new Date('2026-11-26T12:00:00Z') })

  const unauth = await h(new Request('http://x', { method: 'POST', body: JSON.stringify(req), headers: { authorization: 'Bearer bad' } }))
  assertEquals(unauth.status, 401)

  const res = await h(new Request('http://x', { method: 'POST', body: JSON.stringify({ ...req, user_id: 'someone-else' }), headers: { authorization: 'Bearer good' } }))
  const body = await res.json()
  assertEquals(res.status, 200, JSON.stringify(body))
  assert(log.includes('client:anon:Bearer good'), 'reads use the caller JWT')
  assert(sent!.url.includes('gemini-2.5-flash:generateContent'))
  assertEquals(sent!.headers['x-goog-api-key'], 'AIza-test')
  assertMatch(JSON.stringify(sent!.body), /\[total\] You spent ₹24,500/)
  const row = stored[0]
  assertEquals(row.user_id, 'user-1') // from the JWT, not the body
  assertEquals(row.model, 'gemini:gemini-2.5-flash')
  assertMatch(String(row.narrative), /₹24,500/)
  const recs = row.recommendations as Array<{ title: string; estimated_saving: number | null }>
  assertEquals(recs.length, 3)
  assertEquals(recs[0].title, 'Order in less')
  assert(recs.every((r) => r.estimated_saving === null || r.estimated_saving > 0))

  // Within a minute the saved result is returned without calling the model again.
  sent = null
  const again = await h(new Request('http://x', { method: 'POST', body: JSON.stringify(req), headers: { authorization: 'Bearer good' } }))
  assertEquals((await again.json()).cached, true); assertEquals(sent, null)
})

Deno.test('switching provider is configuration only', async () => {
  for (const [provider, keyName, urlPart] of [['anthropic', 'ANTHROPIC_API_KEY', 'api.anthropic.com'], ['openai', 'OPENAI_API_KEY', 'api.groq.com']]) {
    const env: Record<string, string> = { AI_PROVIDER: provider, [keyName]: 'k', ...(provider === 'openai' ? { AI_BASE_URL: 'https://api.groq.com/openai/v1', AI_MODEL: 'llama-3.3-70b-versatile' } : {}) }
    const cfg = m.providerConfig((k) => env[k])
    let url = ''
    const reply = provider === 'anthropic' ? { content: [{ type: 'text', text: '{"summary":"ok"}' }] } : { choices: [{ message: { content: '{"summary":"ok"}' } }] }
    const text = await m.callModel(cfg, 's', 'u', ((u: string) => { url = u; return Promise.resolve(new Response(JSON.stringify(reply))) }) as never)
    assert(url.includes(urlPart)); assertEquals(text, '{"summary":"ok"}')
  }
  let threw = ''
  try { m.providerConfig(() => undefined) } catch (e) { threw = (e as Error).message }
  assertMatch(threw, /GEMINI_API_KEY/)
})
