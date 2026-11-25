-- SpendWise initial schema
-- Every user-owned table carries user_id -> auth.users and is protected by RLS
-- so a user can only ever read or write their own rows.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- enums
-- ---------------------------------------------------------------------------
create type public.txn_type       as enum ('debit', 'credit');
create type public.payment_method as enum ('upi', 'credit_card', 'debit_card', 'net_banking', 'cash', 'wallet', 'other');
create type public.txn_origin     as enum ('manual', 'android_notification', 'csv_import');
create type public.txn_status     as enum ('confirmed', 'needs_review');
create type public.txn_scope      as enum ('personal', 'business');
create type public.recurring_freq as enum ('weekly', 'monthly', 'quarterly', 'yearly');
create type public.recurring_state as enum ('suggested', 'confirmed', 'rejected');
create type public.insight_period as enum ('daily', 'weekly', 'monthly');

-- ---------------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  avatar_url  text,
  currency    char(3) not null default 'INR',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- categories: system defaults (user_id null) + user custom ones
-- parent_id set => subcategory
-- ---------------------------------------------------------------------------
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  parent_id   uuid references public.categories(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  icon        text,
  color       text,
  is_income   boolean not null default false,
  is_archived boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index categories_unique_name
  on public.categories (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
                        coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
                        lower(name));
create index categories_user_idx on public.categories (user_id);

-- ---------------------------------------------------------------------------
-- payment_sources: per-user enable/disable of each detection source
-- ---------------------------------------------------------------------------
create table public.payment_sources (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  code          text not null,          -- 'gpay' | 'phonepe' | 'paytm' | 'cred' | 'bank:<pkg>' | 'cash' | 'card'
  display_name  text not null,
  android_package text,                 -- e.g. com.google.android.apps.nbu.paisa.user
  detection_enabled boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, code)
);

-- ---------------------------------------------------------------------------
-- transactions
-- dedupe_key is computed server-side (edge function / trigger) and unique per
-- user, which makes ingestion idempotent.
-- ---------------------------------------------------------------------------
create table public.transactions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  type                   public.txn_type not null default 'debit',
  amount                 numeric(14,2) not null check (amount > 0 and amount < 100000000),
  currency               char(3) not null default 'INR',
  merchant_name          text not null check (char_length(merchant_name) between 1 and 120),
  merchant_raw           text,               -- original parsed text, before user rename
  occurred_at            timestamptz not null,
  payment_method         public.payment_method not null default 'upi',
  payment_source_id      uuid references public.payment_sources(id) on delete set null,
  category_id            uuid references public.categories(id) on delete set null,
  subcategory_id         uuid references public.categories(id) on delete set null,
  description            text check (char_length(description) <= 500),
  notes                  text check (char_length(notes) <= 2000),
  transaction_reference  text check (char_length(transaction_reference) <= 64),
  source_notification_id text check (char_length(source_notification_id) <= 128),
  origin                 public.txn_origin not null default 'manual',
  status                 public.txn_status not null default 'confirmed',
  scope                  public.txn_scope not null default 'personal',
  exclude_from_reports   boolean not null default false,
  is_split               boolean not null default false,
  dedupe_key             text not null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index transactions_user_date_idx     on public.transactions (user_id, occurred_at desc);
create index transactions_user_category_idx on public.transactions (user_id, category_id);
create index transactions_user_source_idx   on public.transactions (user_id, payment_source_id);
create index transactions_user_merchant_idx on public.transactions (user_id, lower(merchant_name));
create unique index transactions_notification_uidx
  on public.transactions (user_id, source_notification_id) where source_notification_id is not null;

-- Split a transaction across categories. Sum of parts must equal parent amount
-- (enforced in the app / edge function; see check_split_total trigger).
create table public.transaction_splits (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  transaction_id  uuid not null references public.transactions(id) on delete cascade,
  category_id     uuid references public.categories(id) on delete set null,
  amount          numeric(14,2) not null check (amount > 0),
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index transaction_splits_txn_idx on public.transaction_splits (transaction_id);

-- Learned merchant -> category mapping from user corrections
create table public.merchant_category_rules (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  merchant_key  text not null,           -- normalised lower-case merchant
  category_id   uuid not null references public.categories(id) on delete cascade,
  hits          integer not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, merchant_key)
);

-- ---------------------------------------------------------------------------
-- budgets: category_id null => overall monthly budget
-- ---------------------------------------------------------------------------
create table public.budgets (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  category_id   uuid references public.categories(id) on delete cascade,
  month         date not null check (extract(day from month) = 1),  -- first day of month
  amount        numeric(14,2) not null check (amount > 0),
  alert_thresholds smallint[] not null default '{50,75,90,100}',
  alerts_sent   smallint[] not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index budgets_unique
  on public.budgets (user_id, month, coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ---------------------------------------------------------------------------
-- recurring_transactions: suggested by detector, user confirms / rejects
-- ---------------------------------------------------------------------------
create table public.recurring_transactions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  merchant_key      text not null,
  merchant_name     text not null,
  expected_amount   numeric(14,2) not null check (expected_amount > 0),
  frequency         public.recurring_freq not null,
  category_id       uuid references public.categories(id) on delete set null,
  last_paid_at      timestamptz,
  next_expected_at  timestamptz,
  occurrences       integer not null default 0,
  state             public.recurring_state not null default 'suggested',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, merchant_key, frequency)
);

