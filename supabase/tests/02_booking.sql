-- ============================================================
-- Diamond Booking — verification test 02: booking correctness
-- (A09 add-on duration, A10 buffers, A11 capacity, A28 error codes)
--
-- Run against STAGING after 0007-0010. Creates its own fixture, ends with
-- ROLLBACK, safe to re-run. Every check raises on failure.
--
-- The headline case is A10.2: a job ending 11:30 with a 30-minute after-buffer
-- must NOT leave an 11:30 start bookable. That is the exact defect the live
-- audit observed, and the one most likely to regress.
--
-- These RPCs are SECURITY DEFINER and keyed by the widget public_key, so they
-- are called the way the anonymous widget calls them — no impersonation needed.
-- ============================================================

begin;

create temporary table _b (k text primary key, v text);
grant select on _b to public;

do $$
declare
  t uuid := gen_random_uuid();
  key text := 'ztest' || replace(gen_random_uuid()::text, '-', '');
  svc uuid;
  svc_long uuid;
  addon uuid;
  emp1 uuid;
  emp2 uuid;
begin
  insert into public.tenants (id, slug, name, industry, timezone, settings)
  values (t, 'ztest-booking', 'Ztest Booking Co', 'cleaning', 'America/New_York',
          '{"auto_confirm":true}'::jsonb);

  -- Open every weekday 08:00-18:00 so the test does not depend on "today".
  insert into public.business_hours (tenant_id, weekday, open_time, close_time, closed)
  select t, g, '08:00'::time, '18:00'::time, false from generate_series(0, 6) g;

  -- 60-minute service with a 30-minute AFTER buffer: the A10 case.
  insert into public.services
    (tenant_id, name, duration_minutes, price_cents, buffer_before_minutes, buffer_after_minutes, active, sort)
  values (t, 'Ztest Standard', 60, 10000, 0, 30, true, 1)
  returning id into svc;

  -- A second service with NO buffers, to prove the buffer logic is per-service
  -- and not a blanket rule.
  insert into public.services
    (tenant_id, name, duration_minutes, price_cents, buffer_before_minutes, buffer_after_minutes, active, sort)
  values (t, 'Ztest NoBuffer', 60, 10000, 0, 0, true, 2)
  returning id into svc_long;

  -- A 30-minute add-on on the buffered service: the A09 case.
  insert into public.service_addons (tenant_id, service_id, name, price_cents, duration_minutes)
  values (t, svc, 'Ztest Extra 30', 2500, 30)
  returning id into addon;

  -- Two qualified employees, both available all day: the A11 capacity case.
  insert into public.employees (tenant_id, display_name, title, active)
  values (t, 'Ztest Emp One', 'Cleaner', true) returning id into emp1;
  insert into public.employees (tenant_id, display_name, title, active)
  values (t, 'Ztest Emp Two', 'Cleaner', true) returning id into emp2;

  insert into public.employee_services (employee_id, service_id) values
    (emp1, svc), (emp2, svc), (emp1, svc_long), (emp2, svc_long);

  insert into public.availability (tenant_id, employee_id, weekday, start_time, end_time)
  select t, e, g, '08:00'::time, '18:00'::time
  from (values (emp1), (emp2)) v(e), generate_series(0, 6) g;

  insert into public.widget_configs (tenant_id, public_key, theme, active)
  values (t, key, '{}'::jsonb, true);

  insert into _b (k, v) values
    ('t', t::text), ('key', key), ('svc', svc::text), ('svc_long', svc_long::text),
    ('addon', addon::text), ('emp1', emp1::text), ('emp2', emp2::text);

  raise notice 'fixture created (widget key %)', key;
end $$;

-- ============================================================
-- A09 — add-on duration changes which starts are offered
-- ============================================================
do $$
declare
  v_key text := (select v from _b where k = 'key');
  v_svc uuid := ((select v from _b where k = 'svc'))::uuid;
  v_addon uuid := ((select v from _b where k = 'addon'))::uuid;
  -- A fixed weekday well in the future, so "now" never interferes.
  v_date date := (date_trunc('week', now() + interval '3 weeks') + interval '2 days')::date;
  v_plain_last time;
  v_addon_last time;
  v_plain_len interval;
  v_addon_len interval;
