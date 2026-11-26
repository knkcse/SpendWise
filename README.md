# SpendWise

AI-assisted personal expense tracker for India. React + TypeScript + Tailwind (shadcn-style)
in a Capacitor Android shell, with Supabase as the backend.

**Status: Phase 2.** Email sign-in with Supabase; data syncs to Postgres (RLS per user) with an
on-device cache, so changes made offline sync later. "Use without an account" keeps data on the
phone only and can be moved into an account after sign-in. AI summaries and automatic payment
detection are *not* implemented yet and the app says so where they would appear. See `docs/ARCHITECTURE.md` for the design and phase plan.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173, open in Chrome device mode or on your phone over LAN (npm run dev -- --host)
npm test           # unit tests for analytics, categorisation, dedupe, CSV
npm run build      # type check + production build into dist/
```

## Database

`supabase/migrations/` creates all tables, indexes, RLS policies, grants, the sign-up trigger
and default categories. Apply with `supabase db push`, or paste both files in order into the
Supabase SQL editor.

## Android

```bash
npm run build && npx cap sync android
cd android && ./gradlew assembleDebug   # needs Android SDK (sdk.dir in android/local.properties) and JDK 17+
```

## Secrets

Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` go in `.env` (see `.env.example`).
The service-role key and AI API key must only ever be Supabase Edge Function secrets.
