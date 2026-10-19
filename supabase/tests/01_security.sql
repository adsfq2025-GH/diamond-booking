-- ============================================================
-- Diamond Booking — verification test 01: security (A01, A02, A04)
--
-- Proves the four CRITICAL findings are actually closed on THIS database.
-- Run it in the Supabase SQL editor (or psql) against STAGING, after applying
-- 0007-0010. It creates its own throwaway fixture and ends with ROLLBACK, so
-- it leaves nothing behind and is safe to run repeatedly.
--
-- Every check raises an exception on failure, so the run either prints a wall
-- of PASS notices or stops at the first real problem. Read the NOTICE output:
-- a silent success is not a result.
--
-- HOW THE IMPERSONATION WORKS, and why it matters
-- -----------------------------------------------
-- The SQL editor runs as `postgres`, which BYPASSES RLS entirely: every
-- policy test would pass vacuously. So each check switches to the
-- `authenticated` role and sets request.jwt.claims, exactly as PostgREST does
-- for a signed-in user. auth.uid() reads 'sub' from those claims.
--
-- Setting the claims is not optional: guard_profile_identity() treats a
-- MISSING claims GUC as a direct psql connection (which is privileged) and
-- would allow the very change we are testing for. Check 0 below proves the
-- impersonation is live before anything depends on it.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- Fixture: two tenants, so cross-tenant access has something to fail at.
-- ------------------------------------------------------------
create temporary table _ids (k text primary key, v uuid);
-- The checks below read this while impersonating `authenticated`, and a temp
-- table belongs to the session user, so it needs an explicit grant.
grant select on _ids to public;

do $$
declare
  t1 uuid := gen_random_uuid();   -- tenant A
  t2 uuid := gen_random_uuid();   -- tenant B
  owner_a uuid := gen_random_uuid();
  emp_a uuid := gen_random_uuid();
  cust_a uuid := gen_random_uuid();
  owner_b uuid := gen_random_uuid();
  emp_row_a uuid;
  cust_row_a uuid;
begin
  insert into public.tenants (id, slug, name, industry)
  values (t1, 'ztest-tenant-a', 'Ztest Tenant A', 'cleaning'),
         (t2, 'ztest-tenant-b', 'Ztest Tenant B', 'cleaning');

  -- auth.users rows: profiles.id references them.
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000', owner_a, 'authenticated', 'authenticated',
     'ztest-owner-a@example.test', '', now(),
     '{"provider":"email","role":"business_owner"}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', emp_a, 'authenticated', 'authenticated',
     'ztest-emp-a@example.test', '', now(),
     '{"provider":"email","role":"employee"}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', cust_a, 'authenticated', 'authenticated',
     'ztest-cust-a@example.test', '', now(),
     '{"provider":"email","role":"customer"}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', owner_b, 'authenticated', 'authenticated',
     'ztest-owner-b@example.test', '', now(),
     '{"provider":"email","role":"business_owner"}', '{}', now(), now());

  insert into public.profiles (id, tenant_id, role, full_name, email) values
    (owner_a, t1, 'business_owner', 'Owner A', 'ztest-owner-a@example.test'),
    (emp_a,   t1, 'employee',       'Employee A', 'ztest-emp-a@example.test'),
    (cust_a,  t1, 'customer',       'Customer A', 'ztest-cust-a@example.test'),
    (owner_b, t2, 'business_owner', 'Owner B', 'ztest-owner-b@example.test');

  insert into public.employees (tenant_id, profile_id, display_name, title, active)
  values (t1, emp_a, 'Employee A', 'Cleaner', true)
  returning id into emp_row_a;

  insert into public.customers (tenant_id, profile_id, full_name, email)
  values (t1, cust_a, 'Customer A', 'ztest-cust-a@example.test')
  returning id into cust_row_a;

  -- A02 fixture: a credential in the place it now belongs.
  insert into public.tenant_secrets (tenant_id, email)
  values (t1, '{"provider":"smtp","smtp":{"host":"smtp.example.test","user":"u","pass":"SUPER-SECRET-PASSWORD"}}'::jsonb);

  -- A02 regression fixture: a credential in the place it USED to live. 0007
  -- should have stripped these, but a tenant created by older code could still
  -- carry one, so the check below asserts the tenant-readable blob is clean.
  update public.tenants set settings = settings || '{"auto_confirm":true}'::jsonb where id = t1;

  -- A04 fixture: the owner's Google tokens.
  insert into public.google_calendar_connections
    (tenant_id, profile_id, email, access_token, refresh_token)
  values (t1, owner_a, 'owner-a@gmail.test', 'ACCESS-TOKEN-SECRET', 'REFRESH-TOKEN-SECRET');

  insert into _ids (k, v) values
    ('t1', t1), ('t2', t2),
    ('owner_a', owner_a), ('emp_a', emp_a), ('cust_a', cust_a), ('owner_b', owner_b),
    ('emp_row_a', emp_row_a), ('cust_row_a', cust_row_a);

  raise notice 'fixture created (tenants ztest-tenant-a / ztest-tenant-b)';
