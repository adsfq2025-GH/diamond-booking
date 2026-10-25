-- ============================================================
-- Diamond Booking — 0013_launch_gates.sql
-- The launch gates from the KnownBiz review of 23 October 2026.
-- Apply after 0012. Idempotent.
--
--   B01  The owner reschedule action moved a confirmed booking to the
--        `rescheduled` status, but booking_conflicts, the no_double_booking
--        exclusion constraint and the calendar query all counted only
--        'pending' and 'confirmed'. A moved appointment therefore stopped
--        holding its slot AND disappeared from the calendar on refresh, and
--        its new time could be sold to somebody else. Fixed from both ends:
--        one shared definition of an active appointment that includes
--        'rescheduled', and reschedule_booking() no longer changes the status
--        at all (it records the move in rescheduled_at / reschedule_count).
--
--   B02  Rescheduling checked date parsing and booking conflicts only — not
--        business hours, employee working hours, approved time off, service
--        eligibility or a future date. The calendar could accept a time the
--        public booking flow would have rejected. Every write path now goes
--        through assert_booking_slot(), the single validation used by public
--        booking too.
--
--   B03  Buffer validation was a pre-insert read with no shared lock, so two
--        requests could both pass it and create jobs that do not overlap but
--        whose buffers do — which the exclusion constraint cannot see, because
--        it compares raw appointment ranges. Capacity decisions for one
--        employee on one local date now serialize on an advisory lock.
--
--   B04  Recurring occurrences were inserted as copied rows: no hours, staff
--        eligibility, time-off or buffer checks, no add-on links, no reminders
--        and no calendar dispatch. create_series_occurrence() is now the one
--        validated way to add a visit to a series, and it reports WHY a date
--        was skipped instead of dropping it.
--
--   B06  Hourly / square-foot / custom pricing was stored but never
--        calculated: a $50/hour service with a two-hour minimum was booked at
--        $50. service_quote_cents() is now the single quantity-aware price,
--        shared by the quote and the booking, and the units are persisted on
--        the booking. The tenant's default_buffer_minutes was likewise saved
--        and never read; it now applies as a documented fallback for services
--        with no explicit buffer of their own.
--
--   S01  tenants_update let a business owner update their own tenant row, and
--        `authenticated` held UPDATE on plan, subscription_status, suspended,
--        billing_cycle, trial_ends_at and every stripe_* column. An owner
--        could self-upgrade or self-unsuspend straight through the data API,
--        whatever the dashboard hid. Those columns are now revoked from
--        client roles and a trigger refuses the change as well.
--
--   S02  Customers could update their own active booking and employees their
--        assigned bookings, with `authenticated` holding UPDATE on
--        price_cents, status, starts_at, ends_at and service_id. The
--        cancellation window lived in a server action a direct API caller
--        simply skipped. A field-level guard now decides what each role may
--        change, inside the database.
--
--   O01  onboarding_readiness() proved that SOME staff were linked and SOME
--        staff had hours — never that a given service could actually be
--        offered. It now reports services that nobody qualified is scheduled
--        long enough to perform.
--
--   O02  accept_employee_invitation() is SECURITY DEFINER, but the 0007
--        identity guard reads request.jwt.claims — which a definer function
--        does not change — so promoting a customer profile to employee was
--        rejected by our own trigger. The guard now recognises a change made
--        inside a trusted definer function.
--
--   D01  The reminder worker read pending rows with no atomic claim, marked
--        failures terminal with no retry, and never rechecked whether the
--        appointment had been cancelled or had already passed. Two overlapping
--        runs could send the same reminder twice. Claiming is now a single
--        atomic statement with attempt counting and backoff.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Columns this migration needs
-- ------------------------------------------------------------
alter table public.bookings
  add column if not exists rescheduled_at timestamptz,
  add column if not exists reschedule_count int not null default 0,
  -- Quantity-aware pricing snapshot (B06): what was actually charged for, so
  -- the total can be explained later even if the service is re-priced.
  add column if not exists pricing_unit text,
  add column if not exists pricing_quantity numeric(10,2);

alter table public.booking_reminders
  add column if not exists attempts int not null default 0,
  add column if not exists claimed_at timestamptz,
  add column if not exists next_attempt_at timestamptz;

-- ============================================================
-- 1. One definition of an active appointment (B01)
-- ============================================================
-- Every caller that asks "does this time hold capacity" must agree. Before,
-- four places each had their own list.
create or replace function public.active_booking_statuses()
returns public.booking_status[]
language sql
immutable
set search_path = public
as $$
  select array['pending', 'confirmed', 'rescheduled']::public.booking_status[]
$$;

comment on function public.active_booking_statuses() is
  'The statuses that occupy calendar capacity. Used by booking_conflicts, the '
  'calendar query, the reminder worker and series renewal. The '
  'no_double_booking exclusion constraint repeats the same list inline, '
  'because an index predicate must be immutable — keep the two in step.';

grant execute on function public.active_booking_statuses() to anon, authenticated;

-- Existing rows parked in 'rescheduled' were, until now, holding nothing:
-- neither the constraint nor the calendar nor the slot search counted them.
-- Promote them back to confirmed so they block capacity and reappear.
--
-- Done row by row on purpose. The old constraint covers pending/confirmed, so
-- if a moved appointment was double-sold while it was invisible — the exact
-- failure B01 describes — promoting it raises an exclusion violation. One bulk
-- UPDATE would abort the whole migration with a bare Postgres error; this
-- promotes everything it safely can and then names what it could not.
do $$
declare
  r record;
  v_conflicts uuid[] := array[]::uuid[];
begin
  for r in
    select id, updated_at from public.bookings where status = 'rescheduled'
  loop
    begin
      update public.bookings
         set status = 'confirmed',
             rescheduled_at = coalesce(rescheduled_at, r.updated_at),
             reschedule_count = greatest(reschedule_count, 1)
       where id = r.id;
    exception
      when exclusion_violation then
        v_conflicts := array_append(v_conflicts, r.id);
    end;
  end loop;

  if array_length(v_conflicts, 1) > 0 then
    raise exception
      'These moved appointments overlap another active appointment for the same team member and must be resolved by hand before this migration can run: %. '
      'Each one was sold twice while the rescheduled status was invisible to the double-booking constraint. '
      'Decide with the business which appointment keeps the slot, move or cancel the other, then re-run.',
      v_conflicts;
  end if;
end;
$$;

-- Rebuild the guarantee over the shared definition. The promotion above is
-- what makes this addable; if it still fails with an exclusion violation, two
-- active bookings genuinely overlap and must be resolved by hand — do NOT
-- weaken the constraint to make it apply.
alter table public.bookings drop constraint if exists no_double_booking;
alter table public.bookings add constraint no_double_booking exclude using gist (
  employee_id with =,
  tstzrange(starts_at, ends_at) with &&
) where (employee_id is not null and status in ('pending', 'confirmed', 'rescheduled'));

-- ------------------------------------------------------------
-- 1b. Effective buffers — the default_buffer_minutes fallback (B06)
-- ------------------------------------------------------------
-- Onboarding collects a business-wide "time between jobs" and nothing read it,
-- so the setting looked effective while only per-service buffers applied.
-- Documented rule: a service with its own after-buffer keeps it; a service
-- with none inherits the tenant default. The before-buffer stays per-service
-- (the tenant setting is travel/packing time AFTER a job, not before it).
-- The OUT columns are deliberately NOT named after the table's own columns: in
-- a SQL-language function an output name that collides with a column of a
-- table in the body is ambiguous.
create or replace function public.service_effective_buffers(p_service_id uuid)
returns table (buffer_before int, buffer_after int)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.buffer_before_minutes,
    case
      when s.buffer_after_minutes > 0 then s.buffer_after_minutes
      else greatest(coalesce(nullif(t.settings ->> 'default_buffer_minutes', '')::int, 0), 0)
    end
  from public.services s
  join public.tenants t on t.id = s.tenant_id
  where s.id = p_service_id
$$;


-- ------------------------------------------------------------
-- 1c. booking_conflicts over the shared status set and effective buffers
-- ------------------------------------------------------------
create or replace function public.booking_conflicts(
  p_employee_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_buffer_before_minutes int,
  p_buffer_after_minutes int,
  p_ignore_booking_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bookings b
    cross join lateral public.service_effective_buffers(b.service_id) eb
    where b.employee_id = p_employee_id
      and b.status = any (public.active_booking_statuses())
      and (p_ignore_booking_id is null or b.id <> p_ignore_booking_id)
      and tstzrange(
            p_start - make_interval(mins => coalesce(p_buffer_before_minutes, 0)),
            p_end   + make_interval(mins => coalesce(p_buffer_after_minutes, 0))
          )
          && tstzrange(
            b.starts_at - make_interval(mins => eb.buffer_before),
            b.ends_at   + make_interval(mins => eb.buffer_after)
          )
  )
