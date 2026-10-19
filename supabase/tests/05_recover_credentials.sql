-- ============================================================
-- Diamond Booking — recover (and then scrub) the credentials 0007 moved
--
-- Context: 0007 copied tenants.settings->'email' into tenant_secrets and then
-- ran `update public.tenants set settings = settings - 'email'`. That UPDATE
-- fired the tenants_audit trigger from 0003, and audit_row() records the FULL
-- previous value of every changed column:
--
--   meta -> 'changed' -> 'settings' -> 'old'   = the settings blob as it was,
--                                                 'email' key included.
--
-- So the pre-migration credentials are still in audit_logs even with no
-- database backup. Two consequences, and this file handles both:
--
--   PART A (read-only)  what the audit log actually holds.
--   PART B (writes)     restore anything the move failed to carry across.
--   PART C (writes)     redact the leftover plaintext copy.
--
-- PART C matters on its own. A credential copy is sitting in a table whose
-- policy admits `business_owner` for their own tenant and `super_admin`. That
-- is far narrower than the original A02 exposure — employees and customers
-- cannot read audit_logs at all — but it is still a plaintext password in a
-- table that should not hold one, so scrub it once PART A looks right.
--
-- Run PART A first. Only run B or C after reading its output.
-- ============================================================

-- ============================================================
-- PART A — READ-ONLY. What survived, and what the audit log remembers.
-- ============================================================

-- A1. Every tenant whose settings once contained mail credentials, with what
--     is in tenant_secrets today. This is the reconciliation that tells you
--     whether 0007 lost anything.
with stripped as (
  select
    a.tenant_id,
    a.created_at,
    a.meta -> 'changed' -> 'settings' -> 'old' -> 'email' as old_email,
    row_number() over (partition by a.tenant_id order by a.created_at desc) as rn
  from public.audit_logs a
  where a.entity = 'tenants'
    and a.action = 'update'
    and a.meta -> 'changed' ? 'settings'
    and a.meta -> 'changed' -> 'settings' -> 'old' ? 'email'
)
select
  'A1. reconciliation' as check,
  t.slug,
  s.created_at                                   as stripped_at,
  s.old_email ->> 'provider'                     as old_provider,
  s.old_email -> 'smtp' ->> 'host'               as old_host,
  (sec.tenant_id is not null)                    as has_secrets_row,
  sec.email -> 'smtp' ->> 'host'                 as current_host,
  -- true  = the move carried a usable credential across: nothing to do.
  -- false = the credential exists in the audit log but NOT in tenant_secrets.
  --         PART B restores it.
  (
    sec.email -> 'smtp' ->> 'host' is not null
    and sec.email -> 'smtp' ->> 'user' is not null
    and length(coalesce(sec.email -> 'smtp' ->> 'pass', '')) > 0
  )                                              as migrated_ok
from stripped s
join public.tenants t on t.id = s.tenant_id
left join public.tenant_secrets sec on sec.tenant_id = s.tenant_id
where s.rn = 1
order by t.slug;

-- A2. The blunt summary.
with stripped as (
  select distinct a.tenant_id
  from public.audit_logs a
  where a.entity = 'tenants'
    and a.action = 'update'
    and a.meta -> 'changed' ? 'settings'
    and a.meta -> 'changed' -> 'settings' -> 'old' ? 'email'
)
select
  'A2. summary' as check,
  (select count(*) from stripped)                                as tenants_that_had_credentials,
  (select count(*) from public.tenant_secrets)                   as tenant_secrets_rows,
  (
    select count(*) from stripped s
    left join public.tenant_secrets sec on sec.tenant_id = s.tenant_id
    where sec.tenant_id is null
       or length(coalesce(sec.email -> 'smtp' ->> 'pass', '')) = 0
  )                                                              as needs_recovery;

-- A3. How many audit rows hold a plaintext credential copy (PART C scrubs these).
select
  'A3. audit rows holding a credential copy' as check,
  count(*) as rows
from public.audit_logs
where entity = 'tenants'
  and meta -> 'changed' -> 'settings' -> 'old' ? 'email';

-- ============================================================
-- PART B — WRITES. Restore only what is genuinely missing.
--
-- Run this ONLY if A2.needs_recovery > 0. It is idempotent and it never
-- overwrites a tenant_secrets row that already has a password, so a tenant who
-- has since re-entered their credentials is left alone.
-- ============================================================

-- Uncomment to run:
--
-- with stripped as (
--   select
--     a.tenant_id,
--     a.meta -> 'changed' -> 'settings' -> 'old' -> 'email' as old_email,
--     row_number() over (partition by a.tenant_id order by a.created_at desc) as rn
--   from public.audit_logs a
--   where a.entity = 'tenants'
--     and a.action = 'update'
--     and a.meta -> 'changed' ? 'settings'
--     and a.meta -> 'changed' -> 'settings' -> 'old' ? 'email'
-- ),
-- latest as (
--   select tenant_id, old_email from stripped where rn = 1
-- )
-- insert into public.tenant_secrets (tenant_id, email)
-- select l.tenant_id, l.old_email
-- from latest l
-- join public.tenants t on t.id = l.tenant_id          -- skip deleted tenants
-- where l.old_email -> 'smtp' ->> 'host' is not null
--   and length(coalesce(l.old_email -> 'smtp' ->> 'pass', '')) > 0
-- on conflict (tenant_id) do update
--   set email = excluded.email,
--       updated_at = now()
--   -- Only fill a gap; never clobber a credential that is already usable.
--   where length(coalesce(public.tenant_secrets.email -> 'smtp' ->> 'pass', '')) = 0
-- returning tenant_id, email -> 'smtp' ->> 'host' as restored_host;

-- ============================================================
-- PART C — WRITES. Redact the leftover plaintext copy.
--
-- Run this once PART A shows every tenant migrated_ok (or PART B has fixed the
-- ones that were not). It replaces the credential object in the audit meta with
-- a marker, keeping the audit trail — that a change happened, when, and by whom
-- — while removing the secret.
--
-- Do NOT run it before you are satisfied with PART A: this is the only
-- remaining copy of those credentials.
-- ============================================================

-- Uncomment to run:
--
-- update public.audit_logs
--    set meta = jsonb_set(
--          meta,
--          '{changed,settings,old,email}',
--          jsonb_build_object(
--            'redacted', true,
--            'redacted_at', to_jsonb(now()),
--            'note', 'SMTP credentials removed from the audit trail; see tenant_secrets'
--          ),
--          false
--        )
--  where entity = 'tenants'
--    and meta -> 'changed' -> 'settings' -> 'old' ? 'email'
--    and not coalesce((meta -> 'changed' -> 'settings' -> 'old' -> 'email' -> 'redacted')::boolean, false);

-- Verify PART C: expect 0 rows.
-- select 'C. remaining plaintext copies (expect 0)' as check, count(*)
-- from public.audit_logs
-- where entity = 'tenants'
--   and meta -> 'changed' -> 'settings' -> 'old' -> 'smtp' ? 'pass';

-- ============================================================
-- Then, regardless of the outcome above: ROTATE.
--
-- Those passwords were readable by every employee AND customer of the tenant
-- before 0007, for as long as the credentials had been stored. Recovering them
-- restores service; it does not make them secret again. Have each owner issue a
-- new app password and re-enter it once the new build is deployed.
-- ============================================================
