-- ============================================================
-- Diamond Booking — 0010_completeness.sql
-- Storage and logic behind the controls that previously only looked like they
-- worked. Apply after 0009. Idempotent.
--
--   A15  the marketing contact form called setSent(true) and nothing else —
--        no endpoint existed. contact_submissions gives enquiries somewhere
--        to land.
--   A16  coupons lived in React state and were never applied to any booking:
--        create_widget_booking accepted no code and computed no discount.
--   A22  "Invite teammate" was a button with no handler, and no invitation
--        token, email or acceptance route existed anywhere.
--   A29  cancellation_window_hours was collected in onboarding and never read.
--   A34  a day with no openings was a dead end with no way to capture the
--        customer; booking_inquiries holds a request that is explicitly NOT
--        a booking and consumes no capacity.
-- ============================================================

-- ------------------------------------------------------------
-- A15 — contact submissions (platform level, no tenant)
-- ------------------------------------------------------------
create table if not exists public.contact_submissions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  business text,
  message text not null,
  source text not null default 'marketing_contact',
  -- Light abuse forensics; never shown to another tenant.
  user_agent text,
  status text not null default 'new',      -- new | read | replied | spam
  created_at timestamptz not null default now()
);
create index if not exists contact_submissions_created_idx
  on public.contact_submissions (created_at desc);

alter table public.contact_submissions enable row level security;
-- No policies: written by the server action via the service role, read by the
-- super-admin console the same way. Nothing client-side touches it.
revoke all on public.contact_submissions from anon, authenticated;

-- ------------------------------------------------------------
-- A34 — demand capture when nothing is available
-- ------------------------------------------------------------
create table if not exists public.booking_inquiries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  -- The date they wanted, and anything they said about alternatives.
  requested_date date,
  notes text,
  status text not null default 'new',      -- new | contacted | converted | closed
  created_at timestamptz not null default now()
);
create index if not exists booking_inquiries_tenant_idx
  on public.booking_inquiries (tenant_id, status, created_at desc);

alter table public.booking_inquiries enable row level security;

-- Owners see and manage their own tenant's enquiries. Anonymous visitors
-- create them through a SECURITY DEFINER RPC, not directly, so there is no
-- insert policy for anon here.
create policy booking_inquiries_select on public.booking_inquiries for select
using (
  public.auth_role() = 'super_admin'
  or (public.auth_role() in ('business_owner', 'employee') and tenant_id = public.auth_tenant())
);

create policy booking_inquiries_owner_write on public.booking_inquiries for all
using (
  public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and tenant_id = public.auth_tenant())
)
with check (
  public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and tenant_id = public.auth_tenant())
);

