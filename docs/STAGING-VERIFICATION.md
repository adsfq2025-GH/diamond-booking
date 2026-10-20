# Staging verification — applying 0007–0010 and proving they work

> **Status, 19 October 2026: migrations 0007–0010 were applied directly to
> PRODUCTION, skipping staging.** `00_migration_state.sql` confirms 0001–0010
> all `APPLIED`. That makes steps 1–3 below historical for this deployment.
>
> What still matters, in this order:
> 1. **Run `supabase/tests/04_production_integrity.sql`** (read-only). 0007 is
>    the one migration that moved existing data and deleted the original — it
>    copied `tenants.settings->'email'` into `tenant_secrets` and stripped the
>    key — so confirm the move landed before anything else.
> 2. **Set the production env vars in Vercel FIRST, then deploy.** This order
>    is not cosmetic. `src/middleware.ts` matches every non-static path and its
>    first branch is `misconfiguredForProduction()`, which returns a plain-text
>    **503 for the whole site** when `NEXT_PUBLIC_SUPABASE_URL` or
>    `NEXT_PUBLIC_SUPABASE_ANON_KEY` is absent in production (A36, failing
>    closed on purpose). Deploying before the vars are set takes the entire
>    site down rather than half-working. Note the build itself succeeds with no
>    env at all — verified by building with `.env.local` removed — so a green
>    build is no evidence the vars are set.
>
>    `NEXT_PUBLIC_APP_URL` must be the production URL; copying the local value
>    (`http://localhost:3000`) silently breaks embed snippets and OAuth
>    redirects. Set `CRON_SECRET` or both cron routes in `vercel.json` are
>    unauthenticated. Never set `ALLOW_PLACEHOLDER_MODE`.
>
>    Deploying matters because the SQL is live and the code is not, which is a
>    worse state than either alone: the old build reads tenant SMTP from the
>    location 0007 just emptied, and *writes credentials back there* if an owner
>    re-saves email settings. Section 5 of `04_production_integrity.sql`
>    measures that exposure.
> 3. **Rotate** the SMTP passwords and Google tokens (step 5) — they were
>    readable by lower-privileged roles before 0007.
> 4. **Run `01`, `02` and `03`** against production. They roll back, so they are
>    safe, and they are the only proof the fixes actually hold where it counts.
>    `01` passed 13/13 and `02` passed 14/14 on 19 October. `03` surfaced a real
>    runtime bug in `onboarding_readiness()` — see step 5.
> 5. **Apply `0012_fix_readiness_blockers.sql`, then re-run `03`.** 0009 built
>    the readiness blockers list with `v_blockers || 'literal'`, which Postgres
>    resolves to `anyarray || anyarray` and fails on at runtime. Any tenant
>    missing services, staff, open days, service links or working hours would
>    have had the readiness check throw instead of listing what was missing.
>    This is live on production right now.
> 6. Apply **`0011_billing_cycle.sql`** when you deploy annual billing.
>
> **Vercel Hobby rejects sub-daily crons, and it rejects the whole
> deployment.** `vercel.json` asked for `*/15 * * * *` on
> `/api/cron/send-reminders`, and every deploy failed with "Hobby accounts are
> limited to daily cron jobs" before building anything — no env var or code
> change could get past it. The reminder schedule now lives in
> `.github/workflows/send-reminders.yml` (free, every 15 minutes, calls the
> route with `Authorization: Bearer $CRON_SECRET`). It needs two repository
> secrets, `CRON_SECRET` and `APP_URL`. `extend-recurring` stays in
> `vercel.json` because daily is all it needs.
>
> Keep the rest of this document for the next environment you set up.

This is the runbook for taking the audit fixes from "committed" to "verified."
Do it in order. **Nothing here touches production until step 8** — which is why
the banner above exists: on this deployment that order was not followed, so the
checks that would have run on staging have to run on live data instead.

Why it matters: the four migrations added by the audit fixes have never been
executed. No Postgres or Docker was available on the machine that wrote them, so
they were verified by parsing only — the SQL grammar and all 19 PL/pgSQL bodies
compile, and every column and function reference agrees with the schema, but no
statement has actually run. A migration either applies cleanly or it does not,
and you find out by running it.

Budget about 90 minutes, most of it waiting on steps 2 and 6.

---

## 0. Before you start

You need:

- A **staging** Supabase project, separate from production. Free tier is fine.
- A recent **production backup** to restore into it, so the migrations run
  against real-shaped data rather than an empty schema. This is the whole point
  of the exercise: `0007` migrates existing SMTP credentials out of
  `tenants.settings`, `0009` has to cope with services that already have
  bookings, and an empty database proves none of that.
- A **Stripe test-mode** account (test keys, not live).
- Your production env values to hand, so staging can mirror them with test
  substitutes.

