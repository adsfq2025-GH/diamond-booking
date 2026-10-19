-- ============================================================
-- Diamond Booking — verification test 01: security (A01, A02, A04)
--
-- Proves the four CRITICAL findings are closed on THIS database.
-- Read-only in effect: it builds a fixture, asserts, and rolls everything back.
-- Safe on production. Safe to re-run.
--
--   RUN THE WHOLE FILE AS ONE STATEMENT. It is a single DO block on purpose.
--
-- Why one block: an earlier version kept the fixture ids in a temp table and
-- wrapped everything in `begin; ... rollback;`. The Supabase SQL editor does
-- not keep those statements in one session — the temp table vanished with
-- `relation "_ids" does not exist` — which also means the explicit transaction
-- was not reliably wrapping anything, so a partial run could have COMMITTED
-- fixture rows. A single DO block is one statement, so Postgres makes it atomic
-- whatever the client does with transactions.
--
-- HOW IT ENDS: with a deliberate exception whose message starts ZTEST COMPLETE.
-- That is the rollback mechanism, not a failure — a statement that raises is
-- rolled back in full, which is exactly what we want here. NOTICEs reach the
-- client as they are emitted, so every result is still visible.
--
--   Success looks like:  a list of PASS lines, then
--                        ERROR: ZTEST COMPLETE — all 13 checks passed...
--   Failure looks like:  some PASS lines, then
--                        ERROR: FAIL <id>: <what went wrong>
--
-- HOW THE IMPERSONATION WORKS, and why it matters: the SQL editor runs as
-- `postgres`, which BYPASSES RLS, so every policy check would pass vacuously.
-- Each section switches to the `authenticated` role and sets request.jwt.claims
-- exactly as PostgREST does. Setting the claims is not optional —
-- guard_profile_identity() treats MISSING claims as a privileged direct
-- connection and would allow the very change being tested for. Check 0 proves
-- the impersonation is live before anything depends on it.
-- ============================================================

do $$
declare
  -- Fixed ids, so nothing has to be shared between statements. The prefix is
  -- distinctive enough that colliding with real data is not a concern, and the
  -- pre-flight check below refuses to run if they already exist.
  c_t1       uuid := 'd1a3d000-0000-4000-8000-00000000a001';  -- tenant A
  c_t2       uuid := 'd1a3d000-0000-4000-8000-00000000b001';  -- tenant B
  c_owner_a  uuid := 'd1a3d000-0000-4000-8000-0000000000a1';
  c_emp_a    uuid := 'd1a3d000-0000-4000-8000-0000000000a2';
  c_cust_a   uuid := 'd1a3d000-0000-4000-8000-0000000000a3';
  c_owner_b  uuid := 'd1a3d000-0000-4000-8000-0000000000b1';

  v_session_role text := current_user;  -- to switch back after impersonating
  v_emp_row  uuid;
  v_cust_row uuid;

  v_seen     uuid;
  v_role     text;
  v_prole    public.user_role;
  v_tenant   uuid;
  v_rows     int;
  v_denied   boolean;
  v_raised   boolean;
  v_settings jsonb;
  v_token    text;
  v_passes   int := 0;
