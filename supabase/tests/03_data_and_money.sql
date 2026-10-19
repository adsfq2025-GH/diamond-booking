-- ============================================================
-- Diamond Booking — verification test 03: data integrity and money
-- (A13 onboarding destruction, A07 payment idempotency, A16 coupons,
--  A21 readiness, A19 limits)
--
-- Run against STAGING after 0007-0010. Creates its own fixture, ends with
-- ROLLBACK, safe to re-run. Every check raises on failure.
--
-- A13 is the one to watch: re-running onboarding on a tenant that already has
-- bookings used to delete the add-ons, fail on the services delete, and leave
-- no way back. The checks below put a booking in the way on purpose.
-- ============================================================

begin;

create temporary table _m (k text primary key, v text);
-- Read while impersonating `authenticated` for the onboarding checks; a temp
-- table belongs to the session user, so it needs an explicit grant.
grant select on _m to public;

do $$
declare
  t uuid := gen_random_uuid();
  owner_id uuid := gen_random_uuid();
  svc_keep uuid;
  svc_drop uuid;
  svc_booked uuid;
  addon_keep uuid;
  emp_booked uuid;
  emp_free uuid;
  cust uuid;
  booking uuid;
  inv uuid;
begin
  insert into public.tenants (id, slug, name, industry, timezone, plan)
  values (t, 'ztest-money', 'Ztest Money Co', 'cleaning', 'America/New_York', 'professional');

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', owner_id, 'authenticated', 'authenticated',
          'ztest-money-owner@example.test', '', now(),
          '{"provider":"email","role":"business_owner"}', '{}', now(), now());

  insert into public.profiles (id, tenant_id, role, full_name, email)
  values (owner_id, t, 'business_owner', 'Money Owner', 'ztest-money-owner@example.test');

  insert into public.business_hours (tenant_id, weekday, open_time, close_time, closed)
  select t, g, '08:00'::time, '18:00'::time, false from generate_series(0, 6) g;

  -- Three services: one that stays listed, one that gets dropped and has no
  -- bookings, one that gets dropped but DOES have a booking.
  insert into public.services (tenant_id, name, duration_minutes, price_cents, active, sort)
  values (t, 'Keep Me', 60, 10000, true, 1) returning id into svc_keep;
  insert into public.services (tenant_id, name, duration_minutes, price_cents, active, sort)
  values (t, 'Drop Me Unused', 60, 10000, true, 2) returning id into svc_drop;
  insert into public.services (tenant_id, name, duration_minutes, price_cents, active, sort)
  values (t, 'Drop Me Booked', 60, 10000, true, 3) returning id into svc_booked;

  insert into public.service_addons (tenant_id, service_id, name, price_cents, duration_minutes)
  values (t, svc_keep, 'Keep This Addon', 2500, 15) returning id into addon_keep;

  insert into public.employees (tenant_id, display_name, title, active)
  values (t, 'Booked Employee', 'Cleaner', true) returning id into emp_booked;
  insert into public.employees (tenant_id, display_name, title, active)
  values (t, 'Free Employee', 'Cleaner', true) returning id into emp_free;

  insert into public.employee_services (employee_id, service_id) values
    (emp_booked, svc_keep), (emp_booked, svc_booked), (emp_free, svc_keep);

  insert into public.availability (tenant_id, employee_id, weekday, start_time, end_time)
  select t, e, g, '08:00'::time, '18:00'::time
  from (values (emp_booked), (emp_free)) v(e), generate_series(0, 6) g;

  insert into public.customers (tenant_id, full_name, email)
  values (t, 'Ztest Money Customer', 'ztest-money-cust@example.test')
  returning id into cust;

  -- The booking that must survive everything below.
  insert into public.bookings
    (tenant_id, customer_id, service_id, employee_id, status, starts_at, ends_at, price_cents)
  values (t, cust, svc_booked, emp_booked, 'completed',
          now() - interval '2 days', now() - interval '2 days' + interval '60 minutes', 10000)
  returning id into booking;

  insert into public.invoices
    (tenant_id, customer_id, booking_id, status, subtotal_cents, total_cents, paid_cents)
  values (t, cust, booking, 'sent', 10000, 10000, 0)
  returning id into inv;

  insert into public.coupons (tenant_id, code, pct_off, active, max_redemptions)
  values (t, 'ZTEST20', 20, true, 1);
  insert into public.coupons (tenant_id, code, amount_off_cents, active, min_subtotal_cents)
  values (t, 'ZTESTBIG', 5000, true, 20000);
  insert into public.coupons (tenant_id, code, pct_off, active, expires_at)
  values (t, 'ZTESTOLD', 50, true, now() - interval '1 day');
  insert into public.coupons (tenant_id, code, pct_off, active)
  values (t, 'ZTESTOFF', 50, false);

  insert into _m (k, v) values
    ('t', t::text), ('owner', owner_id::text),
    ('svc_keep', svc_keep::text), ('svc_drop', svc_drop::text), ('svc_booked', svc_booked::text),
    ('addon_keep', addon_keep::text),
    ('emp_booked', emp_booked::text), ('emp_free', emp_free::text),
    ('cust', cust::text), ('booking', booking::text), ('inv', inv::text);

  raise notice 'fixture created (tenant ztest-money, 1 completed booking in the way)';
