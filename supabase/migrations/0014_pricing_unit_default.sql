-- ============================================================
-- Diamond Booking — 0014_pricing_unit_default.sql
-- services.pricing_unit defaults to 'flat', not 'hourly'. Apply after 0013.
-- Idempotent.
--
-- 0009 added the column as `not null default 'hourly'`, and
-- onboarding_save_catalog fell back to 'hourly' whenever the payload omitted
-- the field. Between them, every service ever created claimed to be priced by
-- the hour whether or not anyone chose that — all 12 active services in
-- production carried it while being priced as flat jobs, none with a
-- minimum_hours set.
--
-- That was invisible until the B06 work started reading the column, at which
-- point the booking page labelled a $360 flat cleaning job "$360.00 per hour".
-- The label was corrected in the widget (commit 4ebfc0a), but a default that
-- states something untrue about every row is the actual defect, and it would
-- bite again the moment a genuine hourly service appeared beside the fiction.
--
-- 'flat' is the right default: it is the only model that needs no extra
-- information to be correct, and it matches the review's pilot guidance to
-- expose clearly labelled flat totals.
--
-- NOTHING ABOUT PRICING CHANGES. service_pricing_units() returns
-- greatest(quantity, minimum_hours, 1), so an 'hourly' service with no
-- minimum already billed exactly 1 unit — identical to 'flat'. The backfill
-- below is a relabelling of rows that were already being charged flat, not a
-- re-pricing.
-- ============================================================

-- ------------------------------------------------------------
-- 1. The column default
-- ------------------------------------------------------------
alter table public.services alter column pricing_unit set default 'flat';

-- ------------------------------------------------------------
-- 2. Relabel the rows the old default mislabelled
-- ------------------------------------------------------------
-- Deliberately narrow: only services claiming 'hourly' while carrying NO
-- minimum hours. Those are provably billed as flat (1 unit) and provably
-- never had an hourly rate applied, so correcting the label cannot change a
-- single amount. A service with a real minimum is left alone — somebody meant
-- that one.
update public.services
   set pricing_unit = 'flat'
 where pricing_unit = 'hourly'
   and minimum_hours is null;

-- ------------------------------------------------------------
-- 3. The onboarding upsert stops inventing 'hourly'
-- ------------------------------------------------------------
-- Same function as 0013 (identity-based matching intact); the only change is
-- the fallback on the last line of the pricing_unit expression. A Postgres
-- function body cannot be patched in place, so it is restated in full.
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
      -- 'flat' when the caller says nothing, because a flat total is the only
      -- model that is correct without further information (was 'hourly').
      coalesce(nullif(btrim(coalesce(e ->> 'pricing_unit', '')), ''), 'flat') as pricing_unit,
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