> If you have no production data yet, say so and skip the restore — run against
> an empty staging schema and treat step 6's data-integrity checks as weaker
> evidence than they would otherwise be. Everything else holds.

---

## 1. Create staging and restore the backup

1. Supabase → **New project**, name it `diamond-booking-staging`, same region as
   production. Save the database password.
2. Restore your production backup into it. Either:
   - Supabase dashboard → **Database → Backups** on production, download, then
     restore into staging; or
   - `pg_dump` / `pg_restore` using the connection strings from
     **Project Settings → Database**.
3. Confirm the restore, and — more important — **find out which migrations are
   actually applied**. Run `supabase/tests/00_migration_state.sql` in the
   staging SQL editor. It is read-only and prints one row per migration with
   `APPLIED` / `PARTIAL` / `NOT APPLIED` and exactly which objects are missing.

   **Do not trust `supabase_migrations.schema_migrations` for this.** That table
   is only written by `supabase db push`. If the migrations were applied by
   pasting them into the SQL editor — which is what this repo's own docs used
   to tell you to do — it is empty or stale and will report nothing applied
   when most of it is. `00_migration_state.sql` probes for the objects instead,
   which is the ground truth.

   **Start at the lowest migration that is not `APPLIED`, not at 0007.**
   Applying a migration over a gap fails exactly the way you would expect:
   0007 touches `google_calendar_connections`, which 0006 creates, so on a
   database that stopped at 0005 it dies with
   `relation "public.google_calendar_connections" does not exist`.

   Known dependencies across the gap:

   | Migration | Needs | Because |
   |---|---|---|
   | `0007` | `0006` | re-writes the `google_calendar_connections` policies |
   | `0009` | `0006` | `onboarding_readiness()` reads `tenants.stripe_charges_enabled` |
   | the app | `0005` | recurring bookings read `bookings.recurrence_group_id` |
   | the app | `0006` | the booking flow selects `tenants.stripe_charges_enabled`, and reminders need `booking_reminders` |

   `0008` and `0010` have no dependency on `0005`/`0006`, but apply everything
   in order anyway — there is no reason not to.

> **Double-check you are in staging.** Every destructive step below is harmless
> on staging and expensive on production. The project name is in the top-left of
> the dashboard; confirm it before each paste.

---

## 2. Apply the migrations, one at a time

In the staging **SQL editor**, paste and run each file **separately, in order**,
and read the result before moving on:

| Order | File | What it does |
|---|---|---|
| 1 | `supabase/migrations/0007_security.sql` | Identity guard, `tenant_secrets`, token policy, payments unique index |
| 2 | `supabase/migrations/0008_booking_correctness.sql` | Shared duration/buffer helpers, add-on-aware availability |
| 3 | `supabase/migrations/0009_onboarding_upsert.sql` | Transactional onboarding upserts, readiness, pricing columns |
| 4 | `supabase/migrations/0010_completeness.sql` | Contact, inquiries, invitations, coupon pricing, settings merge |

Each is idempotent, so a re-run after a fix is safe.

**What to watch for in 0007 specifically.** It moves credentials and then strips
them. Before running it, record what is there:

```sql
select id, slug, settings ? 'email' as has_email_creds from public.tenants;
```

After running it, that query must show `has_email_creds = false` for every row,
and the credentials must be in the new table:

```sql
select tenant_id, email ? 'smtp' as has_smtp from public.tenant_secrets;
```

Every tenant that previously had `settings->'email'` must now have a
`tenant_secrets` row. **If a tenant lost its credentials rather than moving
them, stop and tell me** — that is a data-loss bug in the migration and the one
genuinely irreversible thing in this set.

If a migration fails partway, it fails inside its own transaction and rolls
back; fix the cause and re-run the whole file rather than the remaining part.

---

## 3. Point a staging app at it

In Vercel, create a **Preview** environment (or a second project) with the
staging values:

```
NEXT_PUBLIC_SUPABASE_URL=<staging project url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<staging anon key>
SUPABASE_SERVICE_ROLE_KEY=<staging service role key>
NEXT_PUBLIC_APP_URL=https://<your-staging-url>

CRON_SECRET=<new long random string>
SUPER_ADMIN_SETUP_TOKEN=<new long random string>

STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...            # from the staging webhook endpoint
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_PRICE_STARTER=price_...             # NOTE THE NAMES
STRIPE_PRICE_PROFESSIONAL=price_...
STRIPE_PRICE_ELITE=price_...
```