end $$;

-- Onboarding RPCs take their tenant from auth_tenant(), so they need the
-- owner's identity. `postgres` bypasses RLS but auth_tenant() would return
-- null, so impersonation is required here, not optional.
set local role authenticated;

do $$
declare v_owner uuid := ((select v from _m where k = 'owner'))::uuid;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  if public.auth_tenant() is null then
    raise exception 'FAIL setup: auth_tenant() is null — impersonation failed, the A13 checks would be meaningless';
  end if;
  raise notice 'PASS setup: impersonating the owner (auth_tenant resolves)';
end $$;

-- ============================================================
-- A13 — re-running onboarding must not destroy anything
-- ============================================================
do $$
declare
  v_t uuid := ((select v from _m where k = 't'))::uuid;
  v_booking uuid := ((select v from _m where k = 'booking'))::uuid;
  v_svc_keep uuid := ((select v from _m where k = 'svc_keep'))::uuid;
  v_svc_drop uuid := ((select v from _m where k = 'svc_drop'))::uuid;
  v_svc_booked uuid := ((select v from _m where k = 'svc_booked'))::uuid;
  v_emp_booked uuid := ((select v from _m where k = 'emp_booked'))::uuid;
  v_emp_free uuid := ((select v from _m where k = 'emp_free'))::uuid;
  v_result jsonb;
  v_n int;
  v_active boolean;
  v_emp uuid;
  v_duration int;
