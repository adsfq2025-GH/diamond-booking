-- ============================================================
-- Diamond Booking — 0007_security.sql
-- Security containment pass. Apply after 0006. Idempotent.
--
-- Fixes, in the order they matter:
--   A01  profiles.role / profiles.tenant_id were self-assignable. Every RLS
--        policy in the system derives authority from those two columns via
--        auth_role()/auth_tenant(), so any signed-in user could make
--        themselves super_admin — or move into another tenant — with one
--        update from the browser. A trigger now rejects that.
--   A02  Tenant SMTP credentials lived in tenants.settings.email, and
--        tenants_select hands the whole row to every employee AND customer of
--        the tenant. Credentials move to tenant_secrets, which has RLS on and
--        NO policies: service-role only, unreachable from any client.
--   A04  google_calendar_connections exposed access_token / refresh_token to
--        every employee in the tenant. SELECT is now own-row only.
--   A07  payments.stripe_payment_intent_id had no unique index, so the
--        webhook's `upsert(..., onConflict: stripe_payment_intent_id)` could
--        never execute — no payment was ever recorded.
-- ============================================================

-- ------------------------------------------------------------
-- A01 — identity columns are not self-assignable
-- ------------------------------------------------------------
-- Allowed to change role / tenant_id:
--   * the service role (signup bootstrap, invite acceptance, admin tooling)
--   * an existing super_admin
--   * a direct connection with no JWT (psql, migrations, seeds)
-- Everyone else — including the owner of the row — is rejected.
-- Reads the JWT role claim straight from the request GUC rather than
-- auth.role(), which is deprecated on newer Supabase versions. The GUC is
-- absent on a direct psql/migration connection, which is itself privileged.
create or replace function public.guard_profile_identity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_claims text := current_setting('request.jwt.claims', true);
  v_jwt_role text := coalesce(nullif(v_claims, '')::jsonb ->> 'role', '');
begin
  if new.role is not distinct from old.role
     and new.tenant_id is not distinct from old.tenant_id then
    return new;   -- nothing privileged changed
  end if;

  if v_jwt_role = 'service_role'
     or v_claims is null or v_claims = ''        -- direct SQL, no JWT
     or auth.uid() is null
     or public.auth_role() = 'super_admin' then
    return new;
  end if;

  raise exception
    'profiles.role and profiles.tenant_id can only be changed by the service role or a super admin'
    using errcode = '42501';
end;
$$;

drop trigger if exists profiles_guard_identity on public.profiles;
create trigger profiles_guard_identity
  before update on public.profiles
  for each row execute function public.guard_profile_identity();

-- Changes to these columns are security events — record them.
drop trigger if exists profiles_audit on public.profiles;
create trigger profiles_audit
  after update on public.profiles
  for each row
  when (
    old.role is distinct from new.role
    or old.tenant_id is distinct from new.tenant_id
  )
  execute function public.audit_row();

-- ------------------------------------------------------------
-- A02 — integration credentials out of tenant-readable rows
-- ------------------------------------------------------------
create table if not exists public.tenant_secrets (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  -- { provider, smtp: { host, port, secure, user, pass, fromName, fromEmail } }
  email jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tenant_secrets enable row level security;
-- Deliberately NO policies: RLS with no policy denies every client role.
-- Only the service role (which bypasses RLS) can read or write this table.
-- Do not add a policy here without moving the secret somewhere else first.
revoke all on public.tenant_secrets from anon, authenticated;

drop trigger if exists tenant_secrets_touch on public.tenant_secrets;
create trigger tenant_secrets_touch before update on public.tenant_secrets
  for each row execute function public.touch_updated_at();

-- Move any credentials already stored in the tenant-readable settings blob,
-- then strip them from there. Runs once; safe to re-run.
insert into public.tenant_secrets (tenant_id, email)
select t.id, t.settings -> 'email'
from public.tenants t
where t.settings ? 'email'
on conflict (tenant_id) do update
  set email = excluded.email,
      updated_at = now();

update public.tenants
   set settings = settings - 'email'
 where settings ? 'email';

-- ------------------------------------------------------------
-- A04 — OAuth tokens are own-row only
-- ------------------------------------------------------------
drop policy if exists google_calendar_connections_select on public.google_calendar_connections;
create policy google_calendar_connections_select on public.google_calendar_connections for select
using (
  public.auth_role() = 'super_admin'
  or profile_id = auth.uid()
);

-- Write stays own-row (owners included): an owner has no reason to mutate
-- another person's calendar tokens, and the sync job runs as the service role.
drop policy if exists google_calendar_connections_write on public.google_calendar_connections;
create policy google_calendar_connections_write on public.google_calendar_connections for all
using (
  public.auth_role() = 'super_admin'
  or (profile_id = auth.uid() and tenant_id = public.auth_tenant())
)
with check (
  public.auth_role() = 'super_admin'
  or (profile_id = auth.uid() and tenant_id = public.auth_tenant())
);

-- ------------------------------------------------------------
-- A07 — the unique index the Stripe webhook's upsert infers
-- ------------------------------------------------------------
-- Collapse any duplicates a retry may already have written, keeping the
-- earliest row per intent, before the unique index goes on.
delete from public.payments p
using public.payments q
where p.stripe_payment_intent_id is not null
  and p.stripe_payment_intent_id = q.stripe_payment_intent_id
  and (p.created_at, p.id) > (q.created_at, q.id);

create unique index if not exists payments_stripe_payment_intent_id_key
  on public.payments (stripe_payment_intent_id);
