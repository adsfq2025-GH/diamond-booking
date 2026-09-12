alter table public.tenants
  add column if not exists stripe_connect_account_id text,
  add column if not exists stripe_connect_status text,
  add column if not exists stripe_charges_enabled boolean not null default false,
  add column if not exists stripe_payouts_enabled boolean not null default false;

create table if not exists public.google_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null default 'google',
  email text,
  calendar_id text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  sync_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, provider)
);

create index if not exists google_calendar_connections_tenant_idx on public.google_calendar_connections (tenant_id, profile_id);

create table if not exists public.booking_reminders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  channel text not null,
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  status text not null default 'pending',
  external_id text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_id, channel, scheduled_for)
);

create index if not exists booking_reminders_tenant_status_idx on public.booking_reminders (tenant_id, status, scheduled_for);

alter table public.google_calendar_connections enable row level security;
alter table public.booking_reminders enable row level security;

create policy google_calendar_connections_select on public.google_calendar_connections for select
using (
  public.auth_role() = 'super_admin'
  or (public.auth_role() in ('business_owner','employee') and tenant_id = public.auth_tenant())
);

create policy google_calendar_connections_write on public.google_calendar_connections for all
using (
  public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and tenant_id = public.auth_tenant())
  or (public.auth_role() = 'employee' and profile_id = auth.uid() and tenant_id = public.auth_tenant())
)
with check (
  public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and tenant_id = public.auth_tenant())
  or (public.auth_role() = 'employee' and profile_id = auth.uid() and tenant_id = public.auth_tenant())
);

create policy booking_reminders_select on public.booking_reminders for select
using (
  public.auth_role() = 'super_admin'
  or (public.auth_role() in ('business_owner','employee') and tenant_id = public.auth_tenant())
);

create policy booking_reminders_write on public.booking_reminders for all
using (
  public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and tenant_id = public.auth_tenant())
)
with check (
  public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and tenant_id = public.auth_tenant())
);
