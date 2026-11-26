# SpendWise architecture

## 1. Requirements summary

SpendWise is an Android-first expense tracker for Indian users. Its core value is
**automatic capture of UPI / card payments from payment-app notifications**, backed
by solid manual entry, CSV import, analytics, budgets and grounded AI insights.

Hard constraints taken from the brief:

| Constraint | How it is met |
|---|---|
| No public payment-app APIs | Android `NotificationListenerService` in Kotlin; parsing is on-device |
| Never capture OTPs / passwords | Package allow-list + keyword deny-list run *before* any parsing; raw text never stored or uploaded |
| User id never trusted from client | Edge function derives it from the Supabase JWT |
| No service-role key / AI key in the app | Only the anon key ships; AI + privileged writes run in Edge Functions |
| No fabricated statistics | All numbers come from `src/lib/analytics.ts` over real rows; the AI only phrases pre-computed facts |
| Detection claimed only after device testing | UI shows "Not available" until the native plugin is present; Phase 7 ends with a real-device test log |
| iOS | No notification access exists; manual entry + CSV import only, stated in-app |

## 2. System overview

```
┌──────────────────────── Android phone ────────────────────────┐
│  Capacitor WebView: React + TS + Tailwind (shadcn-style UI)    │
│    screens/ ─► data/store.tsx ─► Repository                    │
│                     │              ├─ LocalRepository (Ph 1)   │
│                     │              └─ SupabaseRepository (Ph 2)│
│                     ▼                                          │
│  Capacitor plugin "PaymentDetection" (Kotlin, Phase 7)         │
│    NotificationListenerService                                 │
│      → allow-list by package → drop OTP/promo/failed           │
│      → regex parsers per app (amount, payee, ref, time)        │
│      → Room queue (offline)                                    │
│    WorkManager SyncWorker (Phase 8, network-constrained)       │
└───────────────┬────────────────────────────────────────────────┘
                │ HTTPS, user JWT (stored in Android Keystore-backed prefs)
┌───────────────▼──────────── Supabase ──────────────────────────┐
│ Auth (email/password; Google later)                            │
│ Postgres + RLS (supabase/migrations)                           │
│ Edge Functions:                                                │
│   ingest-android-transaction  validate → dedupe → categorise   │
│   generate-insights           SQL facts → AI model → ai_insights│
│   detect-recurring (cron)     suggestions only                 │
└────────────────────────────────────────────────────────────────┘
```

## 3. Frontend structure

```
src/
  lib/          pure, unit-tested logic (no React)
    types.ts        domain types mirroring the DB
    analytics.ts    totals, splits, trends, budgets, projections, recurring detection, facts
    categorize.ts   Indian-merchant keyword rules + learned user corrections
    dedupe.ts       fingerprint shared with the edge function
    csv.ts          export (formula-injection safe) / import (dd/mm/yyyy aware)
    format.ts       ₹ with lakh grouping
  data/
    repository.ts   storage interface
    localRepository.ts  on-device storage (Phase 1)
    store.tsx       React context: state + actions (add/edit/split/learn/import/budgets/recurring)
  components/   UI kit (shadcn-style on Radix), charts (Recharts), layout
  screens/      one file per screen
```

The `Repository` interface is the seam for Phase 2: the store does not care whether
data lives on the phone or in Supabase. Phase 8 combines both (local queue + sync).

## 4. Database

See `supabase/migrations/20261125000000_init.sql`. Tables:

- `profiles`, `user_preferences`: 1:1 with `auth.users`, created by trigger on sign-up
- `categories`: system defaults (`user_id` null, read-only) + user categories / subcategories (`parent_id`)
- `payment_sources`: per-user enable/disable for GPay, PhonePe, Paytm, CRED, banks, card, cash
- `transactions`: amount `numeric(14,2)`, `origin`, `status` (`needs_review`), `scope`, `exclude_from_reports`, unique `(user_id, dedupe_key)` + unique `(user_id, source_notification_id)`
- `transaction_splits`: one transaction across several categories
- `merchant_category_rules`: remembered corrections
- `budgets`: overall (`category_id` null) or per category, per month, custom thresholds
- `recurring_transactions`: `suggested` / `confirmed` / `rejected`
- `ai_insights`: `facts` (computed by SQL) kept apart from `narrative` / `recommendations` (model)

Every table has UUID PKs, FKs with cascade, `created_at` / `updated_at` (trigger),
indexes on the access paths, and RLS `user_id = auth.uid()`. `ai_insights` is
read-only to users (written by the edge function with the service role).
`delete_my_account()` removes the auth user and cascades everything.

### Duplicate prevention
`dedupe_key` = `ref:<UPI/UTR reference>` when present, else
`fp:<type>:<amount>:<normalised merchant>:<10-minute bucket>`. The same function
runs on the phone (before queueing), in CSV import preview, and in the edge function
(authoritative, enforced by the unique index → idempotent `insert … on conflict do nothing`).

## 5. `ingest-android-transaction` (Phase 7/8)

1. Require `Authorization: Bearer <user JWT>`; `supabase.auth.getUser()` → `user_id`.
2. Validate body with a schema: amount 0–1e8, merchant ≤120 chars, ISO date not in the future (+5 min skew), `payment_source` in the user's enabled sources, `transaction_type` debit/credit.
3. Compute `dedupe_key`; return the existing row with `duplicate: true` if found.
4. Category: learned rule → keyword rules → `needs_review`.
5. Insert with `origin = 'android_notification'`; return `{ id, duplicate, category_id, status }`.

## 6. Phase plan

| Phase | Scope | Needs from Rakesh |
|---|---|---|
| 1 ✅ | All screens, navigation, on-device data, analytics, CSV/Excel, budgets, recurring, categories | — |
| 2 ✅ | Supabase auth + `SupabaseRepository`, apply migration, migrate local data on first sign-in | Supabase project URL + anon key (and DB access to run the migration) |
| 3 | Expense management on Supabase (splits, rules, import) | — |
| 4 | Analytics via SQL views for large histories | — |
| 5 | `generate-insights` edge function | AI API key, stored as a Supabase secret |
| 6 | Budget alerts as local notifications; recurring detection cron | — |
| 7 | Kotlin `NotificationListenerService` + Capacitor plugin + parsers per app | Real notification samples (redacted) and a real phone for testing |
| 8 | Room queue, WorkManager sync, ingest function | — |
| 9 | Test pass: unit, E2E, on-device | Real-device testing |
| 10 | Signed release APK | Choose keystore handling |