begin
  -- ---------- pre-flight: refuse to run over leftovers ----------
  if exists (select 1 from public.tenants where id in (c_t1, c_t2)) then
    raise exception 'ABORT: fixture tenants already exist, so a previous run committed instead of rolling back. Clean up first, then re-run. See the cleanup query at the bottom of this file.';
  end if;

  -- ---------- fixture (as the session role, which bypasses RLS) ----------
  insert into public.tenants (id, slug, name, industry)
  values (c_t1, 'ztest-tenant-a', 'Ztest Tenant A', 'cleaning'),
         (c_t2, 'ztest-tenant-b', 'Ztest Tenant B', 'cleaning');

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000', c_owner_a, 'authenticated', 'authenticated',
     'ztest-owner-a@example.test', '', now(), '{"provider":"email"}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', c_emp_a, 'authenticated', 'authenticated',
     'ztest-emp-a@example.test', '', now(), '{"provider":"email"}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', c_cust_a, 'authenticated', 'authenticated',
     'ztest-cust-a@example.test', '', now(), '{"provider":"email"}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', c_owner_b, 'authenticated', 'authenticated',
     'ztest-owner-b@example.test', '', now(), '{"provider":"email"}', '{}', now(), now());

  insert into public.profiles (id, tenant_id, role, full_name, email) values
    (c_owner_a, c_t1, 'business_owner', 'Owner A',    'ztest-owner-a@example.test'),
    (c_emp_a,   c_t1, 'employee',       'Employee A', 'ztest-emp-a@example.test'),
    (c_cust_a,  c_t1, 'customer',       'Customer A', 'ztest-cust-a@example.test'),
    (c_owner_b, c_t2, 'business_owner', 'Owner B',    'ztest-owner-b@example.test');

  insert into public.employees (tenant_id, profile_id, display_name, title, active)
  values (c_t1, c_emp_a, 'Employee A', 'Cleaner', true)
  returning id into v_emp_row;

  insert into public.customers (tenant_id, profile_id, full_name, email)
  values (c_t1, c_cust_a, 'Customer A', 'ztest-cust-a@example.test')
  returning id into v_cust_row;

  -- A credential in the place it now belongs.
  insert into public.tenant_secrets (tenant_id, email)
  values (c_t1, '{"provider":"smtp","smtp":{"host":"smtp.example.test","user":"u","pass":"SUPER-SECRET-PASSWORD"}}'::jsonb);

  -- The owner's Google tokens.
  insert into public.google_calendar_connections
    (tenant_id, profile_id, email, access_token, refresh_token)
  values (c_t1, c_owner_a, 'owner-a@gmail.test', 'ACCESS-TOKEN-SECRET', 'REFRESH-TOKEN-SECRET');

  raise notice 'fixture created (ztest-tenant-a / ztest-tenant-b)';

  -- ---------- become a signed-in user ----------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', c_cust_a, 'role', 'authenticated')::text, true);

  -- ============================================================
  -- Check 0 — the impersonation is live
  -- ============================================================
  select auth.uid() into v_seen;
  select public.auth_role()::text into v_role;
  if v_seen is distinct from c_cust_a then
    raise exception 'FAIL check 0: auth.uid() returned %, expected % — impersonation is NOT active, so no RLS result below could be trusted', v_seen, c_cust_a;
  end if;
  if v_role is distinct from 'customer' then
    raise exception 'FAIL check 0: auth_role() returned %, expected customer', v_role;
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS check 0: impersonation active (auth.uid and auth_role resolve to the test customer)';

  -- ============================================================
  -- A01 — no self-granted role, no tenant hop
  -- ============================================================
  -- The assertion is on the OUTCOME, not on which layer refused: an UPDATE
  -- blocked by RLS affects zero rows without raising, and that is an equally
  -- good result.
  v_raised := false;
  begin
    update public.profiles set role = 'super_admin' where id = c_cust_a;
  exception when others then
    v_raised := true;
  end;
  select role into v_prole from public.profiles where id = c_cust_a;
  if v_prole is distinct from 'customer' then
    raise exception 'FAIL A01.1: role is now % — ESCALATION SUCCEEDED', v_prole;
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS A01.1: role still customer (refused by %)',
    case when v_raised then 'the trigger' else 'RLS, no rows affected' end;

  v_raised := false;
  begin
    update public.profiles set tenant_id = c_t2 where id = c_cust_a;
  exception when others then
    v_raised := true;
  end;
  select tenant_id into v_tenant from public.profiles where id = c_cust_a;
  if v_tenant = c_t2 then
    raise exception 'FAIL A01.2: tenant_id changed — LATERAL MOVE SUCCEEDED';
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS A01.2: tenant unchanged (refused by %)',
    case when v_raised then 'the trigger' else 'RLS, no rows affected' end;

  -- The guard must not be over-broad: a benign self-edit still works. This is
  -- the check that would catch a trigger blocking everything.
  update public.profiles set full_name = 'Customer A Renamed' where id = c_cust_a;
  if (select full_name from public.profiles where id = c_cust_a) <> 'Customer A Renamed' then
    raise exception 'FAIL A01.3: a legitimate self-update to full_name did not apply';
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS A01.3: ordinary self-update (full_name) still allowed';

  -- ============================================================
  -- A02 — tenant credentials unreachable from a tenant member
  -- ============================================================
  -- tenant_secrets has RLS with no policies AND `revoke all from anon,
  -- authenticated` (0007). The revoke is stronger and behaves differently: the
  -- SELECT raises 42501 before RLS is consulted, rather than returning zero
  -- rows. Both outcomes pass; the notice says which happened.
  --
  -- If Postgres suggests "GRANT SELECT ON public.tenant_secrets TO
  -- authenticated" — do not follow it. That grant IS the A02 exposure.
  v_denied := false; v_rows := -1;
  begin
    select count(*) into v_rows from public.tenant_secrets;
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied and v_rows <> 0 then
    raise exception 'FAIL A02.1: a customer read % row(s) from tenant_secrets', v_rows;
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS A02.1: customer cannot read tenant_secrets (%)',
    case when v_denied then 'table privilege revoked outright — stronger than an RLS filter'
         else 'RLS returned 0 rows' end;

  select settings into v_settings from public.tenants where id = c_t1;
  if v_settings ? 'email' then
    raise exception 'FAIL A02.2: tenants.settings still contains an "email" key (credentials in a tenant-readable row): %', v_settings -> 'email';
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS A02.2: tenants.settings carries no email credentials';

  -- as an EMPLOYEE
  perform set_config('request.jwt.claims',
    json_build_object('sub', c_emp_a, 'role', 'authenticated')::text, true);

  v_denied := false; v_rows := -1;
  begin
    select count(*) into v_rows from public.tenant_secrets;
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied and v_rows <> 0 then
    raise exception 'FAIL A02.3: an employee read % row(s) from tenant_secrets', v_rows;
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS A02.3: employee cannot read tenant_secrets (%)',
    case when v_denied then 'table privilege revoked outright' else 'RLS returned 0 rows' end;

  -- Writing is refused too, so a client cannot plant a credential somewhere
  -- only the service role is meant to reach.
  v_denied := false;
  begin
    insert into public.tenant_secrets (tenant_id, email)
    values (c_t1, '{"provider":"smtp"}'::jsonb)
    on conflict (tenant_id) do update set email = excluded.email;
  exception when others then
    v_denied := true;   -- any refusal passes; only success is a failure
  end;
  if not v_denied then
    raise exception 'FAIL A02.4: an employee WROTE to tenant_secrets';
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS A02.4: writing to tenant_secrets is refused';

  -- ============================================================
  -- A04 — OAuth tokens are own-row only
  -- ============================================================
  -- still the EMPLOYEE: must not see the OWNER's connection
  select count(*) into v_rows from public.google_calendar_connections;
  if v_rows <> 0 then
    raise exception 'FAIL A04.1: an employee read % calendar connection row(s) belonging to someone else', v_rows;
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS A04.1: employee reads 0 calendar connections of other people';

  -- the OWNER must still see their own
  perform set_config('request.jwt.claims',
    json_build_object('sub', c_owner_a, 'role', 'authenticated')::text, true);

  select access_token into v_token
  from public.google_calendar_connections where profile_id = c_owner_a;
  if v_token is distinct from 'ACCESS-TOKEN-SECRET' then
    raise exception 'FAIL A04.2: the owner cannot read their OWN calendar connection — the policy is too tight';
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS A04.2: owner still reads their own connection';

  -- ============================================================
  -- Cross-tenant isolation (S04 / D09) — asserted by the old docs,
  -- never certified
  -- ============================================================
  select count(*) into v_rows from public.tenants where id = c_t2;
  if v_rows <> 0 then
    raise exception 'FAIL X.1: owner of tenant A read tenant B row';
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS X.1: owner A cannot read tenant B';

  select count(*) into v_rows from public.profiles where tenant_id = c_t2;
  if v_rows <> 0 then
    raise exception 'FAIL X.2: owner of tenant A read % profile(s) from tenant B', v_rows;
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS X.2: owner A cannot read tenant B profiles';

  select count(*) into v_rows from public.customers where tenant_id = c_t2;
  if v_rows <> 0 then
    raise exception 'FAIL X.3: owner of tenant A read tenant B customers';
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS X.3: owner A cannot read tenant B customers';

  -- ---------- back to the session role ----------
  perform set_config('role', v_session_role, true);

  -- ---------- roll everything back ----------
  -- A raising statement is rolled back in full, which is the cleanest way to
  -- guarantee this fixture never persists: no cleanup order, no cascade
  -- surprises, no audit-log noise, and correct even if the client is in
  -- autocommit.
  raise exception 'ZTEST COMPLETE — all % checks passed. This error is intentional: it rolls the fixture back so nothing is persisted.', v_passes;
end $$;

-- ============================================================
-- Cleanup, ONLY if the pre-flight check says a previous run was committed.
-- Normally nothing persists and this is never needed.
--
--   delete from auth.users  where email like 'ztest-%@example.test';
--   delete from public.tenants where slug in ('ztest-tenant-a', 'ztest-tenant-b');
--
-- Confirm with:
--   select slug from public.tenants where slug like 'ztest-%';
-- ============================================================

-- ============================================================
-- Not testable in SQL — verify these from a shell against the deployed app:
--
--   curl -is -X POST https://APP/api/admin/setup                  -> 404 (A08)
--   curl -is -X POST https://APP/api/admin/setup -H "x-setup-token: wrong"
--                                                                 -> 404
--   curl -is https://APP/api/cron/send-reminders                  -> 401 (A05)
--   curl -is https://APP/api/cron/extend-recurring                -> 401 (A05)
--   curl -is -H "Authorization: Bearer $CRON_SECRET" \
--        https://APP/api/cron/send-reminders                      -> 200
-- ============================================================