begin
  -- Without the add-on: a 60-minute job, so the last start that fits before
  -- 18:00 is 17:00.
  select max((slot_start at time zone 'America/New_York')::time),
         min(slot_end - slot_start)
    into v_plain_last, v_plain_len
  from public.get_available_slots(v_key, v_svc, v_date);

  if v_plain_last is null then
    raise exception 'FAIL A09.0: no slots at all on % — the fixture is wrong, later checks would be meaningless', v_date;
  end if;
  if v_plain_len <> interval '60 minutes' then
    raise exception 'FAIL A09.1: slot length without add-ons is %, expected 60 minutes', v_plain_len;
  end if;
  if v_plain_last <> '17:00'::time then
    raise exception 'FAIL A09.1: last start without add-ons is %, expected 17:00', v_plain_last;
  end if;
  raise notice 'PASS A09.1: without add-ons, slots are 60 min and the last start is 17:00';

  -- With the 30-minute add-on: a 90-minute job, so the last start is 16:30
  -- and every slot is 90 minutes. Before the fix the search ignored the add-on
  -- entirely and still offered 17:00, which then failed at booking time.
  select max((slot_start at time zone 'America/New_York')::time),
         min(slot_end - slot_start)
    into v_addon_last, v_addon_len
  from public.get_available_slots(v_key, v_svc, v_date, array[v_addon]);

  if v_addon_len <> interval '90 minutes' then
    raise exception 'FAIL A09.2: slot length with a 30-min add-on is %, expected 90 minutes — the add-on is being ignored', v_addon_len;
  end if;
  if v_addon_last <> '16:30'::time then
    raise exception 'FAIL A09.2: last start with a 30-min add-on is %, expected 16:30 — starts that cannot hold the job are still being offered', v_addon_last;
  end if;
  raise notice 'PASS A09.2: with a 30-min add-on, slots are 90 min and the last start is 16:30';

  -- And the booking must occupy the same 90 minutes the search promised.
  declare
    v_result jsonb;
    v_len interval;
  begin
    v_result := public.create_widget_booking(
      v_key, v_svc,
      (v_date + '09:00'::time) at time zone 'America/New_York',
      'Ztest Addon Customer', 'ztest-addon@example.test',
      null, null, null, null, array[v_addon]
    );
    v_len := (v_result ->> 'ends_at')::timestamptz - (v_result ->> 'starts_at')::timestamptz;
    if v_len <> interval '90 minutes' then
      raise exception 'FAIL A09.3: the created booking occupies %, expected 90 minutes', v_len;
    end if;
    if (v_result ->> 'price_cents')::int <> 12500 then
      raise exception 'FAIL A09.3: price is %, expected 12500 (10000 + 2500 add-on)', v_result ->> 'price_cents';
    end if;
    raise notice 'PASS A09.3: the booking occupies 90 minutes and costs the service + add-on';
  end;
end $$;

-- ============================================================
-- A10 — buffers are enforced on BOTH sides of the comparison
-- ============================================================
do $$
declare
  v_key text := (select v from _b where k = 'key');
  v_svc uuid := ((select v from _b where k = 'svc'))::uuid;
  v_svc_nb uuid := ((select v from _b where k = 'svc_long'))::uuid;
  v_emp1 uuid := ((select v from _b where k = 'emp1'))::uuid;
  v_t uuid := ((select v from _b where k = 't'))::uuid;
  v_cust uuid;
  v_date date := (date_trunc('week', now() + interval '4 weeks') + interval '2 days')::date;
  v_start timestamptz;
  v_offered int;
