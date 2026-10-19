-- ============================================================
-- Diamond Booking — 0009_onboarding_upsert.sql
-- Safe, transactional onboarding persistence. Apply after 0008. Idempotent.
--
--   A13  saveServices deleted every service_addons row, then every services
--        row; saveTeam deleted every employees row. Neither ran in a
--        transaction, and /onboarding stays reachable after launch. Three
--        separate consequences, all real:
--          * services is ON DELETE RESTRICT from bookings, so on a tenant
--            with bookings the services delete failed — AFTER the add-ons had
--            already been deleted, with no rollback.
--          * employees is ON DELETE SET NULL from bookings, so deleting them
--            silently unassigned every existing booking and released the
--            no_double_booking constraint holding those slots.
--          * the add-ons were never re-inserted at all.
--        These RPCs upsert by a stable natural key inside one transaction,
--        and anything a booking references is deactivated rather than removed.
--
--   A21  finishOnboarding set onboarding_complete before doing the work that
--        makes a tenant bookable. onboarding_readiness() computes the real state
--        from the database so the flag can be gated on it.
--
-- All three run as the signed-in business owner: SECURITY DEFINER with the
-- tenant taken from auth_tenant(), never from a parameter, so there is no
-- cross-tenant surface.
-- ============================================================

-- ------------------------------------------------------------
-- Pricing model persistence (part of A14 / F06)
-- ------------------------------------------------------------
-- The wizard collects a pricing unit ("flat", "hourly", "square_foot",
-- "custom") plus a minimum-hours value and a custom unit label, and nothing
-- stored them: services had no column for any of it, so every reload of the
-- wizard re-presented a flat-rate service as hourly. These columns make the
-- round trip honest; duration_minutes remains the single source of truth for
-- how long the job occupies the calendar.
alter table public.services
  add column if not exists pricing_unit text not null default 'hourly',
  add column if not exists minimum_hours numeric(5,2),
  add column if not exists pricing_unit_label text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'services_pricing_unit_check'
  ) then
    alter table public.services
      add constraint services_pricing_unit_check
      check (pricing_unit in ('flat', 'hourly', 'square_foot', 'custom'));
  end if;
end $$;

-- ------------------------------------------------------------
-- Services + add-ons
-- ------------------------------------------------------------
-- p_services: [{ name, category, duration_minutes, price_cents, deposit_cents,
--                buffer_before_minutes, buffer_after_minutes }]
-- p_addons:   [{ name, price_cents, duration_minutes }]  (applied to every service)
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
  r_svc record;
  v_service_id uuid;
  v_sort int := 0;
  v_keep_services uuid[] := array[]::uuid[];
  v_ids uuid[] := array[]::uuid[];
  v_deactivated int := 0;
  v_removed int := 0;
  r_addon record;
  v_keep_addons uuid[];
  v_addon_id uuid;
begin
  if v_role not in ('business_owner', 'super_admin') or v_tenant is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_services is null or jsonb_typeof(p_services) <> 'array'
     or jsonb_array_length(p_services) = 0 then
    raise exception 'services_required' using errcode = 'P0001';
  end if;

  -- ---- upsert each listed service, matched on name within the tenant ----
  for r_svc in
    select
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

    select s.id into v_service_id
    from public.services s
    where s.tenant_id = v_tenant
      and lower(s.name) = lower(r_svc.name)
    limit 1;

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
      -- Same row, same id: existing bookings, add-ons and staff links survive.
      update public.services s set
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

    v_keep_services := v_keep_services || v_service_id;
    v_ids := v_ids || v_service_id;

    -- ---- add-ons for this service ----
    v_keep_addons := array[]::uuid[];
    if p_addons is not null and jsonb_typeof(p_addons) = 'array' then
      for r_addon in
        select
          btrim(e ->> 'name')                                   as name,
          greatest(0, coalesce((e ->> 'price_cents')::int, 0))   as price_cents,
          greatest(0, coalesce((e ->> 'duration_minutes')::int, 0)) as duration_minutes
        from jsonb_array_elements(p_addons) e
        where btrim(coalesce(e ->> 'name', '')) <> ''
      loop
        select sa.id into v_addon_id
        from public.service_addons sa
        where sa.service_id = v_service_id
          and lower(sa.name) = lower(r_addon.name)
        limit 1;

        if v_addon_id is null then
          insert into public.service_addons (tenant_id, service_id, name, price_cents, duration_minutes)
          values (v_tenant, v_service_id, r_addon.name, r_addon.price_cents, r_addon.duration_minutes)
          returning id into v_addon_id;
        else
          update public.service_addons
             set price_cents = r_addon.price_cents,
                 duration_minutes = r_addon.duration_minutes
           where id = v_addon_id;
        end if;

        v_keep_addons := v_keep_addons || v_addon_id;
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
  -- Referenced by a booking: deactivate (hidden from the widget, history
  -- intact). Never referenced: delete.
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

