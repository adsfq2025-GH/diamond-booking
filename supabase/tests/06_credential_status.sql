-- ============================================================
-- Diamond Booking — the one question that matters after 0007
--
-- "Did any tenant lose its mail credentials, and can I get them back?"
--
-- One read-only query, one row per tenant, designed to be pasted back whole.
-- Nothing is written. Safe on production.
--
-- Read the `verdict` column:
--
--   ok                      credentials are in tenant_secrets. Nothing to do.
--   recoverable             missing from tenant_secrets, but the pre-migration
--                           value is still in audit_logs (the tenants_audit
--                           trigger recorded it when 0007 stripped the key).
--                           Run PART B of 05_recover_credentials.sql.
--   LOST                    missing from tenant_secrets AND no usable copy in
--                           the audit log. The owner must re-enter their SMTP
--                           settings. This is the only bad outcome.
--   never had any           this tenant never had a usable SMTP password, so
--                           the platform sender was always being used. Nothing
--                           to do. Note this includes a tenant that saved email
--                           settings while on Resend: the form persists its
--                           default host ("smtp.gmail.com") with a blank
--                           password, which looks like a configured server but
--                           never was one.
--
-- Also shown: whether a plaintext copy is still sitting in audit_logs, which
-- PART C of 05_recover_credentials.sql redacts once you are satisfied.
-- ============================================================

with stripped as (
  -- What the audit trail remembers of each tenant's settings before 0007
  -- removed the 'email' key.
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
),
audit_latest as (
  select tenant_id, created_at, old_email from stripped where rn = 1
)
select
  t.slug,

  -- current state
  (sec.tenant_id is not null)                              as has_secrets_row,
  sec.email ->> 'provider'                                 as provider,
  sec.email -> 'smtp' ->> 'host'                           as smtp_host,
  (length(coalesce(sec.email -> 'smtp' ->> 'pass', '')) > 0) as has_password,

  -- what the audit trail can give back
  (al.tenant_id is not null)                               as in_audit_log,
  al.created_at                                            as stripped_at,

  -- the answer
  case
    -- A usable credential is in tenant_secrets: the move worked.
    when length(coalesce(sec.email -> 'smtp' ->> 'pass', '')) > 0
      and sec.email -> 'smtp' ->> 'host' is not null       then 'ok'
    -- Missing now, but the audit trail holds a usable one.
    when length(coalesce(al.old_email -> 'smtp' ->> 'pass', '')) > 0
      and al.old_email -> 'smtp' ->> 'host' is not null    then 'recoverable'
    -- An audit row exists, but the password it recorded was EMPTY. That is not
    -- a loss: the tenant had saved email settings while on the platform sender,
    -- and the settings form persists its default host with a blank password.
    -- There was never a credential here to lose.
    when al.tenant_id is not null
      and length(coalesce(al.old_email -> 'smtp' ->> 'pass', '')) = 0
                                                           then 'never had any'
    -- An audit row with no recoverable smtp object at all.
    when al.tenant_id is not null                          then 'LOST'
    when sec.tenant_id is not null                         then 'ok'
    else 'never had any'
  end                                                      as verdict,

  -- Cleanup outstanding: a NON-EMPTY password in the audit trail. Testing only
  -- for the key's presence reported a copy that was an empty string, which is
  -- nothing to scrub and reads as alarming.
  (length(coalesce(al.old_email -> 'smtp' ->> 'pass', '')) > 0)
                                                           as secret_in_audit_log

from public.tenants t
left join public.tenant_secrets sec on sec.tenant_id = t.id
left join audit_latest al           on al.tenant_id = t.id
order by
  case
    when length(coalesce(sec.email -> 'smtp' ->> 'pass', '')) > 0 then 2
    when al.tenant_id is not null then 0
    else 1
  end,
  t.slug;

-- ============================================================
-- Definitive scrub check: does ANY audit row, not just the latest per tenant,
-- hold a non-empty password? This is the only question that decides whether
-- PART C of 05_recover_credentials.sql needs to run.
--
-- Expect 0. A tenant that only ever used the platform sender leaves an smtp
-- object with a blank password, which is not a secret.
-- ============================================================
select
  'any real secret in the audit trail (expect 0)' as check,
  count(*) as rows_with_a_non_empty_password
from public.audit_logs
where entity = 'tenants'
  and length(coalesce(meta -> 'changed' -> 'settings' -> 'old' -> 'email' -> 'smtp' ->> 'pass', '')) > 0;