begin
  insert into public.customers (tenant_id, full_name, email)
  values (v_t, 'Ztest Buffer Customer', 'ztest-buffer@example.test')
  returning id into v_cust;

  -- An existing booking for emp1, 10:30 -> 11:30, on the 30-min-after service.
  v_start := (v_date + '10:30'::time) at time zone 'America/New_York';
  insert into public.bookings
    (tenant_id, customer_id, service_id, employee_id, status, starts_at, ends_at, price_cents)
  values (v_t, v_cust, v_svc, v_emp1, 'confirmed', v_start, v_start + interval '60 minutes', 10000);

  -- A10.1 — the overlapping start is gone (this always worked).
  select count(*) into v_offered
  from public.get_available_slots(v_key, v_svc, v_date)
  where (slot_start at time zone 'America/New_York')::time = '11:00'::time
    and employee_id = v_emp1;
  if v_offered <> 0 then
    raise exception 'FAIL A10.1: 11:00 is still offered for the booked employee — plain overlap is not excluded';
  end if;
  raise notice 'PASS A10.1: 11:00 (overlapping) is not offered for the booked employee';

  -- A10.2 — THE HEADLINE CASE. The existing booking ends at 11:30 and its
  -- service has a 30-minute AFTER buffer, so emp1 is not free until 12:00.
  -- Before the fix, tstzrange's half-open bound plus the missing other-side
  -- padding left 11:30 bookable. This is the exact defect the live audit saw.
  select count(*) into v_offered
  from public.get_available_slots(v_key, v_svc, v_date)
  where (slot_start at time zone 'America/New_York')::time = '11:30'::time
    and employee_id = v_emp1;
  if v_offered <> 0 then
    raise exception 'FAIL A10.2: 11:30 is offered for an employee whose 11:30 job carries a 30-minute after-buffer — THE ORIGINAL DEFECT IS BACK';
  end if;
  raise notice 'PASS A10.2: 11:30 is NOT offered — the existing booking''s after-buffer is honoured';

  -- A10.3 — and 12:00 IS offered, so the buffer is not over-applied.
  select count(*) into v_offered
  from public.get_available_slots(v_key, v_svc, v_date)
  where (slot_start at time zone 'America/New_York')::time = '12:00'::time
    and employee_id = v_emp1;
  if v_offered <> 1 then
    raise exception 'FAIL A10.3: 12:00 is not offered for the booked employee — the buffer is blocking too much';
  end if;
  raise notice 'PASS A10.3: 12:00 IS offered — the buffer blocks exactly its 30 minutes';

  -- A10.4 — the buffer belongs to the booking's own service, not the request.
  -- Booking the NO-buffer service at 11:30 must still be refused for emp1,
  -- because the obstacle is the existing job's after-buffer.
  select count(*) into v_offered
  from public.get_available_slots(v_key, v_svc_nb, v_date)
  where (slot_start at time zone 'America/New_York')::time = '11:30'::time
    and employee_id = v_emp1;
  if v_offered <> 0 then
    raise exception 'FAIL A10.4: 11:30 offered on the no-buffer service — only the REQUEST''s buffers are being applied, not the existing booking''s';
  end if;
  raise notice 'PASS A10.4: the existing booking''s buffer applies even when the requested service has none';

  -- A10.5 — the insert path agrees with the search path.
  declare
    v_raised text := null;
  begin
    begin
      perform public.create_widget_booking(
        v_key, v_svc,
        (v_date + '11:30'::time) at time zone 'America/New_York',
        'Ztest Buffer Breaker', 'ztest-breaker@example.test',
        null, v_emp1, null, null, array[]::uuid[]
      );
    exception when others then
      v_raised := sqlerrm;
    end;
    if v_raised is null then
      raise exception 'FAIL A10.5: booking 11:30 for the buffered employee SUCCEEDED — the insert path ignores buffers';
    end if;
    raise notice 'PASS A10.5: booking 11:30 for that employee is refused (%)', v_raised;
  end;
end $$;

-- ============================================================
-- A11 — collapsing the display must not collapse capacity
-- ============================================================
do $$
declare
  v_key text := (select v from _b where k = 'key');
  v_svc uuid := ((select v from _b where k = 'svc'))::uuid;
  v_date date := (date_trunc('week', now() + interval '5 weeks') + interval '2 days')::date;
  v_rows int;
  v_distinct int;
  v_first jsonb;
  v_second jsonb;
  v_raised text := null;
