-- ============================================================
-- Diamond Booking — post-migration integrity check for PRODUCTION
--
-- Run this now, on the database you applied 0007-0010 to. It is READ-ONLY:
-- no inserts, no updates, no transaction needed.
--
-- 0007 is the only migration in the set that MOVED existing data and deleted
-- the original: it copied tenants.settings->'email' into tenant_secrets and
-- then stripped the key. Everything else was additive. So this checks the move
-- landed, and flags the places where applying the SQL before deploying the
-- matching code leaves the product in a worse state than before.
--
-- Each section prints rows. Read every one; nothing here raises on failure,
-- because on production you want the whole picture, not a stop at the first
-- surprise.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Did the credential move land? (the one irreversible step)
-- ------------------------------------------------------------
-- Expected: zero rows. Any row here means a tenant still has mail credentials
-- in the tenant-readable settings blob, which is the A02 exposure.
select
  '1a. tenants still holding credentials in settings (expect 0 rows)' as check,
  id,
  slug,
  settings -> 'email' -> 'smtp' ->> 'host' as smtp_host
from public.tenants
where settings ? 'email';

-- Expected: one row per tenant that had SMTP configured, each complete.
-- complete = false means the move copied a partial object and that tenant can
-- no longer send mail — restore its credentials from the pre-migration backup
-- or have the owner re-enter them.
select
  '1b. migrated credentials (complete should be true)' as check,
  t.slug,
  s.email ->> 'provider'                        as provider,
  s.email -> 'smtp' ->> 'host'                  as smtp_host,
  (s.email -> 'smtp' ->> 'pass') is not null
    and length(coalesce(s.email -> 'smtp' ->> 'pass', '')) > 0
    and (s.email -> 'smtp' ->> 'host') is not null
    and (s.email -> 'smtp' ->> 'user') is not null  as complete,
  s.updated_at
from public.tenant_secrets s
join public.tenants t on t.id = s.tenant_id
order by t.slug;

-- A count, so "zero rows above" is unambiguous rather than ambiguous.
select
  '1c. summary' as check,
  (select count(*) from public.tenants)                       as tenants,
  (select count(*) from public.tenant_secrets)                as with_secrets,
  (select count(*) from public.tenants where settings ? 'email') as still_exposed;

-- ------------------------------------------------------------
-- 2. What the payments dedupe in 0007 actually did
-- ------------------------------------------------------------
-- 0007 deleted duplicate payments rows sharing a stripe_payment_intent_id,
-- keeping the earliest, before adding the unique index. On production that
-- deleted real rows if any duplicates existed. You cannot see what went, but
-- you can reconcile the total against Stripe.
select
  '2a. payments now' as check,
  count(*)                                                  as rows,
  count(distinct stripe_payment_intent_id)                  as distinct_intents,
  count(*) filter (where stripe_payment_intent_id is null)   as without_intent_id,
  min(created_at)                                           as earliest,
  max(created_at)                                           as latest
from public.payments;

-- Expected: zero rows. The unique index should make this impossible, so a row
-- here means the index is missing.
select '2b. duplicate intents remaining (expect 0 rows)' as check,
       stripe_payment_intent_id, count(*)
from public.payments
where stripe_payment_intent_id is not null
group by stripe_payment_intent_id
having count(*) > 1;

-- ------------------------------------------------------------
-- 3. Did anything already try to escalate privileges?
-- ------------------------------------------------------------
-- 0007 added an audit trigger on profiles.role / profiles.tenant_id. Rows here
-- are legitimate (an invitation accepted, an owner provisioned) OR an attempt
-- — check the actor against the change.
select
  '3a. identity changes since the guard went live' as check,
  created_at,
  actor_id,
  meta -> 'changed' -> 'role'      as role_change,
  meta -> 'changed' -> 'tenant_id' as tenant_change
from public.audit_logs
where entity = 'profiles'
order by created_at desc
limit 50;

-- Sanity: is the guard actually attached? Expect one row.
select '3b. identity guard installed (expect 1 row)' as check, tgname
from pg_trigger
where tgname = 'profiles_guard_identity'
  and tgrelid = to_regclass('public.profiles');

-- ------------------------------------------------------------
-- 4. Defaults 0009 applied to EXISTING rows
-- ------------------------------------------------------------
-- pricing_unit defaulted to 'hourly' for every service that already existed,
-- because that is what the old onboarding code assumed. For a service that is
-- really flat-rate this is now wrong in the editor (display only — duration
-- and price are untouched). Owners can correct it, or you can bulk-update.
select
  '4a. services by pricing_unit' as check,
  pricing_unit,
  count(*) as services,
  count(*) filter (where minimum_hours is null) as without_minimum_hours
from public.services
group by pricing_unit
order by pricing_unit;

-- ------------------------------------------------------------
-- 5. THE DEPLOY GAP — what is broken until the new code ships
-- ------------------------------------------------------------
-- The SQL is applied; if the running app is still the pre-audit build, these
-- are live mismatches:
--
--   * The OLD code reads tenant SMTP from tenants.settings->'email', which
--     0007 just emptied. Any tenant that sent mail through its own SMTP is
--     now falling back to platform Resend, or not sending at all.
--   * The OLD code WRITES SMTP credentials back to tenants.settings->'email'.
--     If an owner re-saves email settings before you deploy, the A02 exposure
--     comes straight back and section 1a will stop being empty.
--   * The OLD onboarding still deletes-and-recreates services and employees
--     (A13), because it does not know about onboarding_save_catalog.
--
-- So: deploy the new build. This query tells you how exposed you are in the
-- meantime — how many tenants were relying on their own SMTP.
select
  '5a. tenants whose mail depends on the new code' as check,
  count(*) as tenants_with_own_smtp
from public.tenant_secrets
where email ->> 'provider' = 'smtp';

-- And how much onboarding re-entry risk is live right now: tenants that have
-- bookings AND have not finished onboarding are the ones who might re-enter
-- the wizard and hit the old destructive path.
select
  '5b. tenants that could re-run the old destructive onboarding' as check,
  t.slug,
  (t.settings ->> 'onboarding_complete')::boolean as onboarding_complete,
  (select count(*) from public.bookings b where b.tenant_id = t.id) as bookings
from public.tenants t
where exists (select 1 from public.bookings b where b.tenant_id = t.id)
order by bookings desc
limit 20;

-- ------------------------------------------------------------
-- 6. Is anything else obviously wrong?
-- ------------------------------------------------------------
select
  '6a. object counts' as check,
  (select count(*) from public.tenants)              as tenants,
  (select count(*) from public.bookings)             as bookings,
  (select count(*) from public.services)             as services,
  (select count(*) from public.employees)            as employees,
  (select count(*) from public.booking_reminders)    as reminders,
  (select count(*) from public.contact_submissions)  as contact_submissions,
  (select count(*) from public.employee_invitations) as invitations;

-- Reminders that should already have gone out. A growing number here means
-- CRON_SECRET is unset or the cron is not firing.
select
  '6b. reminder queue' as check,
  status,
  count(*) as rows,
  min(scheduled_for) as oldest_due
from public.booking_reminders
where scheduled_for <= now()
group by status
order by status;