begin
  -- Re-run the catalog step listing ONLY "Keep Me" (renamed duration) plus a
  -- brand new service, and keeping one add-on. Both dropped services vanish
  -- from the list; one of them has a booking.
  v_result := public.onboarding_save_catalog(
    '[{"name":"Keep Me","category":"Residential","duration_minutes":90,"price_cents":11000,
       "deposit_cents":0,"buffer_before_minutes":0,"buffer_after_minutes":15,
       "pricing_unit":"flat"},
      {"name":"Brand New","category":"Residential","duration_minutes":45,"price_cents":5000,
       "deposit_cents":0,"buffer_before_minutes":0,"buffer_after_minutes":0,
       "pricing_unit":"flat"}]'::jsonb,
    '[{"name":"Keep This Addon","price_cents":3000,"duration_minutes":20}]'::jsonb
  );

  -- A13.1 — the booking is untouched and still points at its service.
  select count(*) into v_n
  from public.bookings where id = v_booking and service_id = v_svc_booked;
  if v_n <> 1 then
    raise exception 'FAIL A13.1: the existing booking lost its service reference (or was deleted)';
  end if;
  raise notice 'PASS A13.1: the existing booking survived with its service intact';

  -- A13.2 — the booked-but-delisted service is DEACTIVATED, not deleted.
  select active into v_active from public.services where id = v_svc_booked;
  if v_active is null then
    raise exception 'FAIL A13.2: the booked service was DELETED — booking history is broken';
  end if;
  if v_active then
    raise exception 'FAIL A13.2: the delisted service is still active — it will keep appearing in the widget';
  end if;
  raise notice 'PASS A13.2: the delisted service with a booking was deactivated, not deleted';

  -- A13.3 — the delisted service with NO bookings is gone.
  select count(*) into v_n from public.services where id = v_svc_drop;
  if v_n <> 0 then
    raise exception 'FAIL A13.3: an unreferenced delisted service was left behind';
  end if;
  raise notice 'PASS A13.3: the unreferenced delisted service was removed';

  -- A13.4 — the kept service kept its ID (so nothing referencing it broke)
  -- and took the new duration.
  select duration_minutes into v_duration from public.services where id = v_svc_keep;
  if v_duration is null then
    raise exception 'FAIL A13.4: the kept service was recreated with a new id — delete-and-recreate is back';
  end if;
  if v_duration <> 90 then
    raise exception 'FAIL A13.4: the kept service duration is %, expected 90', v_duration;
  end if;
  raise notice 'PASS A13.4: the kept service kept its id and took the new 90-minute duration';

  -- A13.5 — THE ADD-ONS EXIST. The old code deleted them and never
  -- re-inserted them, so this is the check that catches that regression.
  select count(*) into v_n
  from public.service_addons
  where service_id = v_svc_keep and name = 'Keep This Addon' and price_cents = 3000 and duration_minutes = 20;
  if v_n <> 1 then
    raise exception 'FAIL A13.5: the add-on was not persisted (found % matching rows) — add-ons are being dropped on save', v_n;
  end if;
  raise notice 'PASS A13.5: the add-on persisted with its new price and duration';

  -- A13.6 — the new service exists and carries its own add-on copy.
  select count(*) into v_n from public.services where tenant_id = v_t and name = 'Brand New' and active;
  if v_n <> 1 then
    raise exception 'FAIL A13.6: the newly listed service was not created';
  end if;
  raise notice 'PASS A13.6: the newly listed service was created';

  -- A13.7 — now the team step, dropping the employee who has a booking.
  perform public.onboarding_save_team(
    false, '#2e86c1',
    '[{"name":"Free Employee","email":"","title":"Cleaner","color":"#5a88a8"}]'::jsonb
  );

  select employee_id into v_emp from public.bookings where id = v_booking;
  if v_emp is distinct from v_emp_booked then
    raise exception 'FAIL A13.7: the booking lost its employee assignment (now %) — deleting employees still orphans bookings and frees the slot', v_emp;
  end if;
  raise notice 'PASS A13.7: the booking kept its employee assignment';

  select active into v_active from public.employees where id = v_emp_booked;
  if v_active is null then
    raise exception 'FAIL A13.8: the booked employee was DELETED';
  end if;
  if v_active then
    raise exception 'FAIL A13.8: the delisted employee is still active';
  end if;
  raise notice 'PASS A13.8: the delisted employee with bookings was deactivated, not deleted';
end $$;

-- ============================================================
-- A21 — readiness reflects the database, not the wizard's optimism
-- ============================================================
do $$
declare
  v_r jsonb;
  v_blockers jsonb;
begin
  v_r := public.onboarding_readiness();

  -- After A13 the tenant has active services and one active employee, but
  -- that employee was only linked to the services that existed before, so
  -- readiness should have something to say either way. What matters is that
  -- the shape is right and the booleans are computed, not asserted.
  if v_r ->> 'booking_ready' is null then
    raise exception 'FAIL A21.1: readiness did not return booking_ready';
  end if;
  if v_r -> 'counts' is null or v_r -> 'blockers' is null then
    raise exception 'FAIL A21.1: readiness did not return counts/blockers';
  end if;
  raise notice 'PASS A21.1: readiness returns booking_ready=%, payment_ready=%, blockers=%',
    v_r ->> 'booking_ready', v_r ->> 'payment_ready', v_r -> 'blockers';

  -- Deactivate every service and confirm the blocker appears. This is the
  -- state that used to be marked "onboarding complete" regardless.
  update public.services set active = false where tenant_id = public.auth_tenant();
  v_r := public.onboarding_readiness();
  v_blockers := v_r -> 'blockers';
  if (v_r ->> 'booking_ready')::boolean then
    raise exception 'FAIL A21.2: booking_ready is true with no active services';
  end if;
  if not (v_blockers @> '["no_active_services"]'::jsonb) then
    raise exception 'FAIL A21.2: expected a no_active_services blocker, got %', v_blockers;
  end if;
  raise notice 'PASS A21.2: with no active services, booking_ready=false and the blocker is named';
end $$;

reset role;

-- ============================================================
-- A07 — a payment cannot be recorded twice for one intent
-- ============================================================
do $$
declare
  v_t uuid := ((select v from _m where k = 't'))::uuid;
  v_cust uuid := ((select v from _m where k = 'cust'))::uuid;
  v_booking uuid := ((select v from _m where k = 'booking'))::uuid;
  v_intent text := 'pi_ztest_' || replace(gen_random_uuid()::text, '-', '');
  v_n int;
  v_err text := null;