-- ---------------------------------------------------------------------------
-- ai_insights: generated server-side only; facts and estimates kept apart
-- ---------------------------------------------------------------------------
create table public.ai_insights (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  period        public.insight_period not null,
  period_start  date not null,
  period_end    date not null,
  facts         jsonb not null default '[]',   -- numbers computed from SQL, never by the model
  narrative     text,                          -- model text, grounded on facts
  recommendations jsonb not null default '[]', -- [{title, detail, estimated_saving}]
  model         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, period, period_start)
);

-- ---------------------------------------------------------------------------
-- user_preferences (1:1)
-- ---------------------------------------------------------------------------
create table public.user_preferences (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  theme               text not null default 'system' check (theme in ('light','dark','system')),
  detection_enabled   boolean not null default false,
  budget_alerts       boolean not null default true,
  default_thresholds  smallint[] not null default '{50,75,90,100}',
  week_starts_on      smallint not null default 1 check (week_starts_on between 0 and 6),
  ai_insights_enabled boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles','categories','payment_sources','transactions',
    'transaction_splits','merchant_category_rules','budgets','recurring_transactions',
    'ai_insights','user_preferences']
  loop
    execute format('create trigger %I_updated_at before update on public.%I
                    for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles               enable row level security;
alter table public.categories             enable row level security;
alter table public.payment_sources        enable row level security;
alter table public.transactions           enable row level security;
alter table public.transaction_splits     enable row level security;
alter table public.merchant_category_rules enable row level security;
alter table public.budgets                enable row level security;
alter table public.recurring_transactions enable row level security;
alter table public.ai_insights            enable row level security;
alter table public.user_preferences       enable row level security;

create policy "own profile" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

-- default categories are readable by everyone signed in; custom ones only by owner
create policy "read categories" on public.categories
  for select using (user_id is null or user_id = auth.uid());
create policy "write own categories" on public.categories
  for insert with check (user_id = auth.uid());
create policy "update own categories" on public.categories
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own categories" on public.categories
  for delete using (user_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['payment_sources','transactions','transaction_splits',
    'merchant_category_rules','budgets','recurring_transactions','user_preferences']
  loop
    execute format('create policy "own rows" on public.%I for all
                    using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- AI insights are written only by the edge function (service role); users read their own.
create policy "read own insights" on public.ai_insights
  for select using (user_id = auth.uid());
create policy "delete own insights" on public.ai_insights
  for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- New user bootstrap: profile, preferences, payment sources
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name) values (new.id, new.raw_user_meta_data->>'full_name');
  insert into public.user_preferences (user_id) values (new.id);
  insert into public.payment_sources (user_id, code, display_name, android_package) values
    (new.id, 'gpay',    'Google Pay', 'com.google.android.apps.nbu.paisa.user'),
    (new.id, 'phonepe', 'PhonePe',    'com.phonepe.app'),
    (new.id, 'paytm',   'Paytm',      'net.one97.paytm'),
    (new.id, 'cred',    'CRED',       'com.dreamplug.androidapp'),
    (new.id, 'bank',    'Bank apps / SMS', null),
    (new.id, 'card',    'Credit / Debit card', null),
    (new.id, 'cash',    'Cash', null);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Default categories (system rows, user_id null)
-- ---------------------------------------------------------------------------
insert into public.categories (name, icon, color) values
  ('Food & Dining','utensils','#f97316'), ('Groceries','shopping-basket','#84cc16'),
  ('Shopping','shopping-bag','#ec4899'), ('Transportation','car','#0ea5e9'),
  ('Fuel','fuel','#eab308'), ('Rent','home','#8b5cf6'),
  ('Electricity & Utilities','zap','#f59e0b'), ('Mobile & Internet','smartphone','#06b6d4'),
  ('Entertainment','clapperboard','#ef4444'), ('Healthcare','heart-pulse','#10b981'),
  ('Travel','plane','#3b82f6'), ('Education','graduation-cap','#6366f1'),
  ('EMI & Loans','landmark','#a855f7'), ('Investments','trending-up','#22c55e'),
  ('Personal Care','sparkles','#d946ef'), ('Insurance','shield','#14b8a6'),
  ('Other','circle-ellipsis','#64748b');
insert into public.categories (name, icon, color, is_income) values
  ('Salary','wallet','#16a34a', true), ('Other Income','plus-circle','#15803d', true);

-- ---------------------------------------------------------------------------
-- Account deletion (called from the app; cascades everything)
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
