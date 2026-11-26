-- Phase 3: integrity guards for expense data. Safe to run more than once.

-- A row may only point at a category that is a system default or the user's own.
create or replace function public.check_category_owner() returns trigger
language plpgsql security definer set search_path = public as $$
declare r jsonb := to_jsonb(new); k text; cid uuid;
begin
  -- to_jsonb lets one function serve tables with different column names
  foreach k in array array['category_id', 'subcategory_id', 'parent_id']
  loop
    cid := (r->>k)::uuid;
    if cid is not null and not exists (
      select 1 from public.categories c where c.id = cid and (c.user_id is null or c.user_id = (r->>'user_id')::uuid)) then
      raise exception 'category % is not available to this user', cid using errcode = '23503';
    end if;
  end loop;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['transactions','transaction_splits','budgets','recurring_transactions','merchant_category_rules','categories']
  loop
    execute format('drop trigger if exists %I_category_owner on public.%I', t, t);
    execute format('create trigger %I_category_owner before insert or update on public.%I
                    for each row execute function public.check_category_owner()', t, t);
  end loop;
end $$;

-- Same for payment sources.
create or replace function public.check_source_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.payment_source_id is not null and not exists (
    select 1 from public.payment_sources s where s.id = new.payment_source_id and s.user_id = new.user_id) then
    raise exception 'payment source is not available to this user' using errcode = '23503';
  end if;
  return new;
end $$;
drop trigger if exists transactions_source_owner on public.transactions;
create trigger transactions_source_owner before insert or update on public.transactions
  for each row execute function public.check_source_owner();

-- A split must belong to a transaction of the same user.
create or replace function public.check_split_parent() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.transactions t where t.id = new.transaction_id and t.user_id = new.user_id) then
    raise exception 'split must belong to your own transaction' using errcode = '23503';
  end if;
  return new;
end $$;
drop trigger if exists transaction_splits_parent on public.transaction_splits;
create trigger transaction_splits_parent before insert or update on public.transaction_splits
  for each row execute function public.check_split_parent();

-- Splits must add up to the transaction amount. Checked at commit time so the
-- app can replace all splits of a transaction in one request.
create or replace function public.check_split_total() returns trigger
language plpgsql security definer set search_path = public as $$
declare tid uuid; total numeric; amt numeric; n int;
begin
  tid := coalesce(new.transaction_id, old.transaction_id);
  select amount into amt from public.transactions where id = tid;
  if amt is null then return null; end if;  -- parent deleted
  select coalesce(sum(amount), 0), count(*) into total, n from public.transaction_splits where transaction_id = tid;
  if n > 0 and abs(total - amt) > 0.009 then
    raise exception 'splits add up to % but the transaction is %', total, amt using errcode = '23514';
  end if;
  return null;
end $$;
drop trigger if exists transaction_splits_total on public.transaction_splits;
create constraint trigger transaction_splits_total after insert or update or delete on public.transaction_splits
  deferrable initially deferred for each row execute function public.check_split_total();

notify pgrst, 'reload schema';