**The three `STRIPE_PRICE_*` names are the thing to get right** (finding A06).
Your `.env.local` currently has `STRIPE_PRICE_STARTER_MONTHLY`,
`STRIPE_PRICE_PRO_MONTHLY` and `STRIPE_PRICE_ENTERPRISE_MONTHLY`; the code reads
`STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PROFESSIONAL` and `STRIPE_PRICE_ELITE`.
Not one matches, which is why every upgrade throws. Decide which of your
monthly/yearly price ids is the monthly price per tier and use these exact
names. (If you want annual billing as a separate option, that is a product
change, not a rename — ask and I will build it.)

Deploy, then open **`/admin` → System health**. That tab now lists every
configuration problem it can detect. Work until there are no **blockers**;
warnings are acceptable for staging.

---

## 4. Run the automated verification tests

Three SQL files under `supabase/tests/` prove the fixed defects are actually
fixed **on this database**. Each one builds its own throwaway fixture, asserts,
and ends with `ROLLBACK`, so it persists nothing and can be re-run freely.

Run each in the staging SQL editor and **read the NOTICE output**:

| File | Proves |
|---|---|
| `00_migration_state.sql` | which migrations are really applied (read-only; run it first, and again after step 2) |
| `01_security.sql` | A01 no self-promotion or tenant hop · A02 credentials unreachable · A04 tokens own-row only · cross-tenant isolation |
| `02_booking.sql` | A09 add-on duration honoured · **A10 the 11:30 buffer case** · A11 capacity survives display collapse · A28 distinguishable errors |
| `03_data_and_money.sql` | A13 re-running onboarding destroys nothing · A21 readiness · A07 payment idempotency · A16 coupon pricing and redemption limits |

**How to read a run.** Success is a wall of `PASS …` notices and nothing else.
The first failure raises an exception and stops that file, naming the check. In
the Supabase SQL editor, notices appear under the results pane — if you see no
notices at all, the editor is suppressing them; run the file through `psql`
instead:

```bash
psql "$STAGING_DATABASE_URL" -f supabase/tests/01_security.sql
```

Two checks exist specifically to stop a test passing for the wrong reason, and
both should pass before you trust anything else in that file:

- `01_security.sql` **check 0** proves the impersonation is live. The SQL editor
  runs as `postgres`, which bypasses RLS entirely, so without impersonation
  every policy check would pass vacuously.
- `03_data_and_money.sql` **PASS setup** proves `auth_tenant()` resolves, since
  the onboarding functions take their tenant from it.

The single most important line in the whole set is **`PASS A10.2`**: it is the
11:30-after-a-30-minute-buffer case your live audit observed, and the one most
likely to come back.

---

## 5. Rotate the credentials that were exposed

Do this now, not at launch. Two classes of secret were readable by
lower-privileged roles before `0007`, so treat both as compromised:

1. **Tenant SMTP passwords** (A02) — readable by every employee *and* customer
   of that tenant. For each tenant with mail configured, have the owner issue a
   new app password and re-enter it in **Settings → Integrations → Email**.
2. **Google Calendar tokens** (A04) — readable by every employee of the tenant.
   Revoke the app's access at <https://myaccount.google.com/permissions> for each
   connected account and reconnect.

Also rotate anything that was in a shared `.env` that people have seen, and set
a *new* `CRON_SECRET` for production rather than reusing staging's.

---

## 6. Exercise the flows a database test cannot reach

The SQL tests cover logic. These cover the HTTP and third-party surfaces.
Do them against your staging URL.

**Endpoint protection** (A05, A08) — from a shell:

```bash
S=https://your-staging-url

curl -is "$S/api/cron/send-reminders"               | head -1   # expect 401
curl -is "$S/api/cron/extend-recurring"             | head -1   # expect 401
curl -is -X POST "$S/api/admin/setup"               | head -1   # expect 404
curl -is -X POST "$S/api/admin/setup" -H "x-setup-token: wrong" | head -1  # expect 404

curl -is -H "Authorization: Bearer $CRON_SECRET" "$S/api/cron/send-reminders" | head -1   # expect 200
curl -is -X POST "$S/api/admin/setup" -H "x-setup-token: $SUPER_ADMIN_SETUP_TOKEN" | head -1  # expect 200
```

Then **remove `SUPER_ADMIN_SETUP_TOKEN`** and confirm the route returns 404
again.

**Security headers** (A27):

```bash
curl -is "$S/dashboard" | grep -iE 'content-security-policy|x-frame-options|strict-transport'
curl -is "$S/book/SOMEKEY" | grep -i 'frame-ancestors'
```

`/dashboard` must have `X-Frame-Options: DENY` and `frame-ancestors 'none'`;
`/book/*` must have `frame-ancestors *` so the widget still embeds. Then
actually embed it: put the snippet from **Dashboard → Widget** on a scratch HTML
page and confirm the widget loads.

**Allowed domains** (A26): add `example.com` to Dashboard → Widget → Allowed
domains, then load your scratch page again. It must now show the "not allowed on
this website" message. Remove the entry and confirm it loads again.

