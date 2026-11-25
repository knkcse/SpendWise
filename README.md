# SpendWise

AI-assisted personal expense tracker for India. React + TypeScript + Tailwind (shadcn-style)
in a Capacitor Android shell, with Supabase as the backend.

**Status: Phase 1.** Every screen works against on-device storage. Sign-in, cloud sync, AI
summaries and automatic payment detection are *not* implemented yet and the app says so
where they would appear. See `docs/ARCHITECTURE.md` for the design and phase plan.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173, open in Chrome device mode or on your phone over LAN (npm run dev -- --host)
npm test           # unit tests for analytics, categorisation, dedupe, CSV
npm run build      # type check + production build into dist/
```

## Database

`supabase/migrations/20261125000000_init.sql` creates all tables, indexes, RLS policies,
the sign-up trigger and default categories. Apply with `supabase db push` once a project
is linked (Phase 2).

## Secrets

Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` go in `.env` (see `.env.example`).
The service-role key and AI API key must only ever be Supabase Edge Function secrets.
