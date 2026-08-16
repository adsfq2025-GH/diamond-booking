-- ============================================================
-- Diamond Booking — 0003_functions.sql
-- Triggers (updated_at, invoice numbering, audit log) and the
-- SECURITY DEFINER RPCs that power the anonymous booking widget.
-- ============================================================

-- ---------------- updated_at ----------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger tenants_touch          before update on public.tenants           for each row execute function public.touch_updated_at();
create trigger profiles_touch         before update on public.profiles          for each row execute function public.touch_updated_at();
create trigger services_touch         before update on public.services          for each row execute function public.touch_updated_at();
create trigger employees_touch        before update on public.employees         for each row execute function public.touch_updated_at();
create trigger customers_touch        before update on public.customers         for each row execute function public.touch_updated_at();
create trigger bookings_touch         before update on public.bookings          for each row execute function public.touch_updated_at();
create trigger invoices_touch         before update on public.invoices          for each row execute function public.touch_updated_at();
create trigger widget_configs_touch   before update on public.widget_configs    for each row execute function public.touch_updated_at();
create trigger employee_requests_touch before update on public.employee_requests for each row execute function public.touch_updated_at();

-- ---------------- Per-tenant invoice numbering: INV-YYYY-NNNN ----------------
-- SECURITY DEFINER: invoice_counters has RLS enabled with no policies, so
-- only this trigger (and the service role) can advance the counter. The
-- "on conflict ... do update" takes a row lock, making the counter safe
-- under concurrency.
create or replace function public.set_invoice_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year int := extract(year from coalesce(new.created_at, now()))::int;
  v_n int;
begin
  if new.number is not null and new.number <> '' then
    return new; -- caller supplied an explicit number
  end if;

  insert into public.invoice_counters as ic (tenant_id, year, counter)
  values (new.tenant_id, v_year, 1)
  on conflict (tenant_id, year)
  do update set counter = ic.counter + 1
  returning ic.counter into v_n;

  new.number := format('INV-%s-%s', v_year, lpad(v_n::text, 4, '0'));
  return new;
end;
$$;

-- BEFORE trigger: fills number before the NOT NULL / unique checks run.
create trigger invoices_number before insert on public.invoices
for each row execute function public.set_invoice_number();

-- ---------------- Audit log ----------------
-- SECURITY DEFINER so writes succeed regardless of who mutates the row
-- (audit_logs has no insert policy). For updates only the changed columns
-- are recorded to keep rows small.
create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_tenant uuid;
  v_meta jsonb := '{}';
  v_changed jsonb;
begin
  -- OLD is unassigned on INSERT and NEW on DELETE; only touch what exists.
  if tg_op = 'INSERT' then
    v_new := to_jsonb(new);
    v_meta := jsonb_build_object('new', v_new);
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    select jsonb_object_agg(n.key, jsonb_build_object('old', v_old -> n.key, 'new', n.value))
      into v_changed
    from jsonb_each(v_new) n
    where v_old -> n.key is distinct from n.value;
    v_meta := jsonb_build_object('changed', coalesce(v_changed, '{}'::jsonb));
  else
    v_old := to_jsonb(old);
    v_meta := jsonb_build_object('old', v_old);
  end if;

  v_row := coalesce(v_new, v_old);
  if tg_table_name = 'tenants' then
    v_tenant := (v_row ->> 'id')::uuid;
  else
    v_tenant := (v_row ->> 'tenant_id')::uuid;
  end if;

  insert into public.audit_logs (tenant_id, actor_id, action, entity, entity_id, meta)
  values (v_tenant, auth.uid(), lower(tg_op), tg_table_name, v_row ->> 'id', v_meta);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger bookings_audit after insert or update or delete on public.bookings
for each row execute function public.audit_row();

create trigger invoices_audit after insert or update or delete on public.invoices
for each row execute function public.audit_row();

create trigger tenants_audit after insert or update or delete on public.tenants
for each row execute function public.audit_row();

