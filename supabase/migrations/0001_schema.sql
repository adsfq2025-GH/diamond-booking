-- ============================================================
-- Diamond Booking — 0001_schema.sql
-- Multi-tenant schema (Supabase / Postgres).
-- Tenant isolation is enforced by RLS on every table (see 0002_rls.sql):
-- no query can cross a tenant boundary even if app code is wrong.
-- ============================================================

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions; -- uuid equality in GiST (no-double-booking)
create extension if not exists pgcrypto  with schema extensions; -- gen_random_bytes for widget keys

-- ---------- Enums ----------
create type public.user_role as enum ('super_admin', 'business_owner', 'employee', 'customer');
create type public.booking_status as enum ('pending', 'confirmed', 'completed', 'cancelled', 'rescheduled', 'no_show');
create type public.invoice_status as enum ('draft', 'sent', 'paid', 'partially_paid', 'overdue', 'refunded', 'void');
create type public.payment_status as enum ('requires_payment', 'processing', 'succeeded', 'failed', 'refunded');
create type public.plan_tier as enum ('starter', 'professional', 'elite');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'canceled', 'suspended');
create type public.request_status as enum ('pending', 'approved', 'denied');

-- ---------- Tenants ----------
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,                    -- widget + booking-page identity
  name text not null,
  industry text,
  email text,
  phone text,
  address jsonb,
  timezone text not null default 'America/New_York',
  branding jsonb not null default '{}',         -- logo_url, colors, photos
  settings jsonb not null default '{}',         -- confirmation rules, cancellation policy, deposits, buffers
  plan public.plan_tier not null default 'starter',
  subscription_status public.subscription_status not null default 'trialing',
  trial_ends_at timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  suspended boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Users ----------
-- One row per auth.users account. tenant_id is null only for super_admin.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete cascade,
  role public.user_role not null,
  full_name text not null,
  email text not null,
  phone text,
  avatar_url text,
  notification_prefs jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_required check (role = 'super_admin' or tenant_id is not null)
);
create index profiles_tenant_role_idx on public.profiles (tenant_id, role);

-- ---------- RLS helper functions ----------
-- SECURITY DEFINER so they can read profiles/employees/customers without
-- tripping RLS recursion (policies on those tables call these functions).
create or replace function public.auth_role()
returns public.user_role
language sql stable security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.auth_tenant()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select tenant_id from public.profiles where id = auth.uid()
$$;

-- (auth_employee_id / auth_customer_id are defined further down, after the
--  employees and customers tables exist — SQL function bodies are validated
--  at creation time.)

-- ---------- Services ----------
create table public.services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  description text,
  category text,
  duration_minutes int not null check (duration_minutes > 0),
  price_cents int not null check (price_cents >= 0),
  deposit_cents int not null default 0,
  buffer_before_minutes int not null default 0,
  buffer_after_minutes int not null default 0,
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index services_tenant_active_idx on public.services (tenant_id, active);

create table public.service_addons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  name text not null,
  price_cents int not null default 0,
  duration_minutes int not null default 0
);
create index service_addons_service_idx on public.service_addons (service_id);

-- ---------- Employees ----------
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  profile_id uuid unique references public.profiles(id) on delete set null,  -- null until they accept invite
  invite_email text,
  title text,
  color text,                                   -- calendar color
  hourly_rate_cents int,
  commission_pct numeric(5,2),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index employees_tenant_active_idx on public.employees (tenant_id, active);

create table public.employee_services (
  employee_id uuid references public.employees(id) on delete cascade,
  service_id uuid references public.services(id) on delete cascade,
  primary key (employee_id, service_id)
);

-- Weekly recurring availability (employee-level; business_hours is tenant-level)
create table public.availability (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),   -- 0 = Sunday (Postgres dow)
  start_time time not null,
  end_time time not null,
  constraint availability_range check (end_time > start_time)
);
create index availability_employee_weekday_idx on public.availability (employee_id, weekday);

create table public.business_hours (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),   -- 0 = Sunday
  open_time time,
  close_time time,
  closed boolean not null default false,
  primary key (tenant_id, weekday)
);

create table public.time_off (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete cascade,  -- null = whole-business holiday
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  status public.request_status not null default 'approved',            -- employee requests start 'pending'
  created_at timestamptz not null default now(),
  constraint time_off_range check (ends_at > starts_at)
);
create index time_off_tenant_idx on public.time_off (tenant_id, starts_at);

-- ---------- Customers ----------
-- A customer record belongs to ONE tenant. A person with accounts at two
-- businesses = two customer rows (strict isolation per spec).
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,   -- null = guest (booked via widget, no portal account yet)
  full_name text not null,
  email text not null,
  phone text,
  addresses jsonb not null default '[]',
  notes text,
  tags text[] not null default '{}',
  stripe_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, email)
);
create index customers_tenant_idx on public.customers (tenant_id);
create index customers_profile_idx on public.customers (profile_id);