begin
  -- The RPC returns a row per (slot, employee): two employees, so two rows per
  -- start. The widget collapses this for display; the capacity must survive.
  select count(*), count(distinct slot_start) into v_rows, v_distinct
  from public.get_available_slots(v_key, v_svc, v_date);

  if v_distinct = 0 then
    raise exception 'FAIL A11.0: no slots on % — fixture problem', v_date;
  end if;
  if v_rows <> v_distinct * 2 then
    raise exception 'FAIL A11.1: expected 2 rows per start for 2 qualified employees, got % rows for % starts', v_rows, v_distinct;
  end if;
  raise notice 'PASS A11.1: % starts x 2 employees = % rows (the UI collapses this, the RPC does not)', v_distinct, v_rows;

  -- Two customers take the same 14:00 start. Both must succeed, on different
  -- employees, because the slot genuinely has capacity 2. Passing null for the
  -- employee is what the widget now does after collapsing the list.
  v_first := public.create_widget_booking(
    v_key, v_svc, (v_date + '14:00'::time) at time zone 'America/New_York',
    'Ztest Cap One', 'ztest-cap1@example.test', null, null, null, null, array[]::uuid[]
  );
  v_second := public.create_widget_booking(
    v_key, v_svc, (v_date + '14:00'::time) at time zone 'America/New_York',
    'Ztest Cap Two', 'ztest-cap2@example.test', null, null, null, null, array[]::uuid[]
  );

  if (v_first ->> 'employee_id') = (v_second ->> 'employee_id') then
    raise exception 'FAIL A11.2: both bookings went to the same employee (%) — auto-assign is not spreading across capacity', v_first ->> 'employee_id';
  end if;
  raise notice 'PASS A11.2: two concurrent customers took the same 14:00 start on different employees';

  -- A third must fail: capacity is 2, not unlimited.
  begin
    perform public.create_widget_booking(
      v_key, v_svc, (v_date + '14:00'::time) at time zone 'America/New_York',
      'Ztest Cap Three', 'ztest-cap3@example.test', null, null, null, null, array[]::uuid[]
    );
  exception when others then
    v_raised := sqlerrm;
  end;
  if v_raised is null then
    raise exception 'FAIL A11.3: a THIRD booking at 14:00 succeeded with only 2 employees — overbooking';
  end if;
  raise notice 'PASS A11.3: the third booking at 14:00 is refused (%)', v_raised;

  -- And 14:00 is no longer offered at all.
  select count(*) into v_rows
  from public.get_available_slots(v_key, v_svc, v_date)
  where (slot_start at time zone 'America/New_York')::time = '14:00'::time;
  if v_rows <> 0 then
    raise exception 'FAIL A11.4: 14:00 is still offered after both employees were booked';
  end if;
  raise notice 'PASS A11.4: 14:00 disappears once capacity is exhausted';
end $$;

-- ============================================================
-- A28 — "nobody can do this" is distinguishable from "just taken"
-- ============================================================
do $$
declare
  v_key text := (select v from _b where k = 'key');
  v_t uuid := ((select v from _b where k = 't'))::uuid;
  v_date date := (date_trunc('week', now() + interval '6 weeks') + interval '2 days')::date;
  v_orphan uuid;
  v_err text;
begin
  -- A service nobody is qualified for.
  insert into public.services
    (tenant_id, name, duration_minutes, price_cents, buffer_before_minutes, buffer_after_minutes, active, sort)
  values (v_t, 'Ztest Unstaffed', 60, 10000, 0, 0, true, 9)
  returning id into v_orphan;

  v_err := null;
  begin
    perform public.create_widget_booking(
      v_key, v_orphan, (v_date + '10:00'::time) at time zone 'America/New_York',
      'Ztest Nobody', 'ztest-nobody@example.test', null, null, null, null, array[]::uuid[]
    );
  exception when others then
    v_err := sqlerrm;
  end;
  if v_err is null then
    raise exception 'FAIL A28.1: booking an unstaffed service SUCCEEDED';
  end if;
  if v_err not like '%no_qualified_staff%' then
    raise exception 'FAIL A28.1: expected no_qualified_staff, got "%" — the caller cannot tell this apart from a race', v_err;
  end if;
  raise notice 'PASS A28.1: an unstaffed service reports no_qualified_staff, not slot_taken';

  -- Outside business hours is its own error too.
  v_err := null;
  begin
    perform public.create_widget_booking(
      v_key, ((select v from _b where k = 'svc'))::uuid,
      (v_date + '20:00'::time) at time zone 'America/New_York',
      'Ztest Late', 'ztest-late@example.test', null, null, null, null, array[]::uuid[]
    );
  exception when others then
    v_err := sqlerrm;
  end;
  if v_err is null then
    raise exception 'FAIL A28.2: a booking at 20:00 SUCCEEDED on an 08:00-18:00 day';
  end if;
  if v_err not like '%outside_business_hours%' then
    raise exception 'FAIL A28.2: expected outside_business_hours, got "%"', v_err;
  end if;
  raise notice 'PASS A28.2: a start outside opening hours reports outside_business_hours';
end $$;

rollback;

-- Only PASS notices means: add-on duration is honoured in the search AND the
-- insert, both sides' buffers are enforced, multi-employee capacity survives
-- the display collapse without overbooking, and the failure modes are
-- distinguishable. Nothing was persisted.