$$;

-- Same test, but resolving the candidate's buffers from its service so no
-- caller has to remember the fallback rule.
create or replace function public.booking_conflicts_for_service(
  p_employee_id uuid,
  p_service_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_ignore_booking_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- coalesce, not a bare subquery: a service id that resolves to nothing would
  -- otherwise make this return NULL, and `if not NULL then` reads as "no
  -- conflict" — the one answer this must never give by accident.
  select coalesce((
    select public.booking_conflicts(
      p_employee_id, p_start, p_end,
      eb.buffer_before, eb.buffer_after,
      p_ignore_booking_id
    )
    from public.service_effective_buffers(p_service_id) eb
  ), true)
$$;


-- ============================================================
-- 2. Serialized capacity decisions (B03)
-- ============================================================
-- The exclusion constraint compares RAW ranges, so it cannot see a buffer-only
-- collision: two jobs 10:00-11:00 and 11:15-12:00 with a 30-minute buffer do
-- not overlap, and both inserts succeed. Holding a transaction-scoped advisory
-- lock per employee per local date makes the read-then-insert sequence atomic
-- with respect to any other booking decision for that employee that day.
create or replace function public.lock_booking_capacity(
  p_employee_id uuid,
  p_at timestamptz,
  p_timezone text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_employee_id is null then
    return;
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended(
      p_employee_id::text || ':' ||
      ((p_at at time zone coalesce(nullif(p_timezone, ''), 'UTC'))::date)::text,
      0
    )
  );
end;
$$;

-- ============================================================
-- 3. One validation for every scheduling write (B02, B04)
-- ============================================================
-- Raises a specific, catchable error for each reason a time is unusable, so
-- the calendar, the public widget and the recurrence worker can all say
-- something true instead of leaking a Postgres exclusion dump.
create or replace function public.assert_booking_slot(
  p_tenant_id uuid,
  p_service_id uuid,
  p_employee_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_ignore_booking_id uuid default null,
  p_require_future boolean default true
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant public.tenants%rowtype;
  v_service public.services%rowtype;
  v_local_date date;
  v_local_start time;
  v_local_end time;
  v_weekday int;
begin
  select * into v_tenant from public.tenants where id = p_tenant_id;
  if not found then
    raise exception 'tenant_not_found' using errcode = 'P0001';
  end if;

  select * into v_service
  from public.services
  where id = p_service_id and tenant_id = p_tenant_id and active;
  if not found then
    raise exception 'service_not_found' using errcode = 'P0001';
  end if;

  if p_ends_at <= p_starts_at then
    raise exception 'invalid_range' using errcode = 'P0001';
  end if;

  if p_require_future and p_starts_at <= now() then
    raise exception 'slot_in_past' using errcode = 'P0001';
  end if;

  v_local_date  := (p_starts_at at time zone v_tenant.timezone)::date;
  v_local_start := (p_starts_at at time zone v_tenant.timezone)::time;
  v_local_end   := (p_ends_at   at time zone v_tenant.timezone)::time;
  v_weekday     := extract(dow from v_local_date)::int;

  if (p_ends_at at time zone v_tenant.timezone)::date <> v_local_date then
    raise exception 'crosses_midnight' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.business_hours bh
    where bh.tenant_id = p_tenant_id
      and bh.weekday = v_weekday
      and not bh.closed
      and bh.open_time is not null and bh.close_time is not null
      and bh.open_time <= v_local_start
      and bh.close_time >= v_local_end
  ) then
    raise exception 'outside_business_hours' using errcode = 'P0001';
  end if;

  -- Unassigned bookings hold no staff capacity, so the remaining checks are
  -- about a specific person.
  if p_employee_id is null then
    return;
  end if;

  if not exists (
    select 1 from public.employees e
    where e.id = p_employee_id and e.tenant_id = p_tenant_id and e.active
  ) then
    raise exception 'employee_not_available' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.employee_services es
    where es.employee_id = p_employee_id and es.service_id = p_service_id
  ) then
    raise exception 'employee_not_qualified' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.availability a
    where a.employee_id = p_employee_id
      and a.weekday = v_weekday
      and a.start_time <= v_local_start
      and a.end_time >= v_local_end
  ) then
    raise exception 'outside_working_hours' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.time_off toff
    where toff.tenant_id = p_tenant_id
      and toff.status = 'approved'
      and (toff.employee_id is null or toff.employee_id = p_employee_id)
      and tstzrange(p_starts_at, p_ends_at) && tstzrange(toff.starts_at, toff.ends_at)
  ) then
    raise exception 'employee_on_leave' using errcode = 'P0001';
  end if;

  if public.booking_conflicts_for_service(
       p_employee_id, p_service_id, p_starts_at, p_ends_at, p_ignore_booking_id
     ) then
    raise exception 'slot_taken' using errcode = 'P0001';
  end if;
end;
$$;


