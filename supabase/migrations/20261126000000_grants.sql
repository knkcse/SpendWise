-- Explicit Data API privileges. RLS still decides which rows each user sees;
-- these grants only decide which roles may reach the tables at all.
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on
  public.profiles, public.categories, public.payment_sources, public.transactions,
  public.transaction_splits, public.merchant_category_rules, public.budgets,
  public.recurring_transactions, public.user_preferences
to authenticated;
grant select, delete on public.ai_insights to authenticated;