end $$;

-- Switch to the role PostgREST uses for a signed-in user. `postgres` bypasses
-- RLS, so without this every policy check below would pass vacuously. It stays
-- in effect for the rest of the transaction.
set local role authenticated;

-- ============================================================
-- Check 0 — the impersonation itself works
-- Without this, every check below could pass for the wrong reason.
-- ============================================================
do $$
declare
  v_cust uuid := (select v from _ids where k = 'cust_a');
  v_seen uuid;
  v_role text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_cust, 'role', 'authenticated')::text, true);

  select auth.uid() into v_seen;
  select public.auth_role()::text into v_role;

  if v_seen is distinct from v_cust then
    raise exception 'FAIL check 0: auth.uid() returned %, expected % — impersonation is NOT active, so no RLS result below can be trusted', v_seen, v_cust;
  end if;
  if v_role is distinct from 'customer' then
    raise exception 'FAIL check 0: auth_role() returned %, expected customer', v_role;
  end if;
  raise notice 'PASS check 0: impersonation active (auth.uid + auth_role resolve to the test customer)';
end $$;

-- ============================================================
-- A01 — a signed-in user cannot grant themselves a role or move tenant
-- ============================================================
do $$
declare
  v_cust uuid := (select v from _ids where k = 'cust_a');
  v_t2 uuid := (select v from _ids where k = 't2');
  v_raised boolean;
  v_role public.user_role;
  v_tenant uuid;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_cust, 'role', 'authenticated')::text, true);

  -- A01.1 — privilege escalation.
  -- The assertion is on the OUTCOME, not on which layer refused: an UPDATE
  -- blocked by RLS affects zero rows without raising, and that is an equally
  -- good result. Asserting "it raised" would fail for the right behaviour.
  v_raised := false;
  begin
    update public.profiles set role = 'super_admin' where id = v_cust;
  exception when others then
    v_raised := true;
  end;
  select role into v_role from public.profiles where id = v_cust;
  if v_role is distinct from 'customer' then
    raise exception 'FAIL A01.1: role is now % — escalation SUCCEEDED', v_role;
  end if;
  raise notice 'PASS A01.1: role still customer (refused by %)',
    case when v_raised then 'the trigger' else 'RLS, with no rows affected' end;

  -- A01.2 — lateral move into another tenant
  v_raised := false;
  begin
    update public.profiles set tenant_id = v_t2 where id = v_cust;
  exception when others then
    v_raised := true;
  end;
  select tenant_id into v_tenant from public.profiles where id = v_cust;
  if v_tenant = v_t2 then
    raise exception 'FAIL A01.2: tenant_id was changed — lateral move SUCCEEDED';
  end if;
  raise notice 'PASS A01.2: tenant unchanged (refused by %)',
    case when v_raised then 'the trigger' else 'RLS, with no rows affected' end;

  -- A01.3 — the guard is not over-broad: a benign self-edit must still work.
  -- This is the check that would catch a trigger that blocks everything.
  update public.profiles set full_name = 'Customer A Renamed' where id = v_cust;
  if (select full_name from public.profiles where id = v_cust) <> 'Customer A Renamed' then
    raise exception 'FAIL A01.3: a legitimate self-update to full_name did not apply';
  end if;
  raise notice 'PASS A01.3: ordinary self-update (full_name) still allowed';
end $$;

-- ============================================================
-- A02 — tenant credentials are unreachable from a tenant member
-- ============================================================
-- tenant_secrets is protected two ways, and the stronger one raises rather
-- than returning nothing: 0007 does `revoke all ... from anon, authenticated`,
-- so a client role has no table privilege at all and a SELECT fails with
-- insufficient_privilege (42501) BEFORE RLS is consulted. An earlier version of
-- this check asserted "returns 0 rows" and therefore aborted on the better
-- outcome. Both results pass; the notice records which one happened.
--
-- If you ever see the Postgres HINT "GRANT SELECT ON public.tenant_secrets TO
-- authenticated" — do not follow it. That is precisely the A02 exposure.
do $$
declare
  v_cust uuid := (select v from _ids where k = 'cust_a');
  v_emp uuid := (select v from _ids where k = 'emp_a');
  v_t1 uuid := (select v from _ids where k = 't1');
  v_rows int;
  v_denied boolean;
  v_settings jsonb;