-- ------------------------------------------------------------
-- 3b. reschedule_booking — the owner's calendar move, validated (B01, B02)
-- ------------------------------------------------------------
-- Status is deliberately NOT changed. The move is recorded in rescheduled_at /
-- reschedule_count, so the appointment keeps blocking capacity and stays on
-- every screen that shows active work.
create or replace function public.reschedule_booking(
  p_booking_id uuid,
  p_starts_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_tenant public.tenants%rowtype;
  v_duration interval;
  v_ends_at timestamptz;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'booking_not_found' using errcode = 'P0001';
  end if;

  if not (
    public.auth_role() = 'super_admin'
    or (public.auth_role() = 'business_owner' and v_booking.tenant_id = public.auth_tenant())
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if v_booking.status not in ('pending', 'confirmed', 'rescheduled') then
    raise exception 'booking_not_active' using errcode = 'P0001';
  end if;

  select * into v_tenant from public.tenants where id = v_booking.tenant_id;

  v_duration := v_booking.ends_at - v_booking.starts_at;
  v_ends_at  := p_starts_at + v_duration;

  -- Take the capacity lock for BOTH dates before validating, so a concurrent
  -- booking cannot slip into the target slot between the check and the write.
  perform public.lock_booking_capacity(v_booking.employee_id, p_starts_at, v_tenant.timezone);
  perform public.lock_booking_capacity(v_booking.employee_id, v_booking.starts_at, v_tenant.timezone);

  perform public.assert_booking_slot(
    v_booking.tenant_id,
    v_booking.service_id,
    v_booking.employee_id,
    p_starts_at,
    v_ends_at,
    p_booking_id,
    true
  );

  update public.bookings
     set starts_at = p_starts_at,
         ends_at = v_ends_at,
         rescheduled_at = now(),
         reschedule_count = reschedule_count + 1
   where id = p_booking_id;

  return jsonb_build_object(
    'booking_id', p_booking_id,
    'starts_at', p_starts_at,
    'ends_at', v_ends_at,
    'status', v_booking.status
  );
end;
$$;


-- ------------------------------------------------------------
-- 3c. create_series_occurrence — one validated way to add a repeat visit (B04)
-- ------------------------------------------------------------
-- Returns a result rather than raising for an unusable date: the caller needs
-- to carry on with the rest of the series and TELL the customer which dates
-- were skipped. Copies the add-on snapshot the first visit had, which the
-- copied-row inserts never did.
create or replace function public.create_series_occurrence(
  p_source_booking_id uuid,
  p_starts_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src public.bookings%rowtype;
  v_tenant public.tenants%rowtype;
  v_ends_at timestamptz;
  v_status public.booking_status;
  v_new uuid;
begin
  select * into v_src from public.bookings where id = p_source_booking_id;
  if not found then
    raise exception 'booking_not_found' using errcode = 'P0001';
  end if;

  -- Callable by the recurrence worker (service role / direct SQL), a super
  -- admin, or the owning business.
  if not (
    coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
    or coalesce(current_setting('request.jwt.claims', true), '') = ''
    or auth.uid() is null
    or public.auth_role() = 'super_admin'
    or (public.auth_role() = 'business_owner' and v_src.tenant_id = public.auth_tenant())
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_tenant from public.tenants where id = v_src.tenant_id;
  if v_tenant.suspended then
    return jsonb_build_object('ok', false, 'reason', 'tenant_suspended');
  end if;

  v_ends_at := p_starts_at + (v_src.ends_at - v_src.starts_at);
  v_status  := case when v_src.status = 'pending' then 'pending' else 'confirmed' end;

  perform public.lock_booking_capacity(v_src.employee_id, p_starts_at, v_tenant.timezone);

  begin
    perform public.assert_booking_slot(
      v_src.tenant_id, v_src.service_id, v_src.employee_id,
      p_starts_at, v_ends_at, null, true
    );
  exception
    when others then
      -- Every reason a repeat visit cannot be placed is reported, not dropped:
      -- closed days, leave, an unqualified or unscheduled employee, a clash.
      return jsonb_build_object('ok', false, 'reason', sqlerrm, 'starts_at', p_starts_at);
  end;

  begin
    insert into public.bookings (
      tenant_id, customer_id, service_id, employee_id, status,
      starts_at, ends_at, price_cents, deposit_cents, discount_cents, coupon_id,
      address, customer_notes, source,
      pricing_unit, pricing_quantity,
      recurrence_group_id, recurrence_rule, recurrence_until
    ) values (
      v_src.tenant_id, v_src.customer_id, v_src.service_id, v_src.employee_id, v_status,
      p_starts_at, v_ends_at, v_src.price_cents, v_src.deposit_cents, v_src.discount_cents, v_src.coupon_id,
      v_src.address, v_src.customer_notes, v_src.source,
      v_src.pricing_unit, v_src.pricing_quantity,
      v_src.recurrence_group_id, v_src.recurrence_rule, v_src.recurrence_until
    )
    returning id into v_new;
  exception
    when exclusion_violation then
      return jsonb_build_object('ok', false, 'reason', 'slot_taken', 'starts_at', p_starts_at);
  end;

  -- The job details the copied-row inserts lost.
  insert into public.booking_addons (booking_id, addon_id, price_cents)
  select v_new, ba.addon_id, ba.price_cents
  from public.booking_addons ba
  where ba.booking_id = p_source_booking_id;

  return jsonb_build_object(
    'ok', true,
    'booking_id', v_new,
    'starts_at', p_starts_at,
    'ends_at', v_ends_at,
    'status', v_status
  );
end;
$$;


-- ============================================================
-- 4. Quantity-aware pricing (B06)
-- ============================================================
-- One price model, shared by the quote and the booking, so the amount shown is
-- the amount stored. Flat services are unchanged. Hourly services bill at
-- least their minimum hours. Square-foot and custom services cannot be priced
-- without a quantity, and now say so instead of quietly charging one unit.
create or replace function public.service_pricing_units(
  p_service_id uuid,
  p_tenant_id uuid,
  p_quantity numeric default null
)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_service public.services%rowtype;
  v_qty numeric;
begin
  select * into v_service
  from public.services
  where id = p_service_id and tenant_id = p_tenant_id;
  if not found then
    raise exception 'service_not_found' using errcode = 'P0001';
  end if;

  if coalesce(v_service.pricing_unit, 'flat') = 'flat' then
    return 1;
  end if;

  v_qty := nullif(p_quantity, 0);

  if v_service.pricing_unit = 'hourly' then
    return greatest(coalesce(v_qty, 0), coalesce(v_service.minimum_hours, 1), 1);
  end if;

  -- square_foot / custom: the unit count IS the price, so it is required.
  if v_qty is null or v_qty <= 0 then
    raise exception 'quantity_required' using errcode = 'P0001';
  end if;
  return v_qty;
end;
$$;


create or replace function public.service_quote_cents(
  p_service_id uuid,
  p_tenant_id uuid,
  p_addon_ids uuid[] default array[]::uuid[],
  p_quantity numeric default null
)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_price int;
  v_addons int;
  v_units numeric;
begin
  select s.price_cents into v_price
  from public.services s
  where s.id = p_service_id and s.tenant_id = p_tenant_id;
  if not found then
    raise exception 'service_not_found' using errcode = 'P0001';
  end if;

  v_units := public.service_pricing_units(p_service_id, p_tenant_id, p_quantity);

  select coalesce(sum(sa.price_cents), 0) into v_addons
  from public.service_addons sa
  where sa.id = any (coalesce(p_addon_ids, array[]::uuid[]))
    and sa.service_id = p_service_id
    and sa.tenant_id = p_tenant_id;

  return round(v_price * v_units)::int + v_addons;
end;
$$;


-- ------------------------------------------------------------
-- 4b. quote_booking — quantity-aware, and says what it charged for
-- ------------------------------------------------------------
drop function if exists public.quote_booking(text, uuid, uuid[], text);

create or replace function public.quote_booking(
  p_public_key text,
  p_service_id uuid,
  p_addon_ids uuid[] default array[]::uuid[],
  p_coupon_code text default null,
  p_quantity numeric default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant public.tenants%rowtype;
  v_service public.services%rowtype;
  v_subtotal int;
  v_coupon jsonb;
  v_discount int := 0;
  v_units numeric;
begin
  select t.* into v_tenant
  from public.widget_configs w
  join public.tenants t on t.id = w.tenant_id
  where w.public_key = p_public_key and w.active and not t.suspended;
  if not found then
    raise exception 'widget_not_found' using errcode = 'P0001';
  end if;

  select s.* into v_service
  from public.services s
  where s.id = p_service_id and s.tenant_id = v_tenant.id and s.active;
  if not found then
    raise exception 'service_not_found' using errcode = 'P0001';
  end if;

  v_units := public.service_pricing_units(p_service_id, v_tenant.id, p_quantity);
  v_subtotal := public.service_quote_cents(p_service_id, v_tenant.id, p_addon_ids, p_quantity);

  v_coupon := public.price_coupon(v_tenant.id, p_coupon_code, v_subtotal);
  if (v_coupon ->> 'ok')::boolean then
    v_discount := (v_coupon ->> 'discount_cents')::int;
  end if;

  return jsonb_build_object(
    'subtotal_cents', v_subtotal,
    'discount_cents', v_discount,
    'total_cents', v_subtotal - v_discount,
    'deposit_cents', v_service.deposit_cents,
    'duration_minutes', public.booking_duration_minutes(p_service_id, v_tenant.id, p_addon_ids),
    'pricing_unit', coalesce(v_service.pricing_unit, 'flat'),
    'pricing_quantity', v_units,
    'pricing_unit_label', v_service.pricing_unit_label,
    'coupon', v_coupon
  );
end;
$$;

grant execute on function public.quote_booking(text, uuid, uuid[], text, numeric) to anon, authenticated;

-- ------------------------------------------------------------
-- 4c. create_widget_booking — shared validation, lock, price and recurrence gate
-- ------------------------------------------------------------
-- Replaces the 10-argument version from 0008, which is DROPPED: leaving it in
-- place would make a 10-argument named call ambiguous between the two
-- overloads, and anything that still resolved to the old one would book at the
-- un-multiplied price with no recurrence gate.
drop function if exists public.create_widget_booking(text, uuid, timestamptz, text, text, text, uuid, jsonb, text, uuid[]);

create or replace function public.create_widget_booking(
  p_public_key text,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text default null,
  p_employee_id uuid default null,      -- null = auto-assign any free qualified employee
  p_address jsonb default null,
  p_notes text default null,
  p_addon_ids uuid[] default array[]::uuid[],
  p_quantity numeric default null,
  p_recurrence text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_tenant public.tenants%rowtype;
  v_service public.services%rowtype;
  v_employee uuid;
  v_customer uuid;
  v_ends_at timestamptz;
  v_price int;
  v_units numeric;
  v_status public.booking_status := 'pending';
  v_booking uuid;
  v_local_date date;
  v_local_start time;
  v_local_end time;
  v_weekday int;
  v_qualified int;
begin
  if p_customer_email is null or btrim(p_customer_email) = '' then
    raise exception 'email_required' using errcode = 'P0001';
  end if;
  if p_customer_name is null or btrim(p_customer_name) = '' then
    raise exception 'name_required' using errcode = 'P0001';
  end if;

  select t.* into v_tenant
  from public.widget_configs w
  join public.tenants t on t.id = w.tenant_id
  where w.public_key = p_public_key and w.active and not t.suspended;
  if not found then
    raise exception 'widget_not_found' using errcode = 'P0001';
  end if;

  select s.* into v_service
  from public.services s
  where s.id = p_service_id and s.tenant_id = v_tenant.id and s.active;
  if not found then
    raise exception 'service_not_found' using errcode = 'P0001';
  end if;

  -- Recurrence is a tenant setting; it was only ever checked in the browser,
  -- so a direct RPC call could create a standing appointment at a business
  -- that had switched repeat bookings off (B04).
  if coalesce(nullif(p_recurrence, ''), 'none') <> 'none'
     and coalesce((v_tenant.settings -> 'recurring_enabled')::text = 'true', false) is not true then
    raise exception 'recurrence_not_enabled' using errcode = 'P0001';
  end if;

  if p_starts_at <= now() then
    raise exception 'slot_in_past' using errcode = 'P0001';
  end if;

  v_ends_at := p_starts_at + make_interval(mins => public.booking_duration_minutes(
    p_service_id, v_tenant.id, p_addon_ids
  ));
  v_units := public.service_pricing_units(p_service_id, v_tenant.id, p_quantity);
  v_price := public.service_quote_cents(p_service_id, v_tenant.id, p_addon_ids, p_quantity);

  v_local_date  := (p_starts_at at time zone v_tenant.timezone)::date;
  v_local_start := (p_starts_at at time zone v_tenant.timezone)::time;
  v_local_end   := (v_ends_at at time zone v_tenant.timezone)::time;
  v_weekday     := extract(dow from v_local_date)::int;

  if (v_ends_at at time zone v_tenant.timezone)::date <> v_local_date then
    raise exception 'crosses_midnight' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.business_hours bh
    where bh.tenant_id = v_tenant.id
      and bh.weekday = v_weekday
      and not bh.closed
      and bh.open_time is not null and bh.close_time is not null
      and bh.open_time <= v_local_start
      and bh.close_time >= v_local_end
  ) then
    raise exception 'outside_business_hours' using errcode = 'P0001';
  end if;

  -- How many employees COULD do this job at this time, ignoring conflicts?
  -- Separating this from the conflict check is what lets the caller tell
  -- "someone else just took it" apart from "nobody here can do that".
  select count(*) into v_qualified
  from public.employees e
  join public.employee_services es
    on es.employee_id = e.id and es.service_id = p_service_id
  where e.tenant_id = v_tenant.id
    and e.active
    and (p_employee_id is null or e.id = p_employee_id)
    and exists (
      select 1 from public.availability a
      where a.employee_id = e.id
        and a.weekday = v_weekday
        and a.start_time <= v_local_start
        and a.end_time >= v_local_end
    );

  if v_qualified = 0 then
    raise exception 'no_qualified_staff' using errcode = 'P0001';
  end if;

  -- One employee at a time per local date: the buffer check below is a read,
  -- and without this lock two requests could both pass it (B03).
  if p_employee_id is not null then
    perform public.lock_booking_capacity(p_employee_id, p_starts_at, v_tenant.timezone);
  else
    for v_employee in
      select e.id
      from public.employees e
      join public.employee_services es
        on es.employee_id = e.id and es.service_id = p_service_id
      where e.tenant_id = v_tenant.id and e.active
      order by e.created_at
    loop
      perform public.lock_booking_capacity(v_employee, p_starts_at, v_tenant.timezone);
    end loop;
    v_employee := null;
  end if;

  select e.id into v_employee
  from public.employees e
  join public.employee_services es
    on es.employee_id = e.id and es.service_id = p_service_id
  where e.tenant_id = v_tenant.id
    and e.active
    and (p_employee_id is null or e.id = p_employee_id)
    and exists (
      select 1 from public.availability a
      where a.employee_id = e.id
        and a.weekday = v_weekday
        and a.start_time <= v_local_start
        and a.end_time >= v_local_end
    )
    and not exists (
      select 1 from public.time_off toff
      where toff.tenant_id = v_tenant.id
        and toff.status = 'approved'
        and (toff.employee_id is null or toff.employee_id = e.id)
        and tstzrange(p_starts_at, v_ends_at) && tstzrange(toff.starts_at, toff.ends_at)
    )
    and not public.booking_conflicts_for_service(e.id, p_service_id, p_starts_at, v_ends_at)
  order by e.created_at
  limit 1;

  if v_employee is null then
    raise exception 'slot_taken' using errcode = 'P0001';
  end if;

  -- find or create the customer (guest: profile_id stays null)
  insert into public.customers as c (tenant_id, full_name, email, phone)
  values (v_tenant.id, btrim(p_customer_name), lower(btrim(p_customer_email)), nullif(btrim(coalesce(p_customer_phone, '')), ''))
  on conflict (tenant_id, email)
  do update set
    full_name = excluded.full_name,
    phone = coalesce(excluded.phone, c.phone)
  returning c.id into v_customer;

  if coalesce(v_tenant.settings ->> 'auto_confirm', 'false') = 'true' then
    v_status := 'confirmed';
  end if;

  begin
    insert into public.bookings (
      tenant_id, customer_id, service_id, employee_id, status,
      starts_at, ends_at, price_cents, deposit_cents,
      address, customer_notes, source, pricing_unit, pricing_quantity
    ) values (
      v_tenant.id, v_customer, p_service_id, v_employee, v_status,
      p_starts_at, v_ends_at, v_price, v_service.deposit_cents,
      p_address, nullif(btrim(coalesce(p_notes, '')), ''), 'widget',
      coalesce(v_service.pricing_unit, 'flat'), v_units
    )
    returning id into v_booking;
  exception
    when exclusion_violation then
      raise exception 'slot_taken' using errcode = 'P0001';
  end;

  insert into public.booking_addons (booking_id, addon_id, price_cents)
  select v_booking, sa.id, sa.price_cents
  from public.service_addons sa
  where sa.id = any (p_addon_ids)
    and sa.service_id = p_service_id
    and sa.tenant_id = v_tenant.id;

  return jsonb_build_object(
    'booking_id', v_booking,
    'status', v_status,
    'employee_id', v_employee,
    'starts_at', p_starts_at,
    'ends_at', v_ends_at,
    'price_cents', v_price,
    'deposit_cents', v_service.deposit_cents,
    'pricing_unit', coalesce(v_service.pricing_unit, 'flat'),
    'pricing_quantity', v_units
  );
end;
$$;

grant execute on function public.create_widget_booking(text, uuid, timestamptz, text, text, text, uuid, jsonb, text, uuid[], numeric, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 4d. get_widget_config — tell the booking page how a service is priced
-- ------------------------------------------------------------
-- The widget had no idea a service was priced per hour, per square foot or by
-- quote: it showed price_cents as the total for everything. A service whose
-- price depends on a quantity cannot honestly be given an instant total, so
-- the page now knows which ones those are and sends them down the enquiry
-- path instead of quoting a single unit as the whole job (B06).
create or replace function public.get_widget_config(p_public_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_widget public.widget_configs%rowtype;
  v_tenant public.tenants%rowtype;
  v_result jsonb;
begin
  select w.* into v_widget
  from public.widget_configs w
  where w.public_key = p_public_key and w.active;
  if not found then
    raise exception 'widget_not_found' using errcode = 'P0001';
  end if;

  select t.* into v_tenant
  from public.tenants t
  where t.id = v_widget.tenant_id and not t.suspended;
  if not found then
    raise exception 'widget_not_found' using errcode = 'P0001';
  end if;

  select jsonb_build_object(
    'tenant', jsonb_build_object(
      'slug', v_tenant.slug,
      'name', v_tenant.name,
      'industry', v_tenant.industry,
      'timezone', v_tenant.timezone,
      'branding', v_tenant.branding
    ),
    'theme', v_widget.theme,
    'custom_fields', v_widget.custom_fields,
    'recurring_enabled', coalesce((v_tenant.settings -> 'recurring_enabled')::text = 'true', false),
    'business_hours', coalesce((
      select jsonb_agg(jsonb_build_object(
        'weekday', bh.weekday,
        'open_time', bh.open_time,
        'close_time', bh.close_time,
        'closed', bh.closed
      ) order by bh.weekday)
      from public.business_hours bh
      where bh.tenant_id = v_tenant.id
    ), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'description', s.description,
        'category', s.category,
        'duration_minutes', s.duration_minutes,
        'price_cents', s.price_cents,
        'deposit_cents', s.deposit_cents,
        'pricing_unit', coalesce(s.pricing_unit, 'flat'),
        'pricing_unit_label', s.pricing_unit_label,
        'minimum_hours', s.minimum_hours,
        -- An hourly service has a minimum, so its total IS knowable up front
        -- (price x minimum hours). Square-foot and custom pricing needs a
        -- measurement nobody has yet, so it is a quote, not a booking.
        'quote_on_request', coalesce(s.pricing_unit, 'flat') in ('square_foot', 'custom'),
        'addons', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', sa.id,
            'name', sa.name,
            'price_cents', sa.price_cents,
            'duration_minutes', sa.duration_minutes
          ))
          from public.service_addons sa
          where sa.service_id = s.id
        ), '[]'::jsonb)
      ) order by s.sort, s.name)
      from public.services s
      where s.tenant_id = v_tenant.id and s.active
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.get_widget_config(text) to anon, authenticated;

-- ============================================================
-- 5. Field-level authorization (S01, S02)
-- ============================================================
-- Shared test for "this change is being made by something already trusted":
-- the service role, a direct SQL session with no JWT, or a super admin.
create or replace function public.caller_is_privileged()
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  v_claims text := current_setting('request.jwt.claims', true);
begin
  if coalesce(nullif(v_claims, '')::jsonb ->> 'role', '') = 'service_role' then
    return true;
  end if;
  if v_claims is null or v_claims = '' then
    return true;   -- psql / migrations / seeds
  end if;
  if auth.uid() is null then
    return true;
  end if;
  return public.auth_role() = 'super_admin';
end;
$$;

-- ------------------------------------------------------------
-- 5a. Tenants: plan, subscription and suspension are platform controls (S01)
-- ------------------------------------------------------------
create or replace function public.guard_tenant_privileged_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.plan is not distinct from old.plan
     and new.subscription_status is not distinct from old.subscription_status
     and new.suspended is not distinct from old.suspended
     and new.billing_cycle is not distinct from old.billing_cycle
     and new.trial_ends_at is not distinct from old.trial_ends_at
     and new.slug is not distinct from old.slug
     and new.stripe_customer_id is not distinct from old.stripe_customer_id
     and new.stripe_subscription_id is not distinct from old.stripe_subscription_id
     and new.stripe_connect_account_id is not distinct from old.stripe_connect_account_id
     and new.stripe_connect_status is not distinct from old.stripe_connect_status
     and new.stripe_charges_enabled is not distinct from old.stripe_charges_enabled
     and new.stripe_payouts_enabled is not distinct from old.stripe_payouts_enabled
  then
    return new;   -- nothing privileged changed
  end if;

  if public.caller_is_privileged() then
    return new;
  end if;

  raise exception
    'plan, subscription, suspension, billing and Stripe fields can only be changed by the platform'
    using errcode = '42501';
end;
$$;

drop trigger if exists tenants_guard_privileged on public.tenants;
create trigger tenants_guard_privileged
  before update on public.tenants
  for each row execute function public.guard_tenant_privileged_fields();

-- Belt and braces: PostgREST cannot even offer these columns to a client.
-- The owner keeps the business-profile fields the dashboard actually edits.
revoke update on public.tenants from authenticated;
revoke update on public.tenants from anon;
grant update (name, industry, email, phone, address, timezone, branding, settings, updated_at)
  on public.tenants to authenticated;

-- ------------------------------------------------------------
-- 5b. Bookings: what each role may change (S02)
-- ------------------------------------------------------------
-- The policies decided WHICH rows; nothing decided WHICH COLUMNS, so a direct
-- API caller could rewrite price_cents, starts_at or service_id on a booking
-- they were merely allowed to see. The cancellation window was enforced in a
-- server action the same caller never had to go through.
create or replace function public.guard_booking_field_access()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_role public.user_role;
  v_window_hours numeric;
  v_hours_until numeric;
begin
  if public.caller_is_privileged() then
    return new;
  end if;

  v_role := public.auth_role();

  -- Owner of this booking's business: everything except moving the booking to
  -- another business or another customer.
  if v_role = 'business_owner' and old.tenant_id = public.auth_tenant() then
    if new.tenant_id is distinct from old.tenant_id
       or new.customer_id is distinct from old.customer_id then
      raise exception 'a booking cannot be moved to another business or customer'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- Assigned employee: progress their own job, nothing else.
  if v_role = 'employee' and old.employee_id = public.auth_employee_id() then
    if new.tenant_id is distinct from old.tenant_id
       or new.customer_id is distinct from old.customer_id
       or new.service_id is distinct from old.service_id
       or new.employee_id is distinct from old.employee_id
       or new.starts_at is distinct from old.starts_at
       or new.ends_at is distinct from old.ends_at
       or new.price_cents is distinct from old.price_cents
       or new.deposit_cents is distinct from old.deposit_cents
       or new.discount_cents is distinct from old.discount_cents
       or new.recurrence_group_id is distinct from old.recurrence_group_id
       or new.recurrence_rule is distinct from old.recurrence_rule then
      raise exception 'staff may update the status and internal notes of their own job only'
        using errcode = '42501';
    end if;
    if new.status is distinct from old.status
       and new.status not in ('confirmed', 'completed', 'no_show') then
      raise exception 'that status change is not available to staff' using errcode = '42501';
    end if;
    return new;
  end if;

  -- Customer: cancel their own appointment, inside the business's policy.
  if v_role = 'customer' and old.customer_id = public.auth_customer_id() then
    if new.status is distinct from old.status and new.status <> 'cancelled' then
      raise exception 'a customer may only cancel an appointment' using errcode = '42501';
    end if;
    if new.tenant_id is distinct from old.tenant_id
       or new.customer_id is distinct from old.customer_id
       or new.service_id is distinct from old.service_id
       or new.employee_id is distinct from old.employee_id
       or new.starts_at is distinct from old.starts_at
       or new.ends_at is distinct from old.ends_at
       or new.price_cents is distinct from old.price_cents
       or new.deposit_cents is distinct from old.deposit_cents
       or new.discount_cents is distinct from old.discount_cents then
      raise exception 'a customer cannot change the details of an appointment'
        using errcode = '42501';
    end if;

    if new.status = 'cancelled' and old.status <> 'cancelled' then
      select coalesce(nullif(t.settings ->> 'cancellation_window_hours', '')::numeric, 0)
        into v_window_hours
      from public.tenants t where t.id = old.tenant_id;

      v_hours_until := extract(epoch from (old.starts_at - now())) / 3600.0;
      if coalesce(v_window_hours, 0) > 0 and v_hours_until < v_window_hours then
        raise exception 'cancellation_window_closed' using errcode = 'P0001';
      end if;
    end if;
    return new;
  end if;

  raise exception 'not_authorized' using errcode = '42501';
end;
$$;

drop trigger if exists bookings_guard_fields on public.bookings;
create trigger bookings_guard_fields
  before update on public.bookings
  for each row execute function public.guard_booking_field_access();

-- The customer policy claimed to allow a reschedule it never validated. Its
-- real purpose is cancelling, and the guard above enforces the rest.
drop policy if exists bookings_customer_update on public.bookings;
create policy bookings_customer_update on public.bookings for update
using (
  public.auth_role() = 'customer'
  and customer_id = public.auth_customer_id()
  and status = any (public.active_booking_statuses())
)
with check (
  public.auth_role() = 'customer'
  and customer_id = public.auth_customer_id()
  and tenant_id = public.auth_tenant()
  and status = 'cancelled'
);

-- ============================================================
-- 6. Invitation acceptance can promote a profile (O02)
-- ============================================================
-- accept_employee_invitation is SECURITY DEFINER, but request.jwt.claims is a
-- session setting that a definer function does not change — so the 0007 guard
-- saw the invitee's own claims and refused the role change the invitation is
-- entirely about. The guard now also accepts a change made inside a trusted
-- definer function, which announces itself with a transaction-local flag.
-- set_config lives in pg_catalog and is not exposed over the data API, so a
-- client cannot raise the flag for itself.
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
     or public.auth_role() = 'super_admin'
     or coalesce(current_setting('diamond.identity_change', true), '') = 'on' then
    return new;
  end if;

  raise exception
    'profiles.role and profiles.tenant_id can only be changed by the service role or a super admin'
    using errcode = '42501';
end;
$$;

create or replace function public.accept_employee_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.employee_invitations%rowtype;
  v_uid uuid := auth.uid();
  v_email text;
  v_role public.user_role;
  v_existing uuid;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;

  select * into v_inv
  from public.employee_invitations
  where token = p_token
  limit 1;
  if not found then
    raise exception 'invitation_not_found' using errcode = 'P0001';
  end if;
  if v_inv.revoked_at is not null then
    raise exception 'invitation_revoked' using errcode = 'P0001';
  end if;
  if v_inv.accepted_at is not null then
    raise exception 'invitation_already_used' using errcode = 'P0001';
  end if;
  if v_inv.expires_at < now() then
    raise exception 'invitation_expired' using errcode = 'P0001';
  end if;

  select lower(p.email), p.role into v_email, v_role
  from public.profiles p where p.id = v_uid;
  if v_email is distinct from lower(v_inv.email) then
    raise exception 'invitation_email_mismatch' using errcode = 'P0001';
  end if;

  -- An owner of another business accepting a staff invitation would lose their
  -- own workspace. Say so rather than silently doing nothing, which is what
  -- the `role not in (...)` filter used to do.
  if v_role in ('super_admin', 'business_owner') then
    raise exception 'invitee_owns_a_business' using errcode = 'P0001';
  end if;

  select e.profile_id into v_existing
  from public.employees e where e.id = v_inv.employee_id;
  if v_existing is not null and v_existing <> v_uid then
    raise exception 'employee_already_linked' using errcode = 'P0001';
  end if;

  update public.employees
     set profile_id = v_uid,
         invite_email = null,
         active = true
   where id = v_inv.employee_id;

  perform set_config('diamond.identity_change', 'on', true);
  update public.profiles
     set tenant_id = v_inv.tenant_id,
         role = 'employee'
   where id = v_uid;
  perform set_config('diamond.identity_change', 'off', true);

  update public.employee_invitations
     set accepted_at = now()
   where id = v_inv.id;

  return jsonb_build_object('tenant_id', v_inv.tenant_id, 'employee_id', v_inv.employee_id);
end;
$$;

grant execute on function public.accept_employee_invitation(text) to authenticated;

-- ============================================================
-- 7. Recoverable reminder delivery (D01)
-- ============================================================
-- Claiming and sending were two statements with nothing in between to stop a
-- second worker reading the same rows. The claim is now one atomic UPDATE
-- ... RETURNING, failures are retried with backoff rather than being declared
-- terminal, and a reminder for an appointment that has been cancelled or has
-- already happened is retired instead of sent.
create index if not exists booking_reminders_due_idx
  on public.booking_reminders (status, scheduled_for)
  where status = 'pending';

create or replace function public.claim_due_reminders(
  p_limit int default 50,
  p_stale_after interval default interval '15 minutes'
)
returns setof public.booking_reminders
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.caller_is_privileged() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return query
  with due as (
    select r.id
    from public.booking_reminders r
    join public.bookings b on b.id = r.booking_id
    where r.scheduled_for <= now()
      and coalesce(r.next_attempt_at, r.scheduled_for) <= now()
      and b.status = any (public.active_booking_statuses())
      and b.starts_at > now()
      and (
        r.status = 'pending'
        -- a worker that died mid-send leaves a claim behind; reclaim it
        or (r.status = 'processing' and r.claimed_at < now() - p_stale_after)
      )
    order by r.scheduled_for
    limit greatest(coalesce(p_limit, 50), 1)
    for update of r skip locked
  )
  update public.booking_reminders r
     set status = 'processing',
         claimed_at = now(),
         attempts = r.attempts + 1,
         updated_at = now()
   where r.id in (select id from due)
  returning r.*;
end;
$$;


-- Retire reminders that can no longer be meaningfully delivered, so they stop
-- sitting "pending and overdue" forever (the audit found one from 19 October).
create or replace function public.retire_stale_reminders()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if not public.caller_is_privileged() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.booking_reminders r
     set status = 'cancelled',
         error = coalesce(r.error, 'Appointment cancelled or already past'),
         updated_at = now()
    from public.bookings b
   where b.id = r.booking_id
     and r.status in ('pending', 'processing')
     and (
       not (b.status = any (public.active_booking_statuses()))
       or b.starts_at <= now()
     );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;


-- Record the outcome of one claimed reminder. A failure below the attempt
-- ceiling returns to 'pending' with exponential backoff; at the ceiling it
-- becomes 'failed' so a human can see it.
create or replace function public.complete_reminder(
  p_reminder_id uuid,
  p_ok boolean,
  p_external_id text default null,
  p_error text default null,
  p_max_attempts int default 5
)
returns public.booking_reminders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.booking_reminders%rowtype;
begin
  if not public.caller_is_privileged() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if p_ok then
    update public.booking_reminders
       set status = 'sent',
           sent_at = now(),
           external_id = p_external_id,
           error = null,
           next_attempt_at = null,
           updated_at = now()
     where id = p_reminder_id
    returning * into v_row;
  else
    update public.booking_reminders
       set status = case when attempts >= greatest(coalesce(p_max_attempts, 5), 1)
                         then 'failed' else 'pending' end,
           error = p_error,
           claimed_at = null,
           next_attempt_at = case when attempts >= greatest(coalesce(p_max_attempts, 5), 1)
                                  then null
                                  else now() + make_interval(mins => least(attempts * 5, 60)) end,
           updated_at = now()
     where id = p_reminder_id
    returning * into v_row;
  end if;

  return v_row;
end;
$$;


-- ============================================================
-- 8. Readiness that proves a service can be booked (O01)
-- ============================================================
create or replace function public.onboarding_readiness()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.auth_tenant();
  v_blockers text[] := array[]::text[];
  v_services int;
  v_staff int;
  v_linked int;
  v_with_hours int;
  v_open_days int;
  v_unbookable int;
  v_payments_enabled boolean := false;
  v_charges_enabled boolean := false;
  v_deposit_services int;
begin
  if v_tenant is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select count(*) into v_services
    from public.services where tenant_id = v_tenant and active;
  select count(*) into v_staff
    from public.employees where tenant_id = v_tenant and active;
  select count(*) into v_open_days
    from public.business_hours
   where tenant_id = v_tenant and not closed
     and open_time is not null and close_time is not null;

  select count(distinct e.id) into v_linked
    from public.employees e
    join public.employee_services es on es.employee_id = e.id
    join public.services s on s.id = es.service_id and s.active
   where e.tenant_id = v_tenant and e.active;

  select count(distinct e.id) into v_with_hours
    from public.employees e
    join public.availability a on a.employee_id = e.id
   where e.tenant_id = v_tenant and e.active;

  -- The check the old readiness never made: for THIS service, is there an
  -- active, qualified employee whose working hours overlap an open business
  -- day by at least the service's duration? "Some staff are linked and some
  -- staff have hours" can both be true while no slot exists.
  select count(*) into v_unbookable
    from public.services s
   where s.tenant_id = v_tenant
     and s.active
     and not exists (
       select 1
       from public.employees e
       join public.employee_services es
         on es.employee_id = e.id and es.service_id = s.id
       join public.availability a on a.employee_id = e.id
       join public.business_hours bh
         on bh.tenant_id = v_tenant and bh.weekday = a.weekday
       where e.tenant_id = v_tenant
         and e.active
         and not bh.closed
         and bh.open_time is not null and bh.close_time is not null
         and least(bh.close_time, a.end_time) - greatest(bh.open_time, a.start_time)
             >= make_interval(mins => s.duration_minutes)
     );

  select
    coalesce((t.settings -> 'payments_enabled')::text = 'true', false),
    coalesce(t.stripe_charges_enabled, false)
  into v_payments_enabled, v_charges_enabled
  from public.tenants t where t.id = v_tenant;

  select count(*) into v_deposit_services
    from public.services where tenant_id = v_tenant and active and deposit_cents > 0;

  if v_services = 0 then v_blockers := array_append(v_blockers, 'no_active_services'); end if;
  if v_staff = 0 then v_blockers := array_append(v_blockers, 'no_active_staff'); end if;
  if v_open_days = 0 then v_blockers := array_append(v_blockers, 'no_open_days'); end if;
  if v_staff > 0 and v_linked = 0 then v_blockers := array_append(v_blockers, 'no_staff_qualified_for_any_service'); end if;
  if v_staff > 0 and v_with_hours = 0 then v_blockers := array_append(v_blockers, 'no_staff_working_hours'); end if;
  if v_services > 0 and v_unbookable > 0 then
    v_blockers := array_append(v_blockers, 'service_without_bookable_staff');
  end if;
  if v_deposit_services > 0 and v_payments_enabled and not v_charges_enabled then
    v_blockers := array_append(v_blockers, 'deposits_configured_without_stripe_charges');
  end if;

  return jsonb_build_object(
    'booking_ready', (
      v_services > 0 and v_staff > 0 and v_open_days > 0
      and v_linked > 0 and v_with_hours > 0 and v_unbookable = 0
    ),
    'payment_ready', coalesce(v_payments_enabled and v_charges_enabled, false),
    'counts', jsonb_build_object(
      'active_services', v_services,
      'active_staff', v_staff,
      'open_days', v_open_days,
      'staff_linked_to_a_service', v_linked,
      'staff_with_hours', v_with_hours,
      'services_without_bookable_staff', v_unbookable,
      'services_with_deposits', v_deposit_services
    ),
    'blockers', to_jsonb(v_blockers)
  );
end;
$$;

grant execute on function public.onboarding_readiness() to authenticated;

-- ============================================================
-- 8b. A durable rate-limit boundary for the public surfaces
-- ============================================================
-- The public booking actions, the enquiry form and the geocode proxy were
-- throttled by an in-process counter. On a serverless platform each instance
-- keeps its own, so the real limit was (limit x instances) and a cold start
-- reset it — the review asked for a durable boundary before wider exposure.
-- This counter is shared by every instance.
--
-- Deliberately NOT tenant-scoped: the caller is anonymous, and the key is
-- derived from proxy headers. It is a throttle, never an authorization check.
create table if not exists public.rate_limit_counters (
  key text primary key,
  count int not null default 0,
  window_started_at timestamptz not null default now(),
  window_ends_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.rate_limit_counters enable row level security;
-- No policies: service-role only, exactly like tenant_secrets.
revoke all on public.rate_limit_counters from anon, authenticated;

create index if not exists rate_limit_counters_expiry_idx
  on public.rate_limit_counters (window_ends_at);

create or replace function public.consume_rate_limit(
  p_key text,
  p_limit int,
  p_window_seconds int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.rate_limit_counters%rowtype;
  v_limit int := greatest(coalesce(p_limit, 1), 1);
  v_window interval := make_interval(secs => greatest(coalesce(p_window_seconds, 60), 1));
begin
  if not public.caller_is_privileged() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- One statement, so two concurrent callers cannot both read "under the
  -- limit" and both be allowed through.
  insert into public.rate_limit_counters as c (key, count, window_started_at, window_ends_at)
  values (p_key, 1, now(), now() + v_window)
  on conflict (key) do update
     set count = case when c.window_ends_at <= now() then 1 else c.count + 1 end,
         window_started_at = case when c.window_ends_at <= now() then now() else c.window_started_at end,
         window_ends_at = case when c.window_ends_at <= now() then now() + v_window else c.window_ends_at end,
         updated_at = now()
  returning * into v_row;

  -- Opportunistic cleanup; cheap, and keeps the table from growing for ever.
  if random() < 0.01 then
    delete from public.rate_limit_counters
     where window_ends_at < now() - interval '1 day';
  end if;

  return jsonb_build_object(
    'allowed', v_row.count <= v_limit,
    'count', v_row.count,
    'retry_after', greatest(ceil(extract(epoch from (v_row.window_ends_at - now())))::int, 1)
  );
end;
$$;


-- ============================================================
-- 8c. The catalog upsert matches on identity, not on a name
-- ============================================================
-- onboarding_save_catalog matched services and add-ons by name within the
-- tenant. Renaming a booked service therefore did not rename it: no row
-- matched, a SECOND service was inserted, and the original — still referenced
-- by bookings — was deactivated. The owner saw their rename work while the
-- live catalog quietly forked in two, and the add-ons went with the new row.
--
-- The wizard now sends each row's id when it has one (a hydrated localId IS
-- the database uuid), so the match is on identity first and the name is only
-- a fallback for a row that has never been saved.
create or replace function public.onboarding_save_catalog(
  p_services jsonb,
  p_addons jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.auth_tenant();
  v_role public.user_role := public.auth_role();
  v_ids uuid[] := array[]::uuid[];
  v_keep_services uuid[] := array[]::uuid[];
  v_keep_addons uuid[] := array[]::uuid[];
  v_service_id uuid;
  v_addon_id uuid;
  v_sort int := 0;
  v_deactivated int := 0;
  v_removed int := 0;
  r_svc record;
  r_addon record;
begin
  -- Same authorization as the 0009 original: only the owner of this tenant
  -- (or a super admin) may rewrite its catalog.
  if v_role not in ('business_owner', 'super_admin') or v_tenant is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_services is null or jsonb_typeof(p_services) <> 'array'
     or jsonb_array_length(p_services) = 0 then
    raise exception 'services_required' using errcode = 'P0001';
  end if;

  for r_svc in
    select
      nullif(btrim(coalesce(e ->> 'id', '')), '')                as id_text,
      btrim(e ->> 'name')                                        as name,
      nullif(btrim(coalesce(e ->> 'category', '')), '')          as category,
      greatest(15, coalesce((e ->> 'duration_minutes')::int, 60)) as duration_minutes,
      greatest(0, coalesce((e ->> 'price_cents')::int, 0))        as price_cents,
      greatest(0, coalesce((e ->> 'deposit_cents')::int, 0))      as deposit_cents,
      greatest(0, coalesce((e ->> 'buffer_before_minutes')::int, 0)) as buffer_before_minutes,
      greatest(0, coalesce((e ->> 'buffer_after_minutes')::int, 0))  as buffer_after_minutes,
      coalesce(nullif(btrim(coalesce(e ->> 'pricing_unit', '')), ''), 'hourly') as pricing_unit,
      nullif(e ->> 'minimum_hours', '')::numeric                      as minimum_hours,
      nullif(btrim(coalesce(e ->> 'pricing_unit_label', '')), '')     as pricing_unit_label
    from jsonb_array_elements(p_services) e
    where btrim(coalesce(e ->> 'name', '')) <> ''
  loop
    v_sort := v_sort + 1;
    v_service_id := null;

    -- Identity first. The id is only trusted within this tenant, so a
    -- supplied id for somebody else's service simply does not match.
    if r_svc.id_text is not null then
      select s.id into v_service_id
      from public.services s
      where s.tenant_id = v_tenant and s.id = r_svc.id_text::uuid;
    end if;

    -- Fallback for a row the wizard has never saved before.
    if v_service_id is null then
      select s.id into v_service_id
      from public.services s
      where s.tenant_id = v_tenant
        and lower(s.name) = lower(r_svc.name)
      limit 1;
    end if;

    if v_service_id is null then
      insert into public.services (
        tenant_id, name, category, duration_minutes, price_cents, deposit_cents,
        buffer_before_minutes, buffer_after_minutes, active, sort,
        pricing_unit, minimum_hours, pricing_unit_label
      ) values (
        v_tenant, r_svc.name, r_svc.category, r_svc.duration_minutes,
        r_svc.price_cents, r_svc.deposit_cents,
        r_svc.buffer_before_minutes, r_svc.buffer_after_minutes, true, v_sort,
        r_svc.pricing_unit, r_svc.minimum_hours, r_svc.pricing_unit_label
      )
      returning id into v_service_id;
    else
      -- Same row, same id: existing bookings, add-ons and staff links survive,
      -- and the NAME is updated rather than used to find a different row.
      update public.services s set
        name = r_svc.name,
        category = r_svc.category,
        duration_minutes = r_svc.duration_minutes,
        price_cents = r_svc.price_cents,
        deposit_cents = r_svc.deposit_cents,
        buffer_before_minutes = r_svc.buffer_before_minutes,
        buffer_after_minutes = r_svc.buffer_after_minutes,
        pricing_unit = r_svc.pricing_unit,
        minimum_hours = r_svc.minimum_hours,
        pricing_unit_label = r_svc.pricing_unit_label,
        active = true,
        sort = v_sort
      where s.id = v_service_id;
    end if;

    v_keep_services := array_append(v_keep_services, v_service_id);
    v_ids := array_append(v_ids, v_service_id);

    -- ---- add-ons for this service ----
    v_keep_addons := array[]::uuid[];
    if p_addons is not null and jsonb_typeof(p_addons) = 'array' then
      for r_addon in
        select
          nullif(btrim(coalesce(e ->> 'id', '')), '')           as id_text,
          btrim(e ->> 'name')                                   as name,
          greatest(0, coalesce((e ->> 'price_cents')::int, 0))   as price_cents,
          greatest(0, coalesce((e ->> 'duration_minutes')::int, 0)) as duration_minutes
        from jsonb_array_elements(p_addons) e
        where btrim(coalesce(e ->> 'name', '')) <> ''
      loop
        v_addon_id := null;

        if r_addon.id_text is not null then
          select sa.id into v_addon_id
          from public.service_addons sa
          where sa.service_id = v_service_id
            and sa.tenant_id = v_tenant
            and sa.id = r_addon.id_text::uuid;
        end if;

        if v_addon_id is null then
          select sa.id into v_addon_id
          from public.service_addons sa
          where sa.service_id = v_service_id
            and lower(sa.name) = lower(r_addon.name)
          limit 1;
        end if;

        if v_addon_id is null then
          insert into public.service_addons (tenant_id, service_id, name, price_cents, duration_minutes)
          values (v_tenant, v_service_id, r_addon.name, r_addon.price_cents, r_addon.duration_minutes)
          returning id into v_addon_id;
        else
          update public.service_addons
             set name = r_addon.name,
                 price_cents = r_addon.price_cents,
                 duration_minutes = r_addon.duration_minutes
           where id = v_addon_id;
        end if;

        v_keep_addons := array_append(v_keep_addons, v_addon_id);
      end loop;
    end if;

    -- Drop this service's de-listed add-ons, but never one a booking priced
    -- against — booking_addons is ON DELETE RESTRICT, and the history matters.
    delete from public.service_addons sa
    where sa.service_id = v_service_id
      and not (sa.id = any (v_keep_addons))
      and not exists (select 1 from public.booking_addons ba where ba.addon_id = sa.id);
  end loop;

  -- ---- services the owner removed from the list ----
  update public.services s
     set active = false
   where s.tenant_id = v_tenant
     and not (s.id = any (v_keep_services))
     and exists (select 1 from public.bookings b where b.service_id = s.id);
  get diagnostics v_deactivated = row_count;

  delete from public.service_addons sa
   where sa.tenant_id = v_tenant
     and not exists (select 1 from public.services s where s.id = sa.service_id and s.id = any (v_keep_services))
     and not exists (select 1 from public.bookings b where b.service_id = sa.service_id)
     and not exists (select 1 from public.booking_addons ba where ba.addon_id = sa.id);

  delete from public.services s
   where s.tenant_id = v_tenant
     and not (s.id = any (v_keep_services))
     and not exists (select 1 from public.bookings b where b.service_id = s.id);
  get diagnostics v_removed = row_count;

  return jsonb_build_object(
    'service_ids', to_jsonb(v_ids),
    'deactivated', v_deactivated,
    'removed', v_removed
  );
end;
$$;

grant execute on function public.onboarding_save_catalog(jsonb, jsonb) to authenticated;

-- ============================================================
-- 8d. Guest booking → a real customer account
-- ============================================================
-- Guest bookings create a customers row with profile_id null, and the portal
-- only shows bookings whose customer row is linked to the signed-in profile.
-- There was no journey from one to the other, so a guest who later got an
-- account saw an empty portal and their own history was unreachable.
--
-- Linking is by verified email and nothing else: the caller must already be
-- signed in as that address, and only unclaimed rows are ever adopted.
create or replace function public.link_guest_customer_records()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_count int;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;

  select lower(p.email) into v_email from public.profiles p where p.id = v_uid;
  if v_email is null or v_email = '' then
    return 0;
  end if;

  update public.customers c
     set profile_id = v_uid
   where lower(c.email) = v_email
     and c.profile_id is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ============================================================
-- 8e. Narrow the SECURITY DEFINER surface
-- ============================================================
-- The advisor flagged 20 SECURITY DEFINER functions callable by client roles.
-- Some of those MUST stay public — guest booking goes through them — so the
-- answer is per-function, not a blanket revoke.
--
-- A definer function runs as its owner, and calls it makes to other functions
-- are made as that owner too. So the internal helpers below need no client
-- grant at all: the public RPCs that use them still work, and a guest can no
-- longer probe them directly.
--
-- IMPORTANT: `create function` grants EXECUTE to PUBLIC by default, and every
-- Supabase role — service_role included — inherits that. So revoking from
-- PUBLIC takes the function away from the background workers too, and each
-- role that still needs it must be named explicitly afterwards. Getting this
-- the wrong way round is how a reminder worker starts failing with
-- "permission denied for function".
revoke execute on function public.assert_booking_slot(uuid, uuid, uuid, timestamptz, timestamptz, uuid, boolean) from public, anon, authenticated;
revoke execute on function public.lock_booking_capacity(uuid, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.service_effective_buffers(uuid) from public, anon, authenticated;
revoke execute on function public.service_pricing_units(uuid, uuid, numeric) from public, anon, authenticated;
revoke execute on function public.service_quote_cents(uuid, uuid, uuid[], numeric) from public, anon, authenticated;
revoke execute on function public.caller_is_privileged() from public, anon, authenticated;
revoke execute on function public.booking_conflicts(uuid, timestamptz, timestamptz, int, int, uuid) from public, anon;
revoke execute on function public.booking_conflicts_for_service(uuid, uuid, timestamptz, timestamptz, uuid) from public, anon;
revoke execute on function public.consume_rate_limit(text, int, int) from public, anon, authenticated;
revoke execute on function public.claim_due_reminders(int, interval) from public, anon, authenticated;
revoke execute on function public.complete_reminder(uuid, boolean, text, text, int) from public, anon, authenticated;
revoke execute on function public.retire_stale_reminders() from public, anon, authenticated;
revoke execute on function public.create_series_occurrence(uuid, timestamptz) from public, anon;
revoke execute on function public.reschedule_booking(uuid, timestamptz) from public, anon;
revoke execute on function public.link_guest_customer_records() from public, anon;

-- Put back exactly what each caller needs, and nothing else.
--   * the dashboard (authenticated) moves appointments and extends series;
--     both functions re-check the caller against the booking's own tenant
grant execute on function public.reschedule_booking(uuid, timestamptz) to authenticated;
grant execute on function public.create_series_occurrence(uuid, timestamptz) to authenticated;
grant execute on function public.booking_conflicts(uuid, timestamptz, timestamptz, int, int, uuid) to authenticated;
grant execute on function public.booking_conflicts_for_service(uuid, uuid, timestamptz, timestamptz, uuid) to authenticated;
grant execute on function public.link_guest_customer_records() to authenticated;
--   * the background workers and the throttle run as the service role
grant execute on function public.claim_due_reminders(int, interval) to service_role;
grant execute on function public.complete_reminder(uuid, boolean, text, text, int) to service_role;
grant execute on function public.retire_stale_reminders() to service_role;
grant execute on function public.consume_rate_limit(text, int, int) to service_role;
grant execute on function public.create_series_occurrence(uuid, timestamptz) to service_role;

-- Deliberately still reachable by a guest (anon), because the public booking
-- page cannot work otherwise. Each one takes a widget public_key and validates
-- the tenant itself:
--   get_widget_config, get_available_slots, quote_booking,
--   create_widget_booking, apply_coupon_to_booking, create_booking_inquiry

-- ============================================================
-- 9. Advisory hygiene
-- ============================================================
-- Mutable search_path on a trigger function that runs on nine tables.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Unindexed foreign keys flagged by the Supabase advisor. Each one is a
-- sequential scan on the referenced row's delete and on every join through it.
create index if not exists bookings_customer_id_idx        on public.bookings (customer_id);
create index if not exists bookings_service_id_idx         on public.bookings (service_id);
create index if not exists bookings_employee_id_idx        on public.bookings (employee_id);
create index if not exists bookings_coupon_id_idx          on public.bookings (coupon_id);
create index if not exists bookings_recurrence_group_idx   on public.bookings (recurrence_group_id);
create index if not exists booking_addons_addon_id_idx     on public.booking_addons (addon_id);
create index if not exists booking_addons_booking_id_idx   on public.booking_addons (booking_id);
create index if not exists booking_reminders_booking_idx   on public.booking_reminders (booking_id);
create index if not exists booking_reminders_customer_idx  on public.booking_reminders (customer_id);
create index if not exists employee_services_service_idx   on public.employee_services (service_id);
create index if not exists availability_employee_idx       on public.availability (employee_id);
create index if not exists time_off_employee_idx           on public.time_off (employee_id);
create index if not exists service_addons_service_idx      on public.service_addons (service_id);
create index if not exists customers_profile_id_idx        on public.customers (profile_id);
create index if not exists employees_profile_id_idx        on public.employees (profile_id);
create index if not exists invoices_customer_id_idx        on public.invoices (customer_id);
create index if not exists invoices_booking_id_idx         on public.invoices (booking_id);
create index if not exists payments_booking_id_idx         on public.payments (booking_id);
create index if not exists payments_invoice_id_idx         on public.payments (invoice_id);