-- An enquiry is a request, not a reservation: it holds no slot and blocks
-- nothing. Keyed by widget public_key like the other anonymous RPCs.
create or replace function public.create_booking_inquiry(
  p_public_key text,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text default null,
  p_service_id uuid default null,
  p_requested_date date default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_service uuid;
  v_id uuid;
  v_recent int;
begin
  if p_customer_name is null or btrim(p_customer_name) = '' then
    raise exception 'name_required' using errcode = 'P0001';
  end if;
  if p_customer_email is null or btrim(p_customer_email) = '' then
    raise exception 'email_required' using errcode = 'P0001';
  end if;

  select t.id into v_tenant
  from public.widget_configs w
  join public.tenants t on t.id = w.tenant_id
  where w.public_key = p_public_key and w.active and not t.suspended;
  if not found then
    raise exception 'widget_not_found' using errcode = 'P0001';
  end if;

  -- Cheap flood guard: one email cannot pile up enquiries on a tenant.
  select count(*) into v_recent
  from public.booking_inquiries
  where tenant_id = v_tenant
    and lower(customer_email) = lower(btrim(p_customer_email))
    and created_at > now() - interval '1 hour';
  if v_recent >= 5 then
    raise exception 'too_many_requests' using errcode = 'P0001';
  end if;

  if p_service_id is not null then
    select s.id into v_service
    from public.services s
    where s.id = p_service_id and s.tenant_id = v_tenant;
  end if;

  insert into public.booking_inquiries (
    tenant_id, service_id, customer_name, customer_email, customer_phone,
    requested_date, notes
  ) values (
    v_tenant, v_service, btrim(p_customer_name), lower(btrim(p_customer_email)),
    nullif(btrim(coalesce(p_customer_phone, '')), ''), p_requested_date,
    nullif(btrim(coalesce(p_notes, '')), '')
  )
  returning id into v_id;

  return jsonb_build_object('inquiry_id', v_id);
end;
$$;

grant execute on function public.create_booking_inquiry(text, text, text, text, uuid, date, text) to anon, authenticated;

-- ------------------------------------------------------------
-- A22 — real teammate invitations
-- ------------------------------------------------------------
create table if not exists public.employee_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  email text not null,
  -- Random, single-use, and the only thing that proves the invitation.
  token text unique not null default encode(extensions.gen_random_bytes(24), 'hex'),
  invited_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists employee_invitations_tenant_idx
  on public.employee_invitations (tenant_id, accepted_at);
-- One live invitation per employee.
create unique index if not exists employee_invitations_pending_key
  on public.employee_invitations (employee_id)
  where accepted_at is null and revoked_at is null;

alter table public.employee_invitations enable row level security;

-- Owners manage invitations for their own tenant. The TOKEN is deliberately
-- not readable by anyone else — acceptance goes through a SECURITY DEFINER
-- function keyed by the token, so a client never needs to select it.
create policy employee_invitations_owner on public.employee_invitations for all
using (
  public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and tenant_id = public.auth_tenant())
)
with check (
  public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and tenant_id = public.auth_tenant())
);

/**
 * Accept an invitation: bind the signed-in user's profile to the employee row
 * and move their profile into the tenant as an employee.
 *
 * Runs as the caller's own identity (auth.uid()) and refuses a token that is
 * expired, revoked, already used, or addressed to a different email. The
 * profile's role/tenant_id are protected by the 0007 trigger, which is why
 * this has to be a SECURITY DEFINER function rather than a client update.
 */
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

  select lower(p.email) into v_email from public.profiles p where p.id = v_uid;
  if v_email is distinct from lower(v_inv.email) then
    raise exception 'invitation_email_mismatch' using errcode = 'P0001';
  end if;

  -- Don't steal an employee row already bound to someone else.
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

  update public.profiles
     set tenant_id = v_inv.tenant_id,
         role = 'employee'
   where id = v_uid
     and role not in ('super_admin', 'business_owner');  -- never demote

  update public.employee_invitations
     set accepted_at = now()
   where id = v_inv.id;

  return jsonb_build_object('tenant_id', v_inv.tenant_id, 'employee_id', v_inv.employee_id);
end;
$$;

grant execute on function public.accept_employee_invitation(text) to authenticated;

-- ------------------------------------------------------------
-- A16 — coupons actually applied to a booking
-- ------------------------------------------------------------
alter table public.bookings
  add column if not exists coupon_id uuid references public.coupons(id) on delete set null,
  add column if not exists discount_cents int not null default 0;

alter table public.coupons
  add column if not exists min_subtotal_cents int not null default 0;

/**
 * Price a coupon against a subtotal. Returns the discount in cents, or an
 * error code the caller can translate. Used by the widget (to show the
 * discount) and by create_widget_booking (to apply it), so the quoted and
 * charged amounts cannot drift apart.
 */
