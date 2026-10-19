-- ============================================================
-- Diamond Booking — 0008_booking_correctness.sql
-- Availability and conflict correctness. Apply after 0007. Idempotent.
--
--   A09  get_available_slots sized every candidate with the service duration
--        alone, while create_widget_booking added the selected add-ons'
--        duration before checking hours and conflicts. Customers were offered
--        start times that could not hold the job they had configured, and the
--        booking then failed after the form was filled in. The slot search now
--        takes the add-on ids and both paths compute duration identically.
--
--   A10  Both overlap tests expanded the CANDIDATE by its buffers but compared
--        against the existing booking's RAW range, so the existing booking's
--        buffers were ignored entirely. tstzrange is half-open, so a job
--        ending 11:30 with a 30-minute after-buffer did not block an 11:30
--        start. Both sides are now expanded by their own service's buffers.
--
--   A28  create_widget_booking returned 'slot_taken' for every reason a slot
--        was unusable. It now distinguishes a real conflict from "no employee
--        is qualified / scheduled for that time", so the widget can say
--        something true.
-- ============================================================

-- One definition of "how long does this booking occupy the calendar", used by
-- the slot search, the booking insert and the quote. Add-ons are only counted
-- when they genuinely belong to this tenant's service — an unknown or foreign
-- id contributes nothing rather than silently extending the job.
create or replace function public.booking_duration_minutes(
  p_service_id uuid,
  p_tenant_id uuid,
  p_addon_ids uuid[]
)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select s.duration_minutes + coalesce((
    select sum(sa.duration_minutes)
    from public.service_addons sa
    where sa.id = any (coalesce(p_addon_ids, array[]::uuid[]))
      and sa.service_id = p_service_id
      and sa.tenant_id = p_tenant_id
  ), 0)
  from public.services s
  where s.id = p_service_id and s.tenant_id = p_tenant_id
$$;

-- Does [p_start, p_end) — once padded by this service's buffers — collide with
-- any active booking of this employee, padded by ITS service's buffers?
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
    join public.services bs on bs.id = b.service_id
    where b.employee_id = p_employee_id
      and b.status in ('pending', 'confirmed')
      and (p_ignore_booking_id is null or b.id <> p_ignore_booking_id)
      and tstzrange(
            p_start - make_interval(mins => coalesce(p_buffer_before_minutes, 0)),
            p_end   + make_interval(mins => coalesce(p_buffer_after_minutes, 0))
          )
          && tstzrange(
            b.starts_at - make_interval(mins => bs.buffer_before_minutes),
            b.ends_at   + make_interval(mins => bs.buffer_after_minutes)
          )
  )
$$;

-- ------------------------------------------------------------
-- get_available_slots — now add-on aware
-- ------------------------------------------------------------
-- The old 3-argument version is dropped so no stale caller can silently get
-- add-on-blind results; the new one defaults p_addon_ids, so a 3-argument call
-- still resolves to it.
drop function if exists public.get_available_slots(text, uuid, date);