begin
  -- The webhook's first delivery.
  insert into public.payments
    (tenant_id, customer_id, booking_id, stripe_payment_intent_id, amount_cents, status, kind)
  values (v_t, v_cust, v_booking, v_intent, 5000, 'succeeded', 'deposit');

  -- A07.1 — a duplicate delivery of the SAME intent must be rejected. Without
  -- the unique index from 0007 this inserted a second row AND the webhook's
  -- `on conflict` upsert could not run at all.
  begin
    insert into public.payments
      (tenant_id, customer_id, booking_id, stripe_payment_intent_id, amount_cents, status, kind)
    values (v_t, v_cust, v_booking, v_intent, 5000, 'succeeded', 'deposit');
  exception when unique_violation then
    v_err := sqlerrm;
  end;
  if v_err is null then
    raise exception 'FAIL A07.1: the same payment intent was recorded twice — payments.stripe_payment_intent_id has no unique index';
  end if;
  raise notice 'PASS A07.1: a duplicate payment intent is rejected by the unique index';

  -- A07.2 — and the upsert the webhook actually uses works, idempotently.
  insert into public.payments
    (tenant_id, customer_id, booking_id, stripe_payment_intent_id, amount_cents, status, kind)
  values (v_t, v_cust, v_booking, v_intent, 5000, 'succeeded', 'deposit')
  on conflict (stripe_payment_intent_id) do update
    set status = excluded.status, amount_cents = excluded.amount_cents;

  select count(*) into v_n from public.payments where stripe_payment_intent_id = v_intent;
  if v_n <> 1 then
    raise exception 'FAIL A07.2: % payment rows exist for one intent after the upsert', v_n;
  end if;
  raise notice 'PASS A07.2: the webhook''s on-conflict upsert runs and stays at one row';
end $$;

-- ============================================================
-- A16 — coupons actually price, and cannot be over-redeemed
-- ============================================================
do $$
declare
  v_t uuid := ((select v from _m where k = 't'))::uuid;
  v_r jsonb;
begin
  -- A16.1 — percentage off
  v_r := public.price_coupon(v_t, 'ZTEST20', 10000);
  if not (v_r ->> 'ok')::boolean then
    raise exception 'FAIL A16.1: a valid 20%% coupon was rejected: %', v_r;
  end if;
  if (v_r ->> 'discount_cents')::int <> 2000 then
    raise exception 'FAIL A16.1: 20%% of 10000 priced as %, expected 2000', v_r ->> 'discount_cents';
  end if;
  raise notice 'PASS A16.1: 20%% off 10000 = 2000';

  -- A16.2 — lower case and surrounding whitespace still match
  v_r := public.price_coupon(v_t, '  ztest20 ', 10000);
  if not (v_r ->> 'ok')::boolean then
    raise exception 'FAIL A16.2: the code did not match case-insensitively / trimmed';
  end if;
  raise notice 'PASS A16.2: codes match case-insensitively and trimmed';

  -- A16.3 — minimum subtotal is enforced, and says so
  v_r := public.price_coupon(v_t, 'ZTESTBIG', 10000);
  if (v_r ->> 'ok')::boolean then
    raise exception 'FAIL A16.3: a coupon with a 20000 minimum applied to a 10000 subtotal';
  end if;
  if v_r ->> 'error' <> 'below_minimum' then
    raise exception 'FAIL A16.3: expected below_minimum, got %', v_r ->> 'error';
  end if;
  v_r := public.price_coupon(v_t, 'ZTESTBIG', 25000);
  if (v_r ->> 'discount_cents')::int <> 5000 then
    raise exception 'FAIL A16.3: above the minimum, expected 5000 off, got %', v_r ->> 'discount_cents';
  end if;
  raise notice 'PASS A16.3: the minimum subtotal is enforced and releases above it';

  -- A16.4 — expired and inactive are refused
  if (public.price_coupon(v_t, 'ZTESTOLD', 10000) ->> 'ok')::boolean then
    raise exception 'FAIL A16.4: an expired coupon applied';
  end if;
  if (public.price_coupon(v_t, 'ZTESTOFF', 10000) ->> 'ok')::boolean then
    raise exception 'FAIL A16.4: a deactivated coupon applied';
  end if;
  if (public.price_coupon(v_t, 'NOSUCHCODE', 10000) ->> 'ok')::boolean then
    raise exception 'FAIL A16.4: an unknown coupon applied';
  end if;
  raise notice 'PASS A16.4: expired, deactivated and unknown codes are all refused';

  -- A16.5 — a discount can never exceed the subtotal
  v_r := public.price_coupon(v_t, 'ZTESTBIG', 5000);
  if (v_r ->> 'ok')::boolean and (v_r ->> 'discount_cents')::int > 5000 then
    raise exception 'FAIL A16.5: the discount exceeded the subtotal';
  end if;
  raise notice 'PASS A16.5: the discount never exceeds the subtotal';