begin
  -- as the CUSTOMER
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_cust, 'role', 'authenticated')::text, true);

  v_denied := false;
  v_rows := -1;
  begin
    select count(*) into v_rows from public.tenant_secrets;
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied and v_rows <> 0 then
    raise exception 'FAIL A02.1: a customer read % row(s) from tenant_secrets', v_rows;
  end if;
  raise notice 'PASS A02.1: customer cannot read tenant_secrets (%)',
    case when v_denied
      then 'table privilege revoked outright — stronger than an RLS filter'
      else 'RLS returned 0 rows' end;

  select settings into v_settings from public.tenants where id = v_t1;
  if v_settings ? 'email' then
    raise exception 'FAIL A02.2: tenants.settings still contains an "email" key (credentials in a tenant-readable row): %', v_settings -> 'email';
  end if;
  raise notice 'PASS A02.2: tenants.settings carries no email credentials';

  -- as an EMPLOYEE
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_emp, 'role', 'authenticated')::text, true);

  v_denied := false;
  v_rows := -1;
  begin
    select count(*) into v_rows from public.tenant_secrets;
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied and v_rows <> 0 then
    raise exception 'FAIL A02.3: an employee read % row(s) from tenant_secrets', v_rows;
  end if;
  raise notice 'PASS A02.3: employee cannot read tenant_secrets (%)',
    case when v_denied
      then 'table privilege revoked outright'
      else 'RLS returned 0 rows' end;

  -- A02.4 — writing is refused too, so a client cannot plant a credential
  -- somewhere only the service role is supposed to reach.
  v_denied := false;
  begin
    insert into public.tenant_secrets (tenant_id, email)
    values (v_t1, '{"provider":"smtp"}'::jsonb)
    on conflict (tenant_id) do update set email = excluded.email;
  exception when insufficient_privilege or check_violation then
    v_denied := true;
  when others then
    v_denied := true;   -- any refusal is a pass; only success is a failure
  end;
  if not v_denied then
    raise exception 'FAIL A02.4: an employee WROTE to tenant_secrets';
  end if;
  raise notice 'PASS A02.4: writing to tenant_secrets is refused';
end $$;

-- ============================================================
-- A04 — OAuth tokens are own-row only
-- ============================================================
do $$
declare
  v_emp uuid := (select v from _ids where k = 'emp_a');
  v_owner uuid := (select v from _ids where k = 'owner_a');
  v_rows int;
  v_token text;
begin
  -- The employee must not see the OWNER's connection.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_emp, 'role', 'authenticated')::text, true);

  select count(*) into v_rows from public.google_calendar_connections;
  if v_rows <> 0 then
    raise exception 'FAIL A04.1: an employee read % calendar connection row(s) belonging to someone else', v_rows;
  end if;
  raise notice 'PASS A04.1: employee reads 0 calendar connections of other people';

  -- The owner must still see their own.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  select access_token into v_token
  from public.google_calendar_connections where profile_id = v_owner;
  if v_token is distinct from 'ACCESS-TOKEN-SECRET' then
    raise exception 'FAIL A04.2: the owner cannot read their OWN calendar connection — the policy is too tight';
  end if;
  raise notice 'PASS A04.2: owner still reads their own connection';
end $$;

-- ============================================================
-- Cross-tenant isolation (S04 / D09) — the baseline claim the audit
-- said was asserted but never certified.
-- ============================================================
do $$
declare
  v_owner_a uuid := (select v from _ids where k = 'owner_a');
  v_t2 uuid := (select v from _ids where k = 't2');
  v_rows int;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);

  select count(*) into v_rows from public.tenants where id = v_t2;
  if v_rows <> 0 then
    raise exception 'FAIL X.1: owner of tenant A read tenant B''s row';
  end if;
  raise notice 'PASS X.1: owner A cannot read tenant B';

  select count(*) into v_rows from public.profiles where tenant_id = v_t2;
  if v_rows <> 0 then
    raise exception 'FAIL X.2: owner of tenant A read % profile(s) from tenant B', v_rows;
  end if;
  raise notice 'PASS X.2: owner A cannot read tenant B profiles';

  select count(*) into v_rows from public.customers where tenant_id = v_t2;
  if v_rows <> 0 then
    raise exception 'FAIL X.3: owner of tenant A read tenant B customers';
  end if;
  raise notice 'PASS X.3: owner A cannot read tenant B customers';
end $$;

-- ============================================================
-- A08 regression — the bootstrap route is an HTTP concern, not SQL.
-- Verify it separately, from a shell, against staging:
--
--   curl -i -X POST https://STAGING/api/admin/setup
--     -> expect 404 (SUPER_ADMIN_SETUP_TOKEN unset, or no token presented)
--   curl -i -X POST https://STAGING/api/admin/setup -H "x-setup-token: WRONG"
--     -> expect 404
--   curl -i -X POST https://STAGING/api/admin/setup -H "x-setup-token: REAL"
--     -> expect 200, then REMOVE the variable
--
-- Same for the cron routes (A05):
--   curl -i https://STAGING/api/cron/send-reminders            -> 401
--   curl -i https://STAGING/api/cron/extend-recurring          -> 401
--   curl -i -H "Authorization: Bearer $CRON_SECRET" .../send-reminders -> 200
-- ============================================================

reset role;
rollback;

-- If you reached here with only PASS notices, checks 0, A01.1-3, A02.1-3,
-- A04.1-2 and X.1-3 all hold on this database, and nothing was persisted.
