# Diamond Booking — Backend Setup

Everything the backend needs lives in `supabase/` (schema, RLS, RPCs, seed) and
`src/lib/` + `src/types/` (clients, auth helpers, plan gates, DB types).

## 1. Create the Supabase project

1. Go to <https://supabase.com/dashboard> → **New project**.
2. Pick an org, name it (e.g. `diamond-booking-staging`), choose a region close
   to your users, and set a strong database password (store it — the CLI needs it).
3. When provisioning finishes, open **Project Settings → API** and copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (server-only, bypasses RLS)

Recommended: two projects (staging + production), same migrations applied to both.

## 2. Run the migrations

The migrations are ordered and must be applied in this order:

| file | contents |
|---|---|
| `supabase/migrations/0001_schema.sql` | extensions, enums, all tables, indexes, no-double-booking exclusion constraint, RLS helper functions, `employee_directory` view |
| `supabase/migrations/0002_rls.sql` | RLS enabled + full policy rollout for every table, `branding`/`invoices` storage buckets + policies |
| `supabase/migrations/0003_functions.sql` | `updated_at` triggers, invoice numbering (INV-YYYY-NNNN), audit-log triggers, widget RPCs (`get_widget_config`, `get_available_slots`, `create_widget_booking`) |

### Option A — Supabase CLI (recommended)

```bash
cd platform
npx supabase login                      # once; opens browser for an access token
npx supabase link --project-ref <ref>   # <ref> = the id in your project URL
npx supabase db push                    # applies supabase/migrations/* in order
```

`db push` records applied migrations, so re-running it later only applies new files.

> **Storage policies caveat (hosted):** `0002_rls.sql` creates the `branding`
> and `invoices` buckets and their `storage.objects` policies in SQL. On some
> newer hosted projects Supabase restricts ownership of `storage.objects` and
> the policy statements can fail with `must be owner of table objects`. If
> that happens, re-run the file without the storage section and create the
> same policies via **Dashboard → Storage → Policies** (definitions are at the
> bottom of `0002_rls.sql`). Local dev (`supabase start`) is unaffected.

### Option B — SQL editor (no CLI)

Dashboard → **SQL Editor** → paste and run each file **in order**:
`0001_schema.sql`, then `0002_rls.sql`, then `0003_functions.sql`.

## 3. Seed demo data (optional, staging/local only)

`supabase/seed.sql` creates the demo tenant **Clean Sweep Services** with an
owner, 2 employees, 3 customers, 4 services + addons, hours/availability,
~15 bookings, invoices/payments, coupons, plan limits, feature flags, and a
widget config with the known public key `demo000000000000000000ff`.

- **Local** (`supabase start`): applied automatically by `supabase db reset`
  (wired via `[db.seed]` in `supabase/config.toml`).
- **Hosted staging**: paste `seed.sql` into the SQL editor. It inserts rows
  into `auth.users` directly (demo logins, password `password123`), which is
  fine for a staging project but should **not** be run in production.

Demo logins:

| email | role |
|---|---|
| `owner@cleansweep.demo` | business_owner |
| `maria@cleansweep.demo` | employee |
| `james@cleansweep.demo` | employee |
| `dana@customer.demo` | customer |

## 4. Environment variables

Copy `.env.example` → `.env.local`. Where each value comes from:

| var | source |
|---|---|
| `NEXT_PUBLIC_APP_URL` | your app origin (`http://localhost:3000` in dev) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API (or the `supabase start` output locally) |
| `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe Dashboard → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | Dashboard → Developers → Webhooks (or `stripe listen` locally) |
| `STRIPE_PRICE_STARTER/PROFESSIONAL/ELITE` | create three monthly recurring Prices ($29/$59/$119) in Product catalog; copy the `price_...` ids |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | resend.com → API Keys; sender must be on a verified domain |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | Twilio Console → Account Info + a purchased number |

## 5. Local development (later)

Requires Docker Desktop:

```bash
cd platform
npx supabase start        # boots Postgres, Auth, Storage, Studio locally
npx supabase db reset     # applies all migrations + seed.sql from scratch
npx supabase status       # prints local URL + anon/service keys for .env.local
npx supabase stop         # shut it down
```

Local Studio: <http://localhost:54323>. Local API: `http://127.0.0.1:54321`.

## 6. Architecture notes (read before building on top)

- **Tenant isolation is RLS-first.** Every tenant table has policies:
  super_admin sees all; business_owner is scoped to their tenant; employees
  get narrowed reads (own employee row only on the base table — coworker
  names come from the `employee_directory` view; assigned bookings only;
  no invoices/payments); customers see only rows tied to their own customer
  record. The anon widget touches **nothing** directly.
- **Widget flow** = three SECURITY DEFINER RPCs keyed by `widget_configs.public_key`:
  `get_widget_config`, `get_available_slots`, `create_widget_booking`.
  Double bookings are impossible: the RPC re-checks the slot and the
  `no_double_booking` exclusion constraint is the final, race-proof guard
  (concurrent losers get a `slot_taken` error).
- **Invoice numbers** are assigned by a trigger (`INV-YYYY-NNNN`, per tenant,
  per year) — insert invoices *without* a `number` and let the DB fill it.
- **Audit log**: inserts/updates/deletes on `bookings`, `invoices`, `tenants`
  are recorded in `audit_logs` automatically (updates store only changed columns).
- **Profiles are created by the service role** (no self-serve insert policy —
  otherwise users could pick their own role/tenant). Onboarding and invite
  flows must use `createAdminClient()` from `src/lib/supabase/server.ts`.
- Storage: `branding` bucket is public-read, writes scoped to
  `{tenant_id}/...` by the owner; `invoices` bucket is private with paths
  `{tenant_id}/{customer_id}/...`.
