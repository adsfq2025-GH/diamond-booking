-- ============================================================
-- 0012 — fix onboarding_readiness(): malformed array literal
--
-- 0009 built the blockers list with:
--
--     v_blockers := v_blockers || 'no_active_services';
--
-- `||` is overloaded. With a text[] on the left and an UNTYPED literal on the
-- right, Postgres resolves the operator to `anyarray || anyarray` rather than
-- `anyarray || anyelement`, so it tries to parse the string AS an array and
-- fails at runtime:
--
--     ERROR 22P02: malformed array literal: "no_active_services"
--     DETAIL: Array value must start with "{" or dimension information.
--
-- This is a RUNTIME error, not a compile-time one — PL/pgSQL validates syntax
-- when the function is created but resolves the expression only when the branch
-- executes. So 0009 applied cleanly and the defect sat dormant until a tenant
-- actually hit a blocker. Any tenant with no active services, no staff, no open
-- days, unlinked staff, staff without hours, or deposits configured before
-- Stripe charges were enabled would have had the readiness check throw instead
-- of telling them what was missing.
--
-- `array_append` has no overload to be confused about. The fix replaces all six
-- concatenations with it.
--
-- Safe to run more than once. Nothing but the function body changes.
-- ============================================================

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

  if v_services = 0 then v_blockers := array_append(v_blockers, 'no_active_services'); end if;
  if v_staff = 0 then v_blockers := array_append(v_blockers, 'no_active_staff'); end if;
  if v_open_days = 0 then v_blockers := array_append(v_blockers, 'no_open_days'); end if;
  if v_staff > 0 and v_linked = 0 then v_blockers := array_append(v_blockers, 'no_staff_qualified_for_any_service'); end if;
  if v_staff > 0 and v_with_hours = 0 then v_blockers := array_append(v_blockers, 'no_staff_working_hours'); end if;
  if v_deposit_services > 0 and v_payments_enabled and not v_charges_enabled then
    v_blockers := array_append(v_blockers, 'deposits_configured_without_stripe_charges');
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

grant execute on function public.onboarding_readiness() to authenticated;