-- ============================================================
-- Widget RPCs (anonymous flow)
-- The embed widget runs with the anon key and never touches tables
-- directly. Each RPC is keyed by the widget public_key and runs as
-- SECURITY DEFINER with an explicit search_path.
-- ============================================================

-- ---------------- get_widget_config ----------------
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

-- ---------------- get_available_slots ----------------
-- Computes open slots for a service on a given (tenant-local) date from:
--   business hours ∩ employee weekly availability
--   minus approved time off (employee-specific and business-wide)
--   minus existing pending/confirmed bookings (respecting the service's
--   before/after buffers)
--   minus the past.
-- Returns one row per (slot, employee); the widget dedupes by slot_start
-- and passes the chosen employee_id to create_widget_booking.
create or replace function public.get_available_slots(
  p_public_key text,
  p_service_id uuid,
  p_date date
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
  v_buf_before interval;
  v_buf_after interval;
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

  v_duration   := make_interval(mins => v_service.duration_minutes);
  v_buf_before := make_interval(mins => v_service.buffer_before_minutes);
  v_buf_after  := make_interval(mins => v_service.buffer_after_minutes);
  v_weekday    := extract(dow from p_date)::int;   -- 0 = Sunday

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
          and not exists (
            select 1 from public.bookings b
            where b.employee_id = r_emp.id
              and b.status in ('pending', 'confirmed')
              and tstzrange(v_start - v_buf_before, v_end + v_buf_after) && tstzrange(b.starts_at, b.ends_at)
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

-- ---------------- create_widget_booking ----------------
-- Finds/creates the customer and creates the booking in one transaction.
-- Re-checks the slot before inserting; the no_double_booking exclusion
-- constraint is the final guard (a concurrent racer surfaces as the
-- 'slot_taken' exception, not a double booking).
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
  v_buf_before interval;
  v_buf_after interval;
  v_extra_minutes int := 0;
  v_addon_total int := 0;
  v_price int;
  v_status public.booking_status := 'pending';
  v_booking uuid;
  v_local_date date;
  v_local_start time;
  v_local_end time;
  v_weekday int;
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

  -- addons: only addons of this tenant + service count
  select coalesce(sum(sa.price_cents), 0), coalesce(sum(sa.duration_minutes), 0)
    into v_addon_total, v_extra_minutes
  from public.service_addons sa
  where sa.id = any (p_addon_ids)
    and sa.service_id = p_service_id
    and sa.tenant_id = v_tenant.id;

  v_ends_at    := p_starts_at + make_interval(mins => v_service.duration_minutes + v_extra_minutes);
  v_buf_before := make_interval(mins => v_service.buffer_before_minutes);
  v_buf_after  := make_interval(mins => v_service.buffer_after_minutes);
  v_price      := v_service.price_cents + v_addon_total;

  v_local_date  := (p_starts_at at time zone v_tenant.timezone)::date;
  v_local_start := (p_starts_at at time zone v_tenant.timezone)::time;
  v_local_end   := (v_ends_at at time zone v_tenant.timezone)::time;
  v_weekday     := extract(dow from v_local_date)::int;

  -- business must be open
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

  -- pick (or validate) the employee: must offer the service, be available
  -- that weekday at that local time, have no approved time off and no
  -- overlapping pending/confirmed booking (buffers included).
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
    and not exists (
      select 1 from public.bookings b
      where b.employee_id = e.id
        and b.status in ('pending', 'confirmed')
        and tstzrange(p_starts_at - v_buf_before, v_ends_at + v_buf_after) && tstzrange(b.starts_at, b.ends_at)
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

-- ---------------- grants ----------------
-- The widget runs as anon; signed-in users may also call these.
grant execute on function public.get_widget_config(text) to anon, authenticated;
grant execute on function public.get_available_slots(text, uuid, date) to anon, authenticated;
grant execute on function public.create_widget_booking(text, uuid, timestamptz, text, text, text, uuid, jsonb, text, uuid[]) to anon, authenticated;