-- ------------------------------------------------------------
-- Team
-- ------------------------------------------------------------
-- p_members: [{ name, email, title, color }]
create or replace function public.onboarding_save_team(
  p_owner_bookable boolean,
  p_owner_color text,
  p_members jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.auth_tenant();
  v_role public.user_role := public.auth_role();
  v_uid uuid := auth.uid();
  v_owner_name text;
  v_keep uuid[] := array[]::uuid[];
  v_employee uuid;
  r_member record;
  v_deactivated int := 0;
  v_removed int := 0;
begin
  if v_role not in ('business_owner', 'super_admin') or v_tenant is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select p.full_name into v_owner_name from public.profiles p where p.id = v_uid;

  -- ---- the owner's own bookable row ----
  select e.id into v_employee
  from public.employees e
  where e.tenant_id = v_tenant and e.profile_id = v_uid
  limit 1;

  if p_owner_bookable then
    if v_employee is null then
      insert into public.employees (tenant_id, profile_id, display_name, title, color, active)
      values (v_tenant, v_uid, v_owner_name, 'Owner', coalesce(nullif(p_owner_color, ''), '#2e86c1'), true)
      returning id into v_employee;
    else
      update public.employees
         set display_name = coalesce(v_owner_name, display_name),
             title = coalesce(title, 'Owner'),
             color = coalesce(nullif(p_owner_color, ''), color),
             active = true
       where id = v_employee;
    end if;
    v_keep := v_keep || v_employee;
  end if;

  -- ---- invited teammates, matched on invite email, else on display name ----
  if p_members is not null and jsonb_typeof(p_members) = 'array' then
    for r_member in
      select
        nullif(btrim(coalesce(e ->> 'name', '')), '')               as name,
        lower(nullif(btrim(coalesce(e ->> 'email', '')), ''))       as email,
        nullif(btrim(coalesce(e ->> 'title', '')), '')              as title,
        nullif(btrim(coalesce(e ->> 'color', '')), '')              as color
      from jsonb_array_elements(p_members) e
      where btrim(coalesce(e ->> 'name', '')) <> ''
         or btrim(coalesce(e ->> 'email', '')) <> ''
    loop
      v_employee := null;

      if r_member.email is not null then
        select e.id into v_employee
        from public.employees e
        where e.tenant_id = v_tenant and lower(e.invite_email) = r_member.email
        limit 1;
      end if;
      if v_employee is null and r_member.name is not null then
        select e.id into v_employee
        from public.employees e
        where e.tenant_id = v_tenant
          and e.profile_id is distinct from v_uid
          and lower(e.display_name) = lower(r_member.name)
        limit 1;
      end if;

      if v_employee is null then
        insert into public.employees (tenant_id, invite_email, display_name, title, color, active)
        values (v_tenant, r_member.email, r_member.name, r_member.title,
                coalesce(r_member.color, '#5a88a8'), true)
        returning id into v_employee;
      else
        update public.employees
           set invite_email = coalesce(r_member.email, invite_email),
               display_name = coalesce(r_member.name, display_name),
               title = coalesce(r_member.title, title),
               color = coalesce(r_member.color, color),
               active = true
         where id = v_employee;
      end if;

      v_keep := v_keep || v_employee;
    end loop;
  end if;

  -- ---- people the owner removed from the list ----
  -- An employee with bookings is deactivated, NEVER deleted: deleting them
  -- nulls employee_id on their bookings (ON DELETE SET NULL), which loses the
  -- assignment and frees the slot the no_double_booking constraint was holding.
  update public.employees e
     set active = false
   where e.tenant_id = v_tenant
     and not (e.id = any (v_keep))
     and exists (select 1 from public.bookings b where b.employee_id = e.id);
  get diagnostics v_deactivated = row_count;

  delete from public.employees e
   where e.tenant_id = v_tenant
     and not (e.id = any (v_keep))
     and not exists (select 1 from public.bookings b where b.employee_id = e.id);
  get diagnostics v_removed = row_count;

  return jsonb_build_object('deactivated', v_deactivated, 'removed', v_removed);
end;
$$;

-- ------------------------------------------------------------
-- Readiness (A21)
-- ------------------------------------------------------------
-- What the database can actually prove about this tenant, as opposed to what
-- the wizard believes it saved. Separates "can take a booking at all" from
-- "can take money", because those gate different things.
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

  -- staff who can actually be booked: linked to a service AND holding hours
  select count(distinct e.id) into v_linked
    from public.employees e
    join public.employee_services es on es.employee_id = e.id
    join public.services s on s.id = es.service_id and s.active
   where e.tenant_id = v_tenant and e.active;

  select count(distinct e.id) into v_with_hours
    from public.employees e
    join public.availability a on a.employee_id = e.id
   where e.tenant_id = v_tenant and e.active;

  select
    coalesce((t.settings -> 'payments_enabled')::text = 'true', false),
    coalesce(t.stripe_charges_enabled, false)
  into v_payments_enabled, v_charges_enabled
  from public.tenants t where t.id = v_tenant;

  select count(*) into v_deposit_services
    from public.services where tenant_id = v_tenant and active and deposit_cents > 0;

  if v_services = 0 then v_blockers := v_blockers || 'no_active_services'; end if;
  if v_staff = 0 then v_blockers := v_blockers || 'no_active_staff'; end if;
  if v_open_days = 0 then v_blockers := v_blockers || 'no_open_days'; end if;
  if v_staff > 0 and v_linked = 0 then v_blockers := v_blockers || 'no_staff_qualified_for_any_service'; end if;
  if v_staff > 0 and v_with_hours = 0 then v_blockers := v_blockers || 'no_staff_working_hours'; end if;
  if v_deposit_services > 0 and v_payments_enabled and not v_charges_enabled then
    v_blockers := v_blockers || 'deposits_configured_without_stripe_charges';
  end if;

  return jsonb_build_object(
    'booking_ready', (
      v_services > 0 and v_staff > 0 and v_open_days > 0
      and v_linked > 0 and v_with_hours > 0
    ),
    'payment_ready', coalesce(v_payments_enabled and v_charges_enabled, false),
    'counts', jsonb_build_object(
      'active_services', v_services,
      'active_staff', v_staff,
      'open_days', v_open_days,
      'staff_linked_to_a_service', v_linked,
      'staff_with_hours', v_with_hours,
      'services_with_deposits', v_deposit_services
    ),
    'blockers', to_jsonb(v_blockers)
  );
end;
$$;

grant execute on function public.onboarding_save_catalog(jsonb, jsonb) to authenticated;
grant execute on function public.onboarding_save_team(boolean, text, jsonb) to authenticated;
grant execute on function public.onboarding_readiness() to authenticated;