**Payments, in Stripe test mode** (A07, A33):

1. Point a Stripe **test-mode** webhook at `https://your-staging-url/api/webhooks/stripe`
   and put its signing secret in `STRIPE_WEBHOOK_SECRET`.
2. Start a subscription checkout from **Settings → Plan**. It should reach
   Stripe rather than throwing — that is A06 closed.
3. Pay with `4242 4242 4242 4242`. Confirm `tenants.subscription_status` becomes
   `active` and `plan` matches the tier.
4. Create an invoice with a card payment against it, then press **Refund**.
   Confirm a refund appears in Stripe *and* a `kind = 'refund'` row appears in
   `payments`. Pressing Refund on an invoice with no card payment must say so
   rather than silently marking it refunded.
5. Use Stripe's **Resend** button on a `payment_intent.succeeded` event and
   confirm `payments` still has exactly one row for that intent.

**Email and reminders** (A15, A18, A22):

1. Submit the marketing contact form. A row must appear in
   `contact_submissions` *and* the notification must arrive. Submit six times
   and confirm the sixth is rate-limited.
2. Create a booking 25 hours out, then trigger the reminder job with the bearer
   token. Confirm `booking_reminders` moves from `pending` to `sent` and the
   email arrives.
3. Invite a teammate to an address you control. Accept it **from a second
   account**, and confirm: the link works once, a second use is refused, an
   expired or revoked token is refused, and signing in with a *different* email
   is refused with the mismatch message.

**Onboarding on real data** (A13, A14, A21): pick a restored tenant that has
bookings, open `/onboarding`, and walk it through to the end. Remove a service
that has bookings. Confirm afterwards that the booking still exists with its
service and employee, the service is deactivated rather than gone, and the
add-ons are still there. Then set a flat-rate service to four hours and confirm
the booking page offers four-hour blocks, not one-hour ones.

---

## 7. Decide on the things I deliberately did not build

Two items are honest gaps rather than bugs, and they are product decisions:

- **Online payment capture (A12).** There is no Stripe.js, no Elements and no
  confirmation step. The product now says plainly that nothing was charged and
  the business will arrange the deposit. You can launch on pay-later. If you
  want cards taken online at booking, that is its own piece of work — tell me
  and I will build it against a staging Stripe account.
- **Durable rate limiting (A32).** The limiter is in-process, so on serverless
  the effective limit is per instance. It raises the cost of casual abuse; it is
  not a boundary. If the widget gets abused, the fix is Upstash/Redis or your
  platform's WAF.

Also still open: a nonce-based CSP (the script policy needs `'unsafe-inline'`
for Next's bootstrap), and encryption at rest for the OAuth tokens that are now
policy-protected.

---

## 8. Promote to production

Only once steps 2, 4 and 6 are clean:

1. **Take a fresh production backup.** Verify you can read it.
2. Apply `0007` → `0008` → `0009` → `0010` to production, one at a time,
   checking the `settings ? 'email'` before/after queries from step 2 again.
3. Set the production env values: `CRON_SECRET` (new, not staging's), the three
   `STRIPE_PRICE_*` names, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, and
   `SUPER_ADMIN_SETUP_TOKEN` only if you still need to provision the super admin
   — then remove it.
4. Confirm `/admin` → System health reports **no blockers**.
5. Deploy, and for the first 24 hours watch three things:
   - `select status, count(*) from public.booking_reminders group by 1;` —
     `pending` rows older than an hour mean the cron is not firing.
   - Stripe → Developers → Webhooks → your endpoint: the failure count must stay
     at zero.
   - `select count(*) from public.audit_logs where entity = 'profiles';` — any
     row here is a role or tenant change and deserves a look.

Run `supabase/tests/01_security.sql` against **production** too. It rolls back,
so it is safe, and it is the only way to know the identity guard is live where
it matters.

---

## What "verified" will mean when you are done

| Evidence | Covers |
|---|---|
| Migrations applied with the before/after credential queries clean | 0007–0010 apply to real data |
| `01_security.sql` all PASS, on staging **and** production | A01, A02, A04, cross-tenant isolation |
| `02_booking.sql` all PASS | A09, A10, A11, A28 |
| `03_data_and_money.sql` all PASS | A13, A21, A07, A16 |
| curl results as listed | A05, A08, A26, A27 |
| Stripe test-mode flows | A06, A07, A17, A33 |
| Contact, reminder, invitation round-trips | A15, A18, A22 |
| Onboarding walked on a tenant with bookings | A13, A14, A21 |

Per your own audit's closure rule, record for each: the commit, the evidence,
the environment, the date, and who reviewed it. A passing test file is evidence;
this document is not.
