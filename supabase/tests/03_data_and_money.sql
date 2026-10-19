-- ============================================================
-- Diamond Booking — verification test 03: data integrity and money
-- (A13 onboarding destruction, A21 readiness, A07 payment idempotency,
--  A16 coupon pricing and redemption limits)
--
--   RUN THE WHOLE FILE AS ONE STATEMENT. Single DO block, same reasoning as
--   01 and 02. Ends by raising 'ZTEST COMPLETE', which IS the rollback.
--
-- A13 is the one to watch: re-running onboarding on a tenant that already has
-- bookings used to delete the add-ons, fail on the services delete, and leave
-- no way back. The fixture puts a completed booking in the way on purpose.
--
-- The onboarding RPCs take their tenant from auth_tenant(), so this file
-- impersonates the owner for that section. `postgres` bypasses RLS but
-- auth_tenant() would return null, which would make those checks meaningless.
-- ============================================================

do $$
declare
  c_t          uuid := 'd1a3d000-0000-4000-8000-00000000d001';
  c_owner      uuid := 'd1a3d000-0000-4000-8000-0000000000d1';
  c_svc_keep   uuid := 'd1a3d000-0000-4000-8000-0000000000d2';
  c_svc_drop   uuid := 'd1a3d000-0000-4000-8000-0000000000d3';
  c_svc_booked uuid := 'd1a3d000-0000-4000-8000-0000000000d4';
  c_addon      uuid := 'd1a3d000-0000-4000-8000-0000000000d5';
  c_emp_booked uuid := 'd1a3d000-0000-4000-8000-0000000000d6';
  c_emp_free   uuid := 'd1a3d000-0000-4000-8000-0000000000d7';
  c_cust       uuid := 'd1a3d000-0000-4000-8000-0000000000d8';
  c_booking    uuid := 'd1a3d000-0000-4000-8000-0000000000d9';
  c_b1         uuid := 'd1a3d000-0000-4000-8000-0000000000da';
  c_b2         uuid := 'd1a3d000-0000-4000-8000-0000000000db';
  c_key        text := 'ztestmoney00000000000000000';

  v_session_role text := current_user;
  v_inv      uuid;
  v_intent   text := 'pi_ztest_0000000000000000000000';
  v_n        int;
  v_active   boolean;
  v_emp      uuid;
  v_duration int;
  v_price    int;
  v_redeem   int;
  v_r        jsonb;
  v_blockers jsonb;
  v_err      text;
  v_passes   int := 0;