create or replace function public.price_coupon(
  p_tenant_id uuid,
  p_code text,
  p_subtotal_cents int
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v public.coupons%rowtype;
  v_discount int;
begin
  if p_code is null or btrim(p_code) = '' then
    return jsonb_build_object('ok', false, 'error', 'no_code');
  end if;

  select * into v
  from public.coupons
  where tenant_id = p_tenant_id and upper(code) = upper(btrim(p_code))
  limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if not v.active then
    return jsonb_build_object('ok', false, 'error', 'inactive');
  end if;
  if v.expires_at is not null and v.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  if v.max_redemptions is not null and v.redemptions >= v.max_redemptions then
    return jsonb_build_object('ok', false, 'error', 'fully_redeemed');
  end if;
  if p_subtotal_cents < v.min_subtotal_cents then
    return jsonb_build_object(
      'ok', false, 'error', 'below_minimum',
      'min_subtotal_cents', v.min_subtotal_cents
    );
  end if;

  v_discount := case
    when v.pct_off is not null then floor(p_subtotal_cents * v.pct_off / 100.0)::int
    else coalesce(v.amount_off_cents, 0)
  end;
  -- Never discount below zero.
  v_discount := least(greatest(v_discount, 0), p_subtotal_cents);

  return jsonb_build_object(
    'ok', true,
    'coupon_id', v.id,
    'code', v.code,
    'discount_cents', v_discount
  );
end;
$$;

grant execute on function public.price_coupon(uuid, text, int) to anon, authenticated;

-- Quote for the widget: price + duration + any coupon, before booking.
create or replace function public.quote_booking(
  p_public_key text,
  p_service_id uuid,
  p_addon_ids uuid[] default array[]::uuid[],
  p_coupon_code text default null
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
  v_addon_total int := 0;
  v_subtotal int;
  v_coupon jsonb;
  v_discount int := 0;
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

  select coalesce(sum(sa.price_cents), 0) into v_addon_total
  from public.service_addons sa
  where sa.id = any (p_addon_ids)
    and sa.service_id = p_service_id
    and sa.tenant_id = v_tenant.id;

  v_subtotal := v_service.price_cents + v_addon_total;
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
    'coupon', v_coupon
  );
end;
$$;

grant execute on function public.quote_booking(text, uuid, uuid[], text) to anon, authenticated;

/**
 * Apply a coupon to a booking that was just created.
 *
 * Kept as its own step rather than another parameter on create_widget_booking
 * so the 200-line booking function is not re-declared a third time. It is
 * narrow on purpose: the caller must present the tenant's widget key, the
 * booking must belong to that tenant, must not already carry a discount, and
 * must have been created in the last two minutes. Booking ids are random
 * UUIDs, but that window is what stops a guessed id from being discounted
 * later by a stranger.
 *
 * The redemption counter is incremented in the same statement that records the
 * discount, so a coupon cannot be over-redeemed by concurrent bookings.
 */
create or replace function public.apply_coupon_to_booking(
  p_public_key text,
  p_booking_id uuid,
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_booking public.bookings%rowtype;
  v_coupon jsonb;
  v_coupon_id uuid;
  v_discount int;
  v_updated int;
begin
  select t.id into v_tenant
  from public.widget_configs w
  join public.tenants t on t.id = w.tenant_id
  where w.public_key = p_public_key and w.active and not t.suspended;
  if not found then
    raise exception 'widget_not_found' using errcode = 'P0001';
  end if;

  select * into v_booking
  from public.bookings
  where id = p_booking_id
    and tenant_id = v_tenant
    and discount_cents = 0
    and created_at > now() - interval '2 minutes';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_applicable');
  end if;

  v_coupon := public.price_coupon(v_tenant, p_code, v_booking.price_cents);
  if not (v_coupon ->> 'ok')::boolean then
    return v_coupon;
  end if;

  v_coupon_id := (v_coupon ->> 'coupon_id')::uuid;
  v_discount  := (v_coupon ->> 'discount_cents')::int;

  -- Claim the redemption first: the WHERE clause is the concurrency guard, so
  -- two simultaneous bookings cannot both take the last redemption.
  update public.coupons
     set redemptions = redemptions + 1
   where id = v_coupon_id
     and active
     and (expires_at is null or expires_at > now())
     and (max_redemptions is null or redemptions < max_redemptions);
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return jsonb_build_object('ok', false, 'error', 'fully_redeemed');
  end if;

  update public.bookings
     set coupon_id = v_coupon_id,
         discount_cents = v_discount,
         price_cents = greatest(0, price_cents - v_discount)
   where id = p_booking_id;

  return jsonb_build_object(
    'ok', true,
    'discount_cents', v_discount,
    'total_cents', greatest(0, v_booking.price_cents - v_discount)
  );
end;
$$;

grant execute on function public.apply_coupon_to_booking(text, uuid, text) to anon, authenticated;
