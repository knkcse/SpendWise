-- Phase 4: analytics computed in Postgres, so large histories don't have to be
-- summed on the phone. Every function:
--   * runs as the caller (security invoker), so RLS still applies, and also
--     filters on auth.uid() explicitly;
--   * leaves out transactions marked exclude_from_reports;
--   * counts a split transaction's parts in their own categories, and the
--     whole amount once everywhere else (totals, payment apps, merchants).
-- The app has an identical on-device implementation (src/lib/summary.ts) that
-- it uses offline or while local changes are still syncing.

-- Helps the per-period scans; transactions_user_date_idx already covers occurred_at.
create index if not exists transaction_splits_user_txn_idx on public.transaction_splits (user_id, transaction_id);

-- ---------------------------------------------------------------------------
-- analytics_summary: everything the period screens need, in one round trip.
-- ---------------------------------------------------------------------------
create or replace function public.analytics_summary(p_from timestamptz, p_to timestamptz, p_tz text default 'Asia/Kolkata')
returns jsonb
language sql stable security invoker set search_path = public
as $$
  with tx as (
    select t.id, t.occurred_at, t.occurred_at at time zone p_tz as local_ts, t.type, t.amount,
           t.payment_source_id, t.merchant_name, t.category_id
    from public.transactions t
    where t.user_id = auth.uid() and not t.exclude_from_reports
      and t.occurred_at >= p_from and t.occurred_at <= p_to
  ),
  ex as (select * from tx where type = 'debit'),
  lines as (
    select case when s.id is null then e.category_id else s.category_id end as category_id,
           coalesce(s.amount, e.amount) as amount
    from ex e left join public.transaction_splits s on s.transaction_id = e.id and s.user_id = auth.uid()
  )
  select jsonb_build_object(
    'spent',   coalesce((select sum(amount) from ex), 0),
    'income',  coalesce((select sum(amount) from tx where type = 'credit'), 0),
    'count',   (select count(*) from tx),
    'expense_count', (select count(*) from ex),
    'biggest', (select jsonb_build_object('id', id, 'merchant', merchant_name, 'amount', amount, 'occurred_at', occurred_at)
                from ex order by amount desc, occurred_at limit 1),
    'by_category', coalesce((select jsonb_agg(jsonb_build_object('category_id', category_id, 'total', total, 'count', n) order by total desc)
                from (select category_id, sum(amount) as total, count(*) as n from lines group by category_id) x), '[]'::jsonb),
    'by_source', coalesce((select jsonb_agg(jsonb_build_object('source_id', payment_source_id, 'total', total, 'count', n) order by total desc)
                from (select payment_source_id, sum(amount) as total, count(*) as n from ex group by payment_source_id) x), '[]'::jsonb),
    'top_merchants', coalesce((select jsonb_agg(jsonb_build_object('merchant', name, 'total', total, 'count', n) order by total desc, n desc)
                from (select (array_agg(merchant_name order by occurred_at desc))[1] as name, sum(amount) as total, count(*) as n
                      from ex group by lower(btrim(merchant_name)) order by sum(amount) desc, count(*) desc limit 10) x), '[]'::jsonb),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('date', d, 'spent', spent, 'income', inc) order by d)
                from (select to_char(local_ts, 'YYYY-MM-DD') as d,
                             coalesce(sum(amount) filter (where type = 'debit'), 0) as spent,
                             coalesce(sum(amount) filter (where type = 'credit'), 0) as inc
                      from tx group by 1) x), '[]'::jsonb),
    'by_weekday', coalesce((select jsonb_agg(jsonb_build_object('dow', dow, 'total', total, 'count', n) order by dow)
                from (select extract(dow from local_ts)::int as dow, sum(amount) as total, count(*) as n from ex group by 1) x), '[]'::jsonb),
    'by_hour', coalesce((select jsonb_agg(jsonb_build_object('hour', h, 'total', total, 'count', n) order by h)
                from (select extract(hour from local_ts)::int as h, sum(amount) as total, count(*) as n from ex group by 1) x), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------------
-- analytics_overview: dashboard headline numbers, "same point last period"
-- comparisons, and a monthly trend. Period boundaries use the caller's time
-- zone and week start (0 = Sunday, 1 = Monday).
-- ---------------------------------------------------------------------------
create or replace function public.analytics_overview(p_tz text default 'Asia/Kolkata', p_week_start int default 1, p_months int default 6, p_now timestamptz default now())
returns jsonb
language sql stable security invoker set search_path = public
as $$
  with b as (
    select n, d, w, m, y from (
      select p_now at time zone p_tz as n,
             date_trunc('day', p_now at time zone p_tz) as d,
             date_trunc('day', p_now at time zone p_tz) - make_interval(days => ((extract(dow from p_now at time zone p_tz)::int - p_week_start + 7) % 7)) as w,
             date_trunc('month', p_now at time zone p_tz) as m,
             date_trunc('year', p_now at time zone p_tz) as y
    ) z
  ),
  tx as (
    select t.occurred_at at time zone p_tz as ts, t.type, t.amount
    from public.transactions t, b
    where t.user_id = auth.uid() and not t.exclude_from_reports
      and t.occurred_at >= (least(b.y - interval '1 year', b.m - make_interval(months => greatest(p_months, 1) - 1)) at time zone p_tz)
      and t.occurred_at <= p_now
  ),
  months as (
    select gs as month_start from b, generate_series(b.m - make_interval(months => greatest(p_months, 1) - 1), b.m, interval '1 month') gs
  )
  select jsonb_build_object(
    'today',      coalesce(sum(amount) filter (where type = 'debit' and ts >= b.d), 0),
    'week',       coalesce(sum(amount) filter (where type = 'debit' and ts >= b.w), 0),
    'month',      coalesce(sum(amount) filter (where type = 'debit' and ts >= b.m), 0),
    'year',       coalesce(sum(amount) filter (where type = 'debit' and ts >= b.y), 0),
    'month_income', coalesce(sum(amount) filter (where type = 'credit' and ts >= b.m), 0),
    -- Same number of elapsed days/time in the previous period, so a half-finished month is compared fairly.
    'prev_week_to_date',  coalesce(sum(amount) filter (where type = 'debit' and ts >= b.w - interval '7 days' and ts <= b.n - interval '7 days'), 0),
    'prev_month_to_date', coalesce(sum(amount) filter (where type = 'debit' and ts >= b.m - interval '1 month' and ts <= b.n - interval '1 month'), 0),
    'prev_year_to_date',  coalesce(sum(amount) filter (where type = 'debit' and ts >= b.y - interval '1 year' and ts <= b.n - interval '1 year'), 0),
    'trend', (select jsonb_agg(jsonb_build_object(
                'month', to_char(mo.month_start, 'YYYY-MM'),
                'spent',  coalesce((select sum(amount) from tx where type = 'debit'  and ts >= mo.month_start and ts < mo.month_start + interval '1 month'), 0),
                'income', coalesce((select sum(amount) from tx where type = 'credit' and ts >= mo.month_start and ts < mo.month_start + interval '1 month'), 0))
              order by mo.month_start) from months mo)
  )
  from b left join tx on true
  group by b.n, b.d, b.w, b.m, b.y;
$$;

revoke all on function public.analytics_summary(timestamptz, timestamptz, text) from public, anon;
revoke all on function public.analytics_overview(text, int, int, timestamptz) from public, anon;
grant execute on function public.analytics_summary(timestamptz, timestamptz, text) to authenticated;
grant execute on function public.analytics_overview(text, int, int, timestamptz) to authenticated;
