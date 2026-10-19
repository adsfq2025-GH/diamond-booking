-- ============================================================
-- Diamond Booking — verification test 02: booking correctness
-- (A09 add-on duration, A10 buffers, A11 capacity, A28 error codes)
--
--   RUN THE WHOLE FILE AS ONE STATEMENT. Single DO block, same reasoning as
--   01: the SQL editor does not keep separate statements in one session, so a
--   temp table disappears and a begin/rollback wrapper cannot be relied on to
--   undo a fixture. One statement is atomic by construction.
--
-- Ends by raising 'ZTEST COMPLETE', which IS the rollback. NOTICEs still
-- arrive, so every PASS is visible.
--
-- The headline check is A10.2: a job ending 11:30 whose service carries a
-- 30-minute after-buffer must NOT leave 11:30 bookable. That is the exact
-- defect the live audit observed, and the one most likely to regress.
--
-- These RPCs are SECURITY DEFINER and keyed by the widget public_key, so they
-- are called the way the anonymous widget calls them — no impersonation needed.
-- ============================================================

do $$
declare
  c_t        uuid := 'd1a3d000-0000-4000-8000-00000000c001';
  c_svc      uuid := 'd1a3d000-0000-4000-8000-0000000000c1';  -- 60 min, 30 after-buffer
  c_svc_nb   uuid := 'd1a3d000-0000-4000-8000-0000000000c2';  -- 60 min, no buffers
  c_svc_orph uuid := 'd1a3d000-0000-4000-8000-0000000000c3';  -- nobody qualified
  c_addon    uuid := 'd1a3d000-0000-4000-8000-0000000000c4';  -- +30 min
  c_emp1     uuid := 'd1a3d000-0000-4000-8000-0000000000c5';
  c_emp2     uuid := 'd1a3d000-0000-4000-8000-0000000000c6';
  c_cust     uuid := 'd1a3d000-0000-4000-8000-0000000000c7';
  c_key      text := 'ztestbooking0000000000000000';

  v_tz       text := 'America/New_York';
  -- Fixed weekdays well in the future, one per section, so "now" never
  -- interferes and the sections cannot affect each other.
  d_addon    date := (date_trunc('week', now() + interval '3 weeks') + interval '2 days')::date;
  d_buffer   date := (date_trunc('week', now() + interval '4 weeks') + interval '2 days')::date;
  d_cap      date := (date_trunc('week', now() + interval '5 weeks') + interval '2 days')::date;
  d_err      date := (date_trunc('week', now() + interval '6 weeks') + interval '2 days')::date;

  v_last     time;
  v_len      interval;
  v_result   jsonb;
  v_first    jsonb;
  v_second   jsonb;
  v_offered  int;
  v_rows     int;
  v_distinct int;
  v_start    timestamptz;
  v_err      text;
  v_passes   int := 0;