create or replace function public.get_available_slots(
  p_public_key text,
  p_service_id uuid,
  p_date date,
  p_addon_ids uuid[] default array[]::uuid[]
)
returns table (slot_start timestamptz, slot_end timestamptz, employee_id uuid)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_tenant public.tenants%rowtype;
  v_service public.services%rowtype;
  v_weekday int;
  v_open time;
  v_close time;
  v_closed boolean;
  v_step interval := interval '30 minutes';
  v_duration interval;
  r_emp record;
  r_avail record;
  v_from time;
  v_to time;
  v_t time;
  v_start timestamptz;
  v_end timestamptz;
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

  -- Service duration PLUS the selected add-ons, exactly as the booking will.
  v_duration := make_interval(mins => public.booking_duration_minutes(
    p_service_id, v_tenant.id, p_addon_ids
  ));
  v_weekday := extract(dow from p_date)::int;   -- 0 = Sunday

  select bh.open_time, bh.close_time, bh.closed
    into v_open, v_close, v_closed
  from public.business_hours bh
  where bh.tenant_id = v_tenant.id and bh.weekday = v_weekday;
  if not found or coalesce(v_closed, true) or v_open is null or v_close is null then
    return; -- closed that day
  end if;

  for r_emp in
    select e.id
    from public.employees e
    join public.employee_services es
      on es.employee_id = e.id and es.service_id = v_service.id
    where e.tenant_id = v_tenant.id and e.active
  loop
    for r_avail in
      select a.start_time, a.end_time
      from public.availability a
      where a.employee_id = r_emp.id and a.weekday = v_weekday
    loop
      v_from := greatest(v_open, r_avail.start_time);
      v_to   := least(v_close, r_avail.end_time);
      v_t    := v_from;

      -- second clause guards against time-type wraparound past midnight
      while v_t + v_duration <= v_to and v_t + v_duration > v_t loop
        -- interpret the local wall-clock time in the tenant's timezone
        v_start := (p_date + v_t) at time zone v_tenant.timezone;
        v_end   := v_start + v_duration;

        if v_start > now()
          and not public.booking_conflicts(
                r_emp.id, v_start, v_end,
                v_service.buffer_before_minutes, v_service.buffer_after_minutes
              )
          and not exists (
            select 1 from public.time_off toff
            where toff.tenant_id = v_tenant.id
              and toff.status = 'approved'
              and (toff.employee_id is null or toff.employee_id = r_emp.id)
              and tstzrange(v_start, v_end) && tstzrange(toff.starts_at, toff.ends_at)
          )
        then
          slot_start  := v_start;
          slot_end    := v_end;
          employee_id := r_emp.id;
          return next;
        end if;

        v_t := v_t + v_step;
      end loop;
    end loop;
  end loop;

  return;
end;
$$;

-- ------------------------------------------------------------
-- create_widget_booking — shared duration, symmetric buffers, honest errors
-- ------------------------------------------------------------
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
  p_addon_ids uuid[] default array[]::uuid[]
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
  v_addon_total int := 0;
  v_price int;
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

  if p_starts_at <= now() then
    raise exception 'slot_in_past' using errcode = 'P0001';
  end if;

  -- Price from the same add-on filter the duration helper applies.
  select coalesce(sum(sa.price_cents), 0) into v_addon_total
  from public.service_addons sa
  where sa.id = any (p_addon_ids)
    and sa.service_id = p_service_id
    and sa.tenant_id = v_tenant.id;

  -- Duration via the shared helper, so the span booked is exactly the span the
  -- slot search offered.
  v_ends_at := p_starts_at + make_interval(mins => public.booking_duration_minutes(
    p_service_id, v_tenant.id, p_addon_ids
  ));
  v_price := v_service.price_cents + v_addon_total;

  v_local_date  := (p_starts_at at time zone v_tenant.timezone)::date;
  v_local_start := (p_starts_at at time zone v_tenant.timezone)::time;
  v_local_end   := (v_ends_at at time zone v_tenant.timezone)::time;
  v_weekday     := extract(dow from v_local_date)::int;

  -- A job that runs past midnight cannot be expressed against business hours,
  -- which are per-weekday wall-clock times: reject it explicitly instead of
  -- failing the comparison in a confusing way.
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
    and not public.booking_conflicts(
          e.id, p_starts_at, v_ends_at,
          v_service.buffer_before_minutes, v_service.buffer_after_minutes
        )
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
      address, customer_notes, source
    ) values (
      v_tenant.id, v_customer, p_service_id, v_employee, v_status,
      p_starts_at, v_ends_at, v_price, v_service.deposit_cents,
      p_address, nullif(btrim(coalesce(p_notes, '')), ''), 'widget'
    )
    returning id into v_booking;
  exception
    when exclusion_violation then
      -- a concurrent request won the race; the constraint is the final guard
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
    'deposit_cents', v_service.deposit_cents
  );
end;
$$;

-- ------------------------------------------------------------
-- grants (the dropped/replaced functions need them re-stated)
-- ------------------------------------------------------------
grant execute on function public.get_available_slots(text, uuid, date, uuid[]) to anon, authenticated;
grant execute on function public.create_widget_booking(text, uuid, timestamptz, text, text, text, uuid, jsonb, text, uuid[]) to anon, authenticated;
-- Helpers are called from inside the definer RPCs; they are also safe to call
-- directly from the dashboard (reschedule conflict pre-check).
grant execute on function public.booking_duration_minutes(uuid, uuid, uuid[]) to authenticated;
grant execute on function public.booking_conflicts(uuid, timestamptz, timestamptz, int, int, uuid) to authenticated;