-- ---------- RLS helper functions (part 2) ----------
-- Employee row belonging to the signed-in user (null for non-employees).
create or replace function public.auth_employee_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select e.id from public.employees e where e.profile_id = auth.uid() limit 1
$$;

-- Customer row belonging to the signed-in user (null for non-customers).
create or replace function public.auth_customer_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select c.id from public.customers c where c.profile_id = auth.uid() limit 1
$$;

-- ---------- Bookings ----------
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  service_id uuid not null references public.services(id) on delete restrict,
  employee_id uuid references public.employees(id) on delete set null,
  status public.booking_status not null default 'pending',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  price_cents int not null,
  deposit_cents int not null default 0,
  address jsonb,                                 -- job site for home services
  customer_notes text,
  internal_notes text,
  source text not null default 'widget',         -- widget | portal | admin
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_range check (ends_at > starts_at),
  -- THE no-double-booking guarantee: one employee cannot hold two
  -- overlapping non-cancelled bookings. Enforced by the database.
  constraint no_double_booking exclude using gist (
    employee_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (employee_id is not null and status in ('pending','confirmed'))
);
create index bookings_tenant_starts_idx on public.bookings (tenant_id, starts_at);
create index bookings_tenant_status_idx on public.bookings (tenant_id, status);
create index bookings_customer_idx on public.bookings (customer_id);
create index bookings_employee_starts_idx on public.bookings (employee_id, starts_at);

create table public.booking_addons (
  booking_id uuid references public.bookings(id) on delete cascade,
  addon_id uuid references public.service_addons(id) on delete restrict,
  price_cents int not null,
  primary key (booking_id, addon_id)
);

-- ---------- Invoices & Payments ----------
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  booking_id uuid references public.bookings(id) on delete set null,
  number text not null,                          -- e.g. INV-2026-0042, per tenant (trigger-assigned when omitted)
  status public.invoice_status not null default 'draft',
  line_items jsonb not null default '[]',
  subtotal_cents int not null default 0,
  tax_cents int not null default 0,
  total_cents int not null default 0,
  paid_cents int not null default 0,
  due_at timestamptz,
  pdf_path text,                                 -- storage path in the 'invoices' bucket
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, number)
);
create index invoices_tenant_idx on public.invoices (tenant_id, created_at desc);
create index invoices_customer_idx on public.invoices (customer_id);

-- Per-tenant, per-year invoice number counter (used by trigger in 0003).
-- No user-facing policies; only touched by the SECURITY DEFINER trigger.
create table public.invoice_counters (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  year int not null,
  counter int not null default 0,
  primary key (tenant_id, year)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  stripe_payment_intent_id text,
  amount_cents int not null,
  status public.payment_status not null,
  kind text not null default 'payment',          -- payment | deposit | refund
  created_at timestamptz not null default now()
);
create index payments_tenant_idx on public.payments (tenant_id, created_at desc);
create index payments_customer_idx on public.payments (customer_id);

-- ---------- Marketing ----------
create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  pct_off numeric(5,2),
  amount_off_cents int,
  active boolean not null default true,
  expires_at timestamptz,
  max_redemptions int,
  redemptions int not null default 0,
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);

-- ---------- Widget ----------
create table public.widget_configs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  public_key text unique not null default encode(extensions.gen_random_bytes(12), 'hex'),
  theme jsonb not null default '{}',             -- colors, radius, font, layout
  custom_fields jsonb not null default '[]',
  allowed_domains text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index widget_configs_tenant_idx on public.widget_configs (tenant_id);

-- ---------- Employee requests (time off handled above; the rest) ----------
create table public.employee_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  kind text not null,                            -- schedule_change | equipment | message
  body text not null,
  status public.request_status not null default 'pending',
  response text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index employee_requests_tenant_idx on public.employee_requests (tenant_id, status);

-- ---------- Platform (super admin) ----------
create table public.plan_limits (
  plan public.plan_tier primary key,
  max_employees int,                             -- null = unlimited
  max_services int,                              -- null = unlimited
  features jsonb not null default '{}'           -- feature flags per tier
);

create table public.feature_flags (
  key text primary key,
  enabled boolean not null default false,
  description text
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  tenant_id uuid references public.tenants(id) on delete set null,
  actor_id uuid,
  action text not null,
  entity text,
  entity_id text,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_logs_tenant_created_idx on public.audit_logs (tenant_id, created_at desc);

-- ---------- Employee directory view ----------
-- Employees may see who their coworkers are (names, colors, titles) but NOT
-- payroll columns (hourly_rate_cents, commission_pct). RLS on the base table
-- restricts employees to their own row; this definer view provides the
-- payroll-free tenant-wide directory.
create view public.employee_directory
with (security_invoker = off) as
select
  e.id,
  e.tenant_id,
  e.profile_id,
  p.full_name,
  e.title,
  e.color,
  e.active
from public.employees e
left join public.profiles p on p.id = e.profile_id
where e.tenant_id = public.auth_tenant()
   or public.auth_role() = 'super_admin';

grant select on public.employee_directory to authenticated;
revoke all on public.employee_directory from anon;