begin
  -- ---------- pre-flight ----------
  if exists (select 1 from public.tenants where id = c_t) then
    raise exception 'ABORT: fixture tenant already exists, so a previous run committed. Clean up (see the bottom of this file) and re-run.';
  end if;

  -- ---------- fixture ----------
  insert into public.tenants (id, slug, name, industry, timezone, settings)
  values (c_t, 'ztest-booking', 'Ztest Booking Co', 'cleaning', v_tz,
          '{"auto_confirm":true}'::jsonb);

  -- Open every weekday 08:00-18:00 so nothing depends on which day it is.
  insert into public.business_hours (tenant_id, weekday, open_time, close_time, closed)
  select c_t, g, '08:00'::time, '18:00'::time, false from generate_series(0, 6) g;

  insert into public.services
    (id, tenant_id, name, duration_minutes, price_cents,
     buffer_before_minutes, buffer_after_minutes, active, sort)
  values
    (c_svc,      c_t, 'Ztest Standard',  60, 10000, 0, 30, true, 1),
    (c_svc_nb,   c_t, 'Ztest NoBuffer',  60, 10000, 0,  0, true, 2),
    (c_svc_orph, c_t, 'Ztest Unstaffed', 60, 10000, 0,  0, true, 9);

  insert into public.service_addons (id, tenant_id, service_id, name, price_cents, duration_minutes)
  values (c_addon, c_t, c_svc, 'Ztest Extra 30', 2500, 30);

  insert into public.employees (id, tenant_id, display_name, title, active)
  values (c_emp1, c_t, 'Ztest Emp One', 'Cleaner', true),
         (c_emp2, c_t, 'Ztest Emp Two', 'Cleaner', true);

  -- Deliberately NOT linked to c_svc_orph: that is the A28.1 case.
  insert into public.employee_services (employee_id, service_id) values
    (c_emp1, c_svc), (c_emp2, c_svc), (c_emp1, c_svc_nb), (c_emp2, c_svc_nb);

  insert into public.availability (tenant_id, employee_id, weekday, start_time, end_time)
  select c_t, e, g, '08:00'::time, '18:00'::time
  from (values (c_emp1), (c_emp2)) v(e), generate_series(0, 6) g;

  insert into public.customers (id, tenant_id, full_name, email)
  values (c_cust, c_t, 'Ztest Buffer Customer', 'ztest-buffer@example.test');

  insert into public.widget_configs (tenant_id, public_key, theme, active)
  values (c_t, c_key, '{}'::jsonb, true);

  raise notice 'fixture created (widget key %)', c_key;

  -- ============================================================
  -- A09 — add-on duration changes which starts are offered
  -- ============================================================
  select max((slot_start at time zone v_tz)::time), min(slot_end - slot_start)
    into v_last, v_len
  from public.get_available_slots(c_key, c_svc, d_addon);

  if v_last is null then
    raise exception 'FAIL A09.0: no slots at all on % — the fixture is wrong and every later check would be meaningless', d_addon;
  end if;
  if v_len <> interval '60 minutes' then
    raise exception 'FAIL A09.1: slot length without add-ons is %, expected 60 minutes', v_len;
  end if;
  if v_last <> '17:00'::time then
    raise exception 'FAIL A09.1: last start without add-ons is %, expected 17:00', v_last;
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS A09.1: without add-ons, slots are 60 min and the last start is 17:00';

  -- With the 30-minute add-on the job is 90 minutes, so the last start that
  -- fits before 18:00 is 16:30. Before the fix the search ignored add-ons
  -- entirely and still offered 17:00, which then failed at booking time.
  select max((slot_start at time zone v_tz)::time), min(slot_end - slot_start)
    into v_last, v_len
  from public.get_available_slots(c_key, c_svc, d_addon, array[c_addon]);

  if v_len <> interval '90 minutes' then
    raise exception 'FAIL A09.2: slot length with a 30-min add-on is %, expected 90 minutes — the add-on is being ignored', v_len;
  end if;
  if v_last <> '16:30'::time then
    raise exception 'FAIL A09.2: last start with a 30-min add-on is %, expected 16:30 — starts that cannot hold the job are still offered', v_last;
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS A09.2: with a 30-min add-on, slots are 90 min and the last start is 16:30';

  -- And the booking must occupy the span the search promised.
  v_result := public.create_widget_booking(
    c_key, c_svc, (d_addon + '09:00'::time) at time zone v_tz,
    'Ztest Addon Customer', 'ztest-addon@example.test',
    null, null, null, null, array[c_addon]);
  v_len := (v_result ->> 'ends_at')::timestamptz - (v_result ->> 'starts_at')::timestamptz;
  if v_len <> interval '90 minutes' then
    raise exception 'FAIL A09.3: the created booking occupies %, expected 90 minutes', v_len;
  end if;
  if (v_result ->> 'price_cents')::int <> 12500 then
    raise exception 'FAIL A09.3: price is %, expected 12500 (10000 service + 2500 add-on)', v_result ->> 'price_cents';
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS A09.3: the booking occupies 90 minutes and costs service + add-on';

  -- ============================================================
  -- A10 — buffers enforced on BOTH sides of the comparison
  -- ============================================================
  -- An existing booking for emp1, 10:30 -> 11:30, on the 30-min-after service.
  v_start := (d_buffer + '10:30'::time) at time zone v_tz;
  insert into public.bookings
    (tenant_id, customer_id, service_id, employee_id, status, starts_at, ends_at, price_cents)
  values (c_t, c_cust, c_svc, c_emp1, 'confirmed', v_start, v_start + interval '60 minutes', 10000);

  select count(*) into v_offered
  from public.get_available_slots(c_key, c_svc, d_buffer)
  where (slot_start at time zone v_tz)::time = '11:00'::time and employee_id = c_emp1;
  if v_offered <> 0 then
    raise exception 'FAIL A10.1: 11:00 still offered for the booked employee — plain overlap is not excluded';
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS A10.1: 11:00 (overlapping) is not offered for the booked employee';

  -- THE HEADLINE CASE. The existing booking ends at 11:30 and its service has
  -- a 30-minute AFTER buffer, so emp1 is not free until 12:00. Before the fix,
  -- tstzrange's half-open bound plus the missing other-side padding left 11:30
  -- bookable. This is the exact defect the live audit observed.
  select count(*) into v_offered
  from public.get_available_slots(c_key, c_svc, d_buffer)
  where (slot_start at time zone v_tz)::time = '11:30'::time and employee_id = c_emp1;
  if v_offered <> 0 then
    raise exception 'FAIL A10.2: 11:30 is offered for an employee whose job ending 11:30 carries a 30-minute after-buffer — THE ORIGINAL DEFECT IS BACK';
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS A10.2: 11:30 is NOT offered — the existing booking after-buffer is honoured';

  -- And 12:00 IS offered, so the buffer is not over-applied.
  select count(*) into v_offered
  from public.get_available_slots(c_key, c_svc, d_buffer)
  where (slot_start at time zone v_tz)::time = '12:00'::time and employee_id = c_emp1;
  if v_offered <> 1 then
    raise exception 'FAIL A10.3: 12:00 is not offered for the booked employee — the buffer is blocking too much';
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS A10.3: 12:00 IS offered — the buffer blocks exactly its 30 minutes';

  -- The buffer belongs to the existing booking's service, not the request.
  -- Booking the NO-buffer service at 11:30 must still be refused for emp1.
  select count(*) into v_offered
  from public.get_available_slots(c_key, c_svc_nb, d_buffer)
  where (slot_start at time zone v_tz)::time = '11:30'::time and employee_id = c_emp1;
  if v_offered <> 0 then
    raise exception 'FAIL A10.4: 11:30 offered on the no-buffer service — only the REQUEST buffers are applied, not the existing booking''s';
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS A10.4: the existing booking buffer applies even when the requested service has none';

  -- The insert path must agree with the search path.
  v_err := null;
  begin
    perform public.create_widget_booking(
      c_key, c_svc, (d_buffer + '11:30'::time) at time zone v_tz,
      'Ztest Buffer Breaker', 'ztest-breaker@example.test',
      null, c_emp1, null, null, array[]::uuid[]);
  exception when others then
    v_err := sqlerrm;
  end;
  if v_err is null then
    raise exception 'FAIL A10.5: booking 11:30 for the buffered employee SUCCEEDED — the insert path ignores buffers';
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS A10.5: booking 11:30 for that employee is refused (%)', v_err;

  -- ============================================================
  -- A11 — collapsing the display must not collapse capacity
  -- ============================================================
  select count(*), count(distinct slot_start) into v_rows, v_distinct
  from public.get_available_slots(c_key, c_svc, d_cap);

  if v_distinct = 0 then
    raise exception 'FAIL A11.0: no slots on % — fixture problem', d_cap;
  end if;
  if v_rows <> v_distinct * 2 then
    raise exception 'FAIL A11.1: expected 2 rows per start for 2 qualified employees, got % rows for % starts', v_rows, v_distinct;
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS A11.1: % starts x 2 employees = % rows (the UI collapses this, the RPC does not)', v_distinct, v_rows;

  -- Two customers take the same 14:00 start. Both must succeed, on different
  -- employees, because the slot genuinely has capacity 2. Passing null for the
  -- employee is what the widget does after collapsing the list.
  v_first := public.create_widget_booking(
    c_key, c_svc, (d_cap + '14:00'::time) at time zone v_tz,
    'Ztest Cap One', 'ztest-cap1@example.test', null, null, null, null, array[]::uuid[]);
  v_second := public.create_widget_booking(
    c_key, c_svc, (d_cap + '14:00'::time) at time zone v_tz,
    'Ztest Cap Two', 'ztest-cap2@example.test', null, null, null, null, array[]::uuid[]);

  if (v_first ->> 'employee_id') = (v_second ->> 'employee_id') then
    raise exception 'FAIL A11.2: both bookings went to the same employee (%) — auto-assign is not spreading across capacity', v_first ->> 'employee_id';
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS A11.2: two customers took the same 14:00 start on different employees';

  -- A third must fail: capacity is 2, not unlimited.
  v_err := null;
  begin
    perform public.create_widget_booking(
      c_key, c_svc, (d_cap + '14:00'::time) at time zone v_tz,
      'Ztest Cap Three', 'ztest-cap3@example.test', null, null, null, null, array[]::uuid[]);
  exception when others then
    v_err := sqlerrm;
  end;
  if v_err is null then
    raise exception 'FAIL A11.3: a THIRD booking at 14:00 succeeded with only 2 employees — overbooking';
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS A11.3: the third booking at 14:00 is refused (%)', v_err;

  select count(*) into v_rows
  from public.get_available_slots(c_key, c_svc, d_cap)
  where (slot_start at time zone v_tz)::time = '14:00'::time;
  if v_rows <> 0 then
    raise exception 'FAIL A11.4: 14:00 is still offered after both employees were booked';
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS A11.4: 14:00 disappears once capacity is exhausted';

  -- ============================================================
  -- A28 — "nobody can do this" is distinguishable from "just taken"
  -- ============================================================
  v_err := null;
  begin
    perform public.create_widget_booking(
      c_key, c_svc_orph, (d_err + '10:00'::time) at time zone v_tz,
      'Ztest Nobody', 'ztest-nobody@example.test', null, null, null, null, array[]::uuid[]);
  exception when others then
    v_err := sqlerrm;
  end;
  if v_err is null then
    raise exception 'FAIL A28.1: booking an unstaffed service SUCCEEDED';
  end if;
  if v_err not like '%no_qualified_staff%' then
    raise exception 'FAIL A28.1: expected no_qualified_staff, got "%" — the caller cannot tell this apart from a race', v_err;
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS A28.1: an unstaffed service reports no_qualified_staff, not slot_taken';

  v_err := null;
  begin
    perform public.create_widget_booking(
      c_key, c_svc, (d_err + '20:00'::time) at time zone v_tz,
      'Ztest Late', 'ztest-late@example.test', null, null, null, null, array[]::uuid[]);
  exception when others then
    v_err := sqlerrm;
  end;
  if v_err is null then
    raise exception 'FAIL A28.2: a booking at 20:00 SUCCEEDED on an 08:00-18:00 day';
  end if;
  if v_err not like '%outside_business_hours%' then
    raise exception 'FAIL A28.2: expected outside_business_hours, got "%"', v_err;
  end if;
  v_passes := v_passes + 1;
  raise notice 'PASS A28.2: a start outside opening hours reports outside_business_hours';

  -- ---------- roll everything back ----------
  raise exception 'ZTEST COMPLETE — all % checks passed. This error is intentional: it rolls the fixture back so nothing is persisted.', v_passes;
end $$;

-- ============================================================
-- Cleanup, ONLY if the pre-flight check says a previous run committed:
--
--   delete from public.tenants where slug = 'ztest-booking';
--
-- (cascades the services, employees, bookings, customers and widget config)
-- Confirm with:
--   select slug from public.tenants where slug like 'ztest-%';
-- ============================================================
