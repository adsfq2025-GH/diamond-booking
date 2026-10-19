# Verification tests

Three SQL files that prove the October 2026 audit fixes work **on a specific
database**, rather than only in the diff.

Each file:

- builds its own throwaway fixture (prefixed `ztest-`),
- asserts, raising an exception with a `FAIL <id>` message on the first problem,
- prints a `PASS <id>` notice for every check that holds,
- ends with `ROLLBACK`, so it persists nothing and is safe to re-run.

| File | Findings covered |
|---|---|
| `00_migration_state.sql` | none — a read-only probe of which migrations are actually applied. Run it before changing any database. |
| `01_security.sql` | A01 privilege escalation · A02 tenant credentials · A04 OAuth tokens · cross-tenant isolation |
| `02_booking.sql` | A09 add-on duration · A10 buffers (both sides) · A11 capacity vs display · A28 error codes |
| `03_data_and_money.sql` | A13 onboarding data loss · A21 readiness · A07 payment idempotency · A16 coupon pricing and limits |

## Running them

```bash
psql "$STAGING_DATABASE_URL" -f supabase/tests/01_security.sql
```

Or paste into the Supabase SQL editor. **Read the NOTICE output** — a run with
no notices means notices are being suppressed, not that everything passed; use
`psql` in that case.

## Two things to know before trusting a result

1. **`01_security.sql` check 0 must pass.** The SQL editor runs as `postgres`,
   which bypasses RLS entirely, so the file impersonates the `authenticated`
   role and sets `request.jwt.claims` exactly as PostgREST does. Check 0 proves
   that impersonation is live; without it every policy check would pass
   vacuously. The same applies to `PASS setup` in `03_data_and_money.sql`, where
   the onboarding functions take their tenant from `auth_tenant()`.

2. **Assertions are on outcomes, not on which layer refused.** An UPDATE blocked
   by RLS affects zero rows without raising, which is an equally good result as
   the trigger raising. The checks assert that the escalation did not happen and
   report which layer stopped it.

## What they do not cover

Anything above the database: route protection, security headers, the Stripe
lifecycle, email delivery, and the invitation round-trip. Those are in
[`../../docs/STAGING-VERIFICATION.md`](../../docs/STAGING-VERIFICATION.md),
step 6, as curl commands and manual flows.