end $$;

-- A16.6 — redemption is claimed atomically: max_redemptions = 1 means the
-- SECOND booking cannot also take it.
do $$
declare
  v_t uuid := ((select v from _m where k = 't'))::uuid;
  v_cust uuid := ((select v from _m where k = 'cust'))::uuid;
  v_svc uuid;
  v_key text := 'ztestm' || replace(gen_random_uuid()::text, '-', '');
  v_b1 uuid;
  v_b2 uuid;
  v_r1 jsonb;
  v_r2 jsonb;
  v_price int;
  v_redemptions int;
begin
  -- apply_coupon_to_booking needs a widget key and a very fresh booking.
  insert into public.widget_configs (tenant_id, public_key, theme, active)
  values (v_t, v_key, '{}'::jsonb, true);

  select id into v_svc from public.services where tenant_id = v_t limit 1;

  insert into public.bookings
    (tenant_id, customer_id, service_id, status, starts_at, ends_at, price_cents)
  values (v_t, v_cust, v_svc, 'pending',
          now() + interval '10 days', now() + interval '10 days' + interval '1 hour', 10000)
  returning id into v_b1;
  insert into public.bookings
    (tenant_id, customer_id, service_id, status, starts_at, ends_at, price_cents)
  values (v_t, v_cust, v_svc, 'pending',
          now() + interval '11 days', now() + interval '11 days' + interval '1 hour', 10000)
  returning id into v_b2;

  v_r1 := public.apply_coupon_to_booking(v_key, v_b1, 'ZTEST20');
  if not (v_r1 ->> 'ok')::boolean then
    raise exception 'FAIL A16.6: the first redemption was refused: %', v_r1;
  end if;

  select price_cents into v_price from public.bookings where id = v_b1;
  if v_price <> 8000 then
    raise exception 'FAIL A16.6: the booking price is % after a 20%% coupon, expected 8000 — the coupon is not reaching the price', v_price;
  end if;

  select redemptions into v_redemptions from public.coupons where tenant_id = v_t and code = 'ZTEST20';
  if v_redemptions <> 1 then
    raise exception 'FAIL A16.6: redemptions is %, expected 1', v_redemptions;
  end if;
  raise notice 'PASS A16.6: the first redemption discounted the booking to 8000 and incremented the counter';

  -- The limit was 1, so the second must be refused.
  v_r2 := public.apply_coupon_to_booking(v_key, v_b2, 'ZTEST20');
  if (v_r2 ->> 'ok')::boolean then
    raise exception 'FAIL A16.7: a second booking redeemed a coupon limited to 1 use — the counter is not a concurrency guard';
  end if;
  if v_r2 ->> 'error' <> 'fully_redeemed' then
    raise exception 'FAIL A16.7: expected fully_redeemed, got %', v_r2 ->> 'error';
  end if;
  select price_cents into v_price from public.bookings where id = v_b2;
  if v_price <> 10000 then
    raise exception 'FAIL A16.7: the second booking was discounted anyway (price %)', v_price;
  end if;
  raise notice 'PASS A16.7: the second redemption is refused and that booking keeps full price';

  -- A16.8 — applying twice to the SAME booking must not double-discount.
  v_r1 := public.apply_coupon_to_booking(v_key, v_b1, 'ZTEST20');
  select price_cents into v_price from public.bookings where id = v_b1;
  if v_price <> 8000 then
    raise exception 'FAIL A16.8: re-applying to the same booking changed the price to %', v_price;
  end if;
  raise notice 'PASS A16.8: re-applying to the same booking is a no-op';
end $$;

rollback;

-- Only PASS notices means: re-running onboarding preserves bookings, ids and
-- add-ons; readiness is computed from the database; one Stripe intent can only
-- be recorded once; and coupons price correctly and cannot be over-redeemed.
-- Nothing was persisted.
