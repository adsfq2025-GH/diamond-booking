# Diamond Booking — Manual Test Script (Auth + Onboarding)

This is the checklist to run **the moment real Supabase keys land in
`.env.local`**. Everything below is fully wired; it was verified in this
phase via `npm run lint`, `npm run build`, pure-logic tests (slug
generation), and Playwright screenshots of the wizard in placeholder mock
mode (`qa/onboarding/`). Docker wasn't available on the build machine, so
`npx supabase start` could not be exercised — the flows below are the
live verification.

## 0. Prerequisites

1. Create the Supabase project and apply migrations **in order**
   (`0001_schema.sql` → `0002_rls.sql` → `0003_functions.sql` →
   `0004_onboarding.sql`) per `docs/BACKEND.md`.
2. Fill `.env.local`:
   - `NEXT_PUBLIC_APP_URL` (e.g. `http://localhost:3000`)
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
     `SUPABASE_SERVICE_ROLE_KEY`
3. Optional (staging only): run `supabase/seed.sql` for the demo tenant
   and role logins (password `password123`).
4. `npm run dev`.

> **Placeholder-mode note:** while the env still holds placeholders, the
> middleware skips auth, `/onboarding` + `/dashboard` render an in-memory
> mock tenant, and the auth forms show the "backend not configured" notice
> instead of submitting. All of that disappears automatically once
> `supabaseEnvConfigured()` (src/lib/env.ts) sees real keys.

### About migration 0004 (added this phase)

`0004_onboarding.sql` adds `employees.display_name` and updates the
`employee_directory` view to `coalesce(profiles.full_name, display_name)`.
**Why:** onboarding Step 3 collects a *name* for each invited teammate, but
the schema only stored names on `profiles` — which don't exist until an
invite is accepted (`employees.profile_id` is null until then). Without the
column, invited teammates would render as "(no name)" everywhere. Existing
migrations were not modified.

## 1. Signup → Onboarding → Dashboard (the golden path)

1. Go to `/signup`. Try a weak password ("abc") → inline error, no submit.
2. Sign up with a fresh email, business "Shine Time Cleaning", industry
   *Cleaning*. Expect: redirect to `/onboarding`, Step 1.
3. **Verify in Supabase Studio** (Table editor):
   - `tenants`: one row, slug `shine-time-cleaning`,
     `subscription_status = trialing`, `trial_ends_at` ≈ now + 7 days,
     `settings.onboarding_step = 1`.
   - `profiles`: role `business_owner`, correct `tenant_id`.
   - Auth → user's `app_metadata.role = business_owner`.
   - `business_hours`: 7 rows (Mon–Fri 08:00–18:00 open, Sat/Sun closed).
   - `widget_configs`: one row with a generated `public_key`.
4. Sign up **again with the same email** → friendly "already has an
   account" error. Sign up with the same *business name* under a new
   email → slug becomes `shine-time-cleaning-2`.
5. **Step 1 (Business info):** name is prefilled; timezone auto-detects
   your browser zone. Fill phone/address, Save & continue →
   `tenants.address`/`timezone` updated, `settings.onboarding_step = 2`.
6. **Step 2 (Services):** Cleaning templates offered (Standard / Deep /
   Move-out / Office). One-click add two, edit a price, add a custom
   service, remove one. Continue → rows in `services` with correct cents
   values and sort order.
7. **Step 3 (Team):** "I take bookings too" on + pick a color; add a
   teammate with name/email/title/color → "Invite queued" badge and the
   note that invites send when email is configured. Continue →
   `employees`: one row with your `profile_id`, one with `invite_email` +
   `display_name` and `profile_id = null`.
8. **Step 4 (Hours):** toggle Saturday open 9–2, set travel buffer 30 min.
   Continue → `business_hours` updated; `settings.default_buffer_minutes = 30`.
9. **Step 5 (Branding):** upload a logo (lands in Storage bucket
   `branding/{tenant_id}/logo-…`; verify the public URL renders), change
   colors, upload 2 photos. Continue → `tenants.branding` updated.
10. **Resume check:** reload `/onboarding` mid-wizard → it reopens on the
    step you left (from `settings.onboarding_step`). Use Back / the
    progress rail → previously saved steps rehydrate with saved values.
11. **Step 6 (Booking settings):** pick *Review & approve*, edit the
    cancellation policy, window 48h, deposits on, payments on (note says
    Stripe pending). **Finish & create my widget** →
    - the widget panel shows the embed snippet
      (`<script src=".../embed.js" data-key="...">`), Copy works, preview
      iframe points at `/book/{public_key}` (404 is expected until the
      widget phase),
    - `tenants.settings`: `onboarding_complete = true`, `auto_confirm = false`,
      policy + window + deposit/payment flags saved,
    - **bookability defaults**: `availability` rows created for each
      employee mirroring open business hours; `employee_services` links
      every employee to every service.
12. **Go to dashboard** → greeting with your first name, tenant name,
    "Onboarding complete" pill, trial-days-left pill, coming-soon grid.
    `/onboarding` afterwards reopens on the widget panel (snippet
    retrievable anytime).

## 2. Login per role (seed users, password `password123`)

| login | expected landing |
|---|---|
| `owner@cleansweep.demo` | `/dashboard` (seed tenant has no `onboarding_complete`, so first login lands on `/onboarding` — finish it once or set `settings.onboarding_complete = true`) |
| `maria@cleansweep.demo` | `/team` (404/stub until the team phase — middleware allows it) |
| `james@cleansweep.demo` | `/team` |
| `dana@customer.demo` | `/portal` (stub until the portal phase) |

Also verify:
- Wrong password → "don't match an account" banner, form stays filled.
- `/dashboard` while signed out → `/login?redirect=/dashboard`; after
  signing in you land back on `/dashboard`.
- Signed in as customer, visit `/dashboard` → bounced to `/portal`.
- "Keep me signed in" **unchecked** → auth cookies are session cookies
  (close and reopen the browser → signed out). Checked → still signed in.
- Sign out (dashboard header) → back to `/login`, protected routes locked.

## 3. Password reset

1. `/forgot-password` → submit the owner email → "Check your inbox" state.
   (Requires SMTP configured in Supabase Auth settings, or use the local
   Inbucket at `http://localhost:54324` with `supabase start`.)
2. Submit a *nonexistent* email → identical success state (no account
   enumeration).
3. Open the email link → `/auth/confirm` verifies and forwards to
   `/reset-password`.
4. Weak password → inline error; mismatched confirm → inline error.
5. Valid new password → signed in and redirected to your role home; old
   password no longer works; new one does.
6. Reuse the same email link → `/login?link=expired`.

## 4. RLS spot-checks (from the SQL editor, as in BACKEND.md)

- As the owner's JWT: `select * from tenants` returns only their tenant.
- As an employee: `select * from employees` returns only their own row;
  `select * from employee_directory` shows coworkers (names now
  coalesce with `display_name` per 0004) with no payroll columns.
- Anon key with no session: every table read fails; the three widget RPCs
  work with a valid `public_key`.

## 5. Known deferred items (later phases)

- Invite emails (Step 3 queues them; sending = integrations phase).
- `/book/{public_key}` booking page + `embed.js` (widget phase) — the
  onboarding preview iframe intentionally 404s until then.
- Stripe payment capture (payments phase) — the Step 6 toggle only stores
  the preference.
- `/team`, `/portal`, `/admin` areas are middleware-protected but unbuilt.