begin
  -- ---------- pre-flight ----------
  if exists (select 1 from public.tenants where id = c_t) then
    raise exception 'ABORT: fixture tenant already exists, so a previous run committed. Clean up (see the bottom of this file) and re-run.';
  end if;

  -- ---------- fixture ----------
  insert into public.tenants (id, slug, name, industry, timezone, plan)
  values (c_t, 'ztest-money', 'Ztest Money Co', 'cleaning', 'America/New_York', 'professional');

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', c_owner, 'authenticated', 'authenticated',
          'ztest-money-owner@example.test', '', now(), '{"provider":"email"}', '{}', now(), now());

  insert into public.profiles (id, tenant_id, role, full_name, email)
  values (c_owner, c_t, 'business_owner', 'Money Owner', 'ztest-money-owner@example.test');

  insert into public.business_hours (tenant_id, weekday, open_time, close_time, closed)
  select c_t, g, '08:00'::time, '18:00'::time, false from generate_series(0, 6) g;

  -- Three services: one stays listed, one is dropped with no bookings, one is
  -- dropped but HAS a booking.
  insert into public.services (id, tenant_id, name, duration_minutes, price_cents, active, sort)
  values (c_svc_keep,   c_t, 'Keep Me',        60, 10000, true, 1),
         (c_svc_drop,   c_t, 'Drop Me Unused', 60, 10000, true, 2),
         (c_svc_booked, c_t, 'Drop Me Booked', 60, 10000, true, 3);

  insert into public.service_addons (id, tenant_id, service_id, name, price_cents, duration_minutes)
  values (c_addon, c_t, c_svc_keep, 'Keep This Addon', 2500, 15);

  insert into public.employees (id, tenant_id, display_name, title, active)
  values (c_emp_booked, c_t, 'Booked Employee', 'Cleaner', true),
         (c_emp_free,   c_t, 'Free Employee',   'Cleaner', true);

  insert into public.employee_services (employee_id, service_id) values
    (c_emp_booked, c_svc_keep), (c_emp_booked, c_svc_booked), (c_emp_free, c_svc_keep);

  insert into public.availability (tenant_id, employee_id, weekday, start_time, end_time)
  select c_t, e, g, '08:00'::time, '18:00'::time
  from (values (c_emp_booked), (c_emp_free)) v(e), generate_series(0, 6) g;

  insert into public.customers (id, tenant_id, full_name, email)
  values (c_cust, c_t, 'Ztest Money Customer', 'ztest-money-cust@example.test');

  -- The booking that must survive everything below.
  insert into public.bookings
    (id, tenant_id, customer_id, service_id, employee_id, status, starts_at, ends_at, price_cents)
  values (c_booking, c_t, c_cust, c_svc_booked, c_emp_booked, 'completed',
          now() - interval '2 days', now() - interval '2 days' + interval '60 minutes', 10000);

  insert into public.invoices
    (tenant_id, customer_id, booking_id, status, subtotal_cents, total_cents, paid_cents)
  values (c_t, c_cust, c_booking, 'sent', 10000, 10000, 0)
  returning id into v_inv;

  insert into public.coupons (tenant_id, code, pct_off, active, max_redemptions)
  values (c_t, 'ZTEST20', 20, true, 1);
  insert into public.coupons (tenant_id, code, amount_off_cents, active, min_subtotal_cents)
  values (c_t, 'ZTESTBIG', 5000, true, 20000);
  insert into public.coupons (tenant_id, code, pct_off, active, expires_at)
  values (c_t, 'ZTESTOLD', 50, true, now() - interval '1 day');
  insert into public.coupons (tenant_id, code, pct_off, active)
  values (c_t, 'ZTESTOFF', 50, false);

  insert into public.widget_configs (tenant_id, public_key, theme, active)
  values (c_t, c_key, '{}'::jsonb, true);

  raise notice 'fixture created (tenant ztest-money, 1 completed booking in the way)';

  -- ---------- impersonate the owner for the onboarding RPCs ----------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', c_owner, 'role', 'authenticated')::text, true);

  if public.auth_tenant() is null then
    raise exception 'FAIL setup: auth_tenant() is null — impersonation failed, so the A13 checks would be meaningless';
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS setup: impersonating the owner (auth_tenant resolves)';

  -- ============================================================
  -- A13 — re-running onboarding must not destroy anything
  -- ============================================================
  -- List only "Keep Me" (with a new duration) plus a brand new service. Both
  -- dropped services vanish from the list; one of them has a booking.
  perform public.onboarding_save_catalog(
    '[{"name":"Keep Me","category":"Residential","duration_minutes":90,"price_cents":11000,
       "deposit_cents":0,"buffer_before_minutes":0,"buffer_after_minutes":15,"pricing_unit":"flat"},
      {"name":"Brand New","category":"Residential","duration_minutes":45,"price_cents":5000,
       "deposit_cents":0,"buffer_before_minutes":0,"buffer_after_minutes":0,"pricing_unit":"flat"}]'::jsonb,
    '[{"name":"Keep This Addon","price_cents":3000,"duration_minutes":20}]'::jsonb);

  select count(*) into v_n
  from public.bookings where id = c_booking and service_id = c_svc_booked;
  if v_n <> 1 then
    raise exception 'FAIL A13.1: the existing booking lost its service reference (or was deleted)';
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS A13.1: the existing booking survived with its service intact';

  select active into v_active from public.services where id = c_svc_booked;
  if v_active is null then
    raise exception 'FAIL A13.2: the booked service was DELETED — booking history is broken';
  end if;
  if v_active then
    raise exception 'FAIL A13.2: the delisted service is still active — it will keep appearing in the widget';
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS A13.2: the delisted service with a booking was deactivated, not deleted';

  select count(*) into v_n from public.services where id = c_svc_drop;
  if v_n <> 0 then
    raise exception 'FAIL A13.3: an unreferenced delisted service was left behind';
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS A13.3: the unreferenced delisted service was removed';

  select duration_minutes into v_duration from public.services where id = c_svc_keep;
  if v_duration is null then
    raise exception 'FAIL A13.4: the kept service was recreated with a new id — delete-and-recreate is back';
  end if;
  if v_duration <> 90 then
    raise exception 'FAIL A13.4: the kept service duration is %, expected 90', v_duration;
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS A13.4: the kept service kept its id and took the new 90-minute duration';

  -- THE ADD-ONS EXIST. The old code deleted them and never re-inserted them,
  -- so this is the check that catches that regression.
  select count(*) into v_n
  from public.service_addons
  where service_id = c_svc_keep and name = 'Keep This Addon'
    and price_cents = 3000 and duration_minutes = 20;
  if v_n <> 1 then
    raise exception 'FAIL A13.5: the add-on was not persisted (% matching rows) — add-ons are being dropped on save', v_n;
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS A13.5: the add-on persisted with its new price and duration';

  select count(*) into v_n
  from public.services where tenant_id = c_t and name = 'Brand New' and active;
  if v_n <> 1 then
    raise exception 'FAIL A13.6: the newly listed service was not created';
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS A13.6: the newly listed service was created';

  -- Now the team step, dropping the employee who has a booking.
  perform public.onboarding_save_team(
    false, '#2e86c1',
    '[{"name":"Free Employee","email":"","title":"Cleaner","color":"#5a88a8"}]'::jsonb);

  select employee_id into v_emp from public.bookings where id = c_booking;
  if v_emp is distinct from c_emp_booked then
    raise exception 'FAIL A13.7: the booking lost its employee assignment (now %) — deleting employees still orphans bookings and frees the slot', v_emp;
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS A13.7: the booking kept its employee assignment';

  select active into v_active from public.employees where id = c_emp_booked;
  if v_active is null then
    raise exception 'FAIL A13.8: the booked employee was DELETED';
  end if;
  if v_active then
    raise exception 'FAIL A13.8: the delisted employee is still active';
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS A13.8: the delisted employee with bookings was deactivated, not deleted';

  -- ============================================================
  -- A21 — readiness reflects the database, not the wizard's optimism
  -- ============================================================
  v_r := public.onboarding_readiness();
  if v_r ->> 'booking_ready' is null or v_r -> 'counts' is null or v_r -> 'blockers' is null then
    raise exception 'FAIL A21.1: readiness did not return the expected shape: %', v_r;
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS A21.1: readiness returns booking_ready=%, payment_ready=%, blockers=%',
    v_r ->> 'booking_ready', v_r ->> 'payment_ready', v_r -> 'blockers';

  -- Deactivate every service and confirm the blocker appears. This is the
  -- state that used to be marked "onboarding complete" regardless.
  update public.services set active = false where tenant_id = c_t;
  v_r := public.onboarding_readiness();
  v_blockers := v_r -> 'blockers';
  if (v_r ->> 'booking_ready')::boolean then
    raise exception 'FAIL A21.2: booking_ready is true with no active services';
  end if;
  if not (v_blockers @> '["no_active_services"]'::jsonb) then
    raise exception 'FAIL A21.2: expected a no_active_services blocker, got %', v_blockers;
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS A21.2: with no active services, booking_ready=false and the blocker is named';

  -- Put them back for the coupon section.
  update public.services set active = true where tenant_id = c_t;

  -- ---------- back to the session role for the ledger checks ----------
  perform set_config('role', v_session_role, true);

  -- ============================================================
  -- A07 — a payment cannot be recorded twice for one intent
  -- ============================================================
  insert into public.payments
    (tenant_id, customer_id, booking_id, stripe_payment_intent_id, amount_cents, status, kind)
  values (c_t, c_cust, c_booking, v_intent, 5000, 'succeeded', 'deposit');

  v_err := null;
  begin
    insert into public.payments
      (tenant_id, customer_id, booking_id, stripe_payment_intent_id, amount_cents, status, kind)
    values (c_t, c_cust, c_booking, v_intent, 5000, 'succeeded', 'deposit');
  exception when unique_violation then
    v_err := sqlerrm;
  end;
  if v_err is null then
    raise exception 'FAIL A07.1: the same payment intent was recorded twice — payments.stripe_payment_intent_id has no unique index';
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS A07.1: a duplicate payment intent is rejected by the unique index';

  -- And the upsert the webhook actually uses works, idempotently.
  insert into public.payments
    (tenant_id, customer_id, booking_id, stripe_payment_intent_id, amount_cents, status, kind)
  values (c_t, c_cust, c_booking, v_intent, 5000, 'succeeded', 'deposit')
  on conflict (stripe_payment_intent_id) do update
    set status = excluded.status, amount_cents = excluded.amount_cents;

  select count(*) into v_n from public.payments where stripe_payment_intent_id = v_intent;
  if v_n <> 1 then
    raise exception 'FAIL A07.2: % payment rows exist for one intent after the upsert', v_n;
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS A07.2: the webhook on-conflict upsert runs and stays at one row';

  -- ============================================================
  -- A16 — coupons actually price, and cannot be over-redeemed
  -- ============================================================
  v_r := public.price_coupon(c_t, 'ZTEST20', 10000);
  if not (v_r ->> 'ok')::boolean then
    raise exception 'FAIL A16.1: a valid 20 percent coupon was rejected: %', v_r;
  end if;
  if (v_r ->> 'discount_cents')::int <> 2000 then
    raise exception 'FAIL A16.1: 20 percent of 10000 priced as %, expected 2000', v_r ->> 'discount_cents';
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS A16.1: 20 percent off 10000 = 2000';

  if not (public.price_coupon(c_t, '  ztest20 ', 10000) ->> 'ok')::boolean then
    raise exception 'FAIL A16.2: the code did not match case-insensitively / trimmed';
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS A16.2: codes match case-insensitively and trimmed';

  v_r := public.price_coupon(c_t, 'ZTESTBIG', 10000);
  if (v_r ->> 'ok')::boolean then
    raise exception 'FAIL A16.3: a coupon with a 20000 minimum applied to a 10000 subtotal';
  end if;
  if v_r ->> 'error' <> 'below_minimum' then
    raise exception 'FAIL A16.3: expected below_minimum, got %', v_r ->> 'error';
  end if;
  if (public.price_coupon(c_t, 'ZTESTBIG', 25000) ->> 'discount_cents')::int <> 5000 then
    raise exception 'FAIL A16.3: above the minimum, expected 5000 off';
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS A16.3: the minimum subtotal is enforced and releases above it';

  if (public.price_coupon(c_t, 'ZTESTOLD', 10000) ->> 'ok')::boolean then
    raise exception 'FAIL A16.4: an expired coupon applied';
  end if;
  if (public.price_coupon(c_t, 'ZTESTOFF', 10000) ->> 'ok')::boolean then
    raise exception 'FAIL A16.4: a deactivated coupon applied';
  end if;
  if (public.price_coupon(c_t, 'NOSUCHCODE', 10000) ->> 'ok')::boolean then
    raise exception 'FAIL A16.4: an unknown coupon applied';
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS A16.4: expired, deactivated and unknown codes are all refused';

  v_r := public.price_coupon(c_t, 'ZTESTBIG', 5000);
  if (v_r ->> 'ok')::boolean and (v_r ->> 'discount_cents')::int > 5000 then
    raise exception 'FAIL A16.5: the discount exceeded the subtotal';
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS A16.5: the discount never exceeds the subtotal';

  -- Redemption is claimed atomically: max_redemptions = 1 means the SECOND
  -- booking cannot also take it.
  insert into public.bookings
    (id, tenant_id, customer_id, service_id, status, starts_at, ends_at, price_cents)
  values (c_b1, c_t, c_cust, c_svc_keep, 'pending',
          now() + interval '10 days', now() + interval '10 days' + interval '1 hour', 10000),
         (c_b2, c_t, c_cust, c_svc_keep, 'pending',
          now() + interval '11 days', now() + interval '11 days' + interval '1 hour', 10000);

  v_r := public.apply_coupon_to_booking(c_key, c_b1, 'ZTEST20');
  if not (v_r ->> 'ok')::boolean then
    raise exception 'FAIL A16.6: the first redemption was refused: %', v_r;
  end if;
  select price_cents into v_price from public.bookings where id = c_b1;
  if v_price <> 8000 then
    raise exception 'FAIL A16.6: the booking price is % after a 20 percent coupon, expected 8000 — the coupon is not reaching the price', v_price;
  end if;
  select redemptions into v_redeem from public.coupons where tenant_id = c_t and code = 'ZTEST20';
  if v_redeem <> 1 then
    raise exception 'FAIL A16.6: redemptions is %, expected 1', v_redeem;
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS A16.6: the first redemption discounted the booking to 8000 and incremented the counter';

  v_r := public.apply_coupon_to_booking(c_key, c_b2, 'ZTEST20');
  if (v_r ->> 'ok')::boolean then
    raise exception 'FAIL A16.7: a second booking redeemed a coupon limited to 1 use — the counter is not a concurrency guard';
  end if;
  if v_r ->> 'error' <> 'fully_redeemed' then
    raise exception 'FAIL A16.7: expected fully_redeemed, got %', v_r ->> 'error';
  end if;
  select price_cents into v_price from public.bookings where id = c_b2;
  if v_price <> 10000 then
    raise exception 'FAIL A16.7: the second booking was discounted anyway (price %)', v_price;
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS A16.7: the second redemption is refused and that booking keeps full price';

  -- Applying twice to the SAME booking must not double-discount.
  perform public.apply_coupon_to_booking(c_key, c_b1, 'ZTEST20');
  select price_cents into v_price from public.bookings where id = c_b1;
  if v_price <> 8000 then
    raise exception 'FAIL A16.8: re-applying to the same booking changed the price to %', v_price;
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS A16.8: re-applying to the same booking is a no-op';

  -- ---------- roll everything back ----------
  raise exception 'ZTEST COMPLETE — all % checks passed. This error is intentional: it rolls the fixture back so nothing is persisted.', v_passes;
end $$;

-- ============================================================
-- Cleanup, ONLY if the pre-flight check says a previous run committed:
--
--   delete from auth.users   where email = 'ztest-money-owner@example.test';
--   delete from public.tenants where slug = 'ztest-money';
--
-- Confirm with:
--   select slug from public.tenants where slug like 'ztest-%';
-- ============================================================
