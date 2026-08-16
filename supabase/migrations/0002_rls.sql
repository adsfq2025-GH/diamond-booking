-- ============================================================
-- Diamond Booking — 0002_rls.sql
-- Complete RLS rollout. Pattern per tenant-scoped table:
--   super_admin        -> everything
--   business_owner     -> rows where tenant_id = their tenant
--   employee           -> tenant rows, narrowed where sensitive:
--                           * no payroll of others (employees base table = own row only;
--                             coworker names come from the employee_directory view)
--                           * no tenant-wide financials (no invoices/payments/coupons)
--                           * job details only for bookings assigned to them
--   customer           -> only rows tied to their own customer record (profile_id)
--   anon (widget)      -> nothing directly; widget goes through SECURITY DEFINER
--                         RPCs (0003_functions.sql) keyed by widget public_key
-- ============================================================

alter table public.tenants           enable row level security;
alter table public.profiles          enable row level security;
alter table public.services          enable row level security;
alter table public.service_addons    enable row level security;
alter table public.employees         enable row level security;
alter table public.employee_services enable row level security;
alter table public.availability      enable row level security;
alter table public.business_hours    enable row level security;
alter table public.time_off          enable row level security;
alter table public.customers         enable row level security;
alter table public.bookings          enable row level security;
alter table public.booking_addons    enable row level security;
alter table public.invoices          enable row level security;
alter table public.invoice_counters  enable row level security;
alter table public.payments          enable row level security;
alter table public.coupons           enable row level security;
alter table public.widget_configs    enable row level security;
alter table public.employee_requests enable row level security;
alter table public.plan_limits       enable row level security;
alter table public.feature_flags     enable row level security;
alter table public.audit_logs        enable row level security;

-- ---------------- tenants ----------------
create policy tenants_select on public.tenants for select
using (
  public.auth_role() = 'super_admin'
  or id = public.auth_tenant()            -- owner, employee, customer: their own tenant (branding, hours page, etc.)
);

create policy tenants_update on public.tenants for update
using (
  public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and id = public.auth_tenant())
)
with check (
  public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and id = public.auth_tenant())
);

create policy tenants_insert on public.tenants for insert
with check (public.auth_role() = 'super_admin');   -- signup/onboarding creates tenants via service role

create policy tenants_delete on public.tenants for delete
using (public.auth_role() = 'super_admin');

-- ---------------- profiles ----------------
create policy profiles_select on public.profiles for select
using (
  id = auth.uid()
  or public.auth_role() = 'super_admin'
  or (public.auth_role() in ('business_owner','employee') and tenant_id = public.auth_tenant())
);

create policy profiles_update on public.profiles for update
using (
  id = auth.uid()
  or public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and tenant_id = public.auth_tenant())
)
with check (
  id = auth.uid()
  or public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and tenant_id = public.auth_tenant())
);

-- Inserts/deletes of profiles happen via the service role (signup server
-- action / invite acceptance / super admin tooling). A self-serve insert
-- policy would let a user attach themselves to an arbitrary tenant with an
-- arbitrary role, so there is deliberately no insert policy here.
create policy profiles_admin_insert on public.profiles for insert
with check (public.auth_role() = 'super_admin');

create policy profiles_admin_delete on public.profiles for delete
using (public.auth_role() = 'super_admin');

-- ---------------- services / service_addons ----------------
create policy services_select on public.services for select
using (
  public.auth_role() = 'super_admin'
  or tenant_id = public.auth_tenant()     -- owner + employee + customer (portal booking needs the catalog)
);

create policy services_write on public.services for all
using (
  public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and tenant_id = public.auth_tenant())
)
with check (
  public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and tenant_id = public.auth_tenant())
);

create policy service_addons_select on public.service_addons for select
using (
  public.auth_role() = 'super_admin'
  or tenant_id = public.auth_tenant()
);

create policy service_addons_write on public.service_addons for all
using (
  public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and tenant_id = public.auth_tenant())
)
with check (
  public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and tenant_id = public.auth_tenant())
);

-- ---------------- employees ----------------
-- Base table carries payroll columns -> employees see ONLY their own row.
-- Coworker names/colors come from the employee_directory view (0001).
create policy employees_select on public.employees for select
using (
  public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and tenant_id = public.auth_tenant())
  or profile_id = auth.uid()
);

create policy employees_write on public.employees for all
using (
  public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and tenant_id = public.auth_tenant())
)
with check (
  public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and tenant_id = public.auth_tenant())
);

-- ---------------- employee_services ----------------
create policy employee_services_select on public.employee_services for select
using (
  public.auth_role() = 'super_admin'
  or exists (
    select 1 from public.services s
    where s.id = employee_services.service_id
      and s.tenant_id = public.auth_tenant()
  )
);

create policy employee_services_write on public.employee_services for all
using (
  public.auth_role() = 'super_admin'
  or (
    public.auth_role() = 'business_owner'
    and exists (
      select 1 from public.employees e
      where e.id = employee_services.employee_id
        and e.tenant_id = public.auth_tenant()
    )
  )
)
with check (
  public.auth_role() = 'super_admin'
  or (
    public.auth_role() = 'business_owner'
    and exists (
      select 1 from public.employees e
      where e.id = employee_services.employee_id
        and e.tenant_id = public.auth_tenant()
    )
  )
);

-- ---------------- availability ----------------
-- Staff can read the whole tenant's schedule grid (needed for the calendar);
-- employees may manage their own rows, owners manage all.
create policy availability_select on public.availability for select
using (
  public.auth_role() = 'super_admin'
  or (public.auth_role() in ('business_owner','employee') and tenant_id = public.auth_tenant())
);

create policy availability_owner_write on public.availability for all
using (
  public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and tenant_id = public.auth_tenant())
)
with check (
  public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and tenant_id = public.auth_tenant())
);

create policy availability_self_write on public.availability for all
using (
  public.auth_role() = 'employee'
  and tenant_id = public.auth_tenant()
  and employee_id = public.auth_employee_id()
)
with check (
  public.auth_role() = 'employee'
  and tenant_id = public.auth_tenant()
  and employee_id = public.auth_employee_id()
);

-- ---------------- business_hours ----------------
create policy business_hours_select on public.business_hours for select
using (
  public.auth_role() = 'super_admin'
  or tenant_id = public.auth_tenant()
);

create policy business_hours_write on public.business_hours for all
using (
  public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and tenant_id = public.auth_tenant())
)
with check (
  public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and tenant_id = public.auth_tenant())
);

-- ---------------- time_off ----------------
-- Owners see all; employees see their own requests + whole-business holidays
-- + approved time off of coworkers (needed to read the schedule).
create policy time_off_select on public.time_off for select
using (
  public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and tenant_id = public.auth_tenant())
  or (
    public.auth_role() = 'employee'
    and tenant_id = public.auth_tenant()
    and (employee_id is null or employee_id = public.auth_employee_id() or status = 'approved')
  )
);

create policy time_off_owner_write on public.time_off for all
using (
  public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and tenant_id = public.auth_tenant())
)
with check (
  public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and tenant_id = public.auth_tenant())
);

-- Employees can file their own requests (always pending) and edit/withdraw
-- them while still pending.
create policy time_off_self_insert on public.time_off for insert
with check (
  public.auth_role() = 'employee'
  and tenant_id = public.auth_tenant()
  and employee_id = public.auth_employee_id()
  and status = 'pending'
);

create policy time_off_self_update on public.time_off for update
using (
  public.auth_role() = 'employee'
  and employee_id = public.auth_employee_id()
  and status = 'pending'
)
with check (
  public.auth_role() = 'employee'
  and employee_id = public.auth_employee_id()
  and status = 'pending'
);

create policy time_off_self_delete on public.time_off for delete
using (
  public.auth_role() = 'employee'
  and employee_id = public.auth_employee_id()
  and status = 'pending'
);

-- ---------------- customers ----------------
-- Employees only see customers whose bookings are assigned to them (job
-- details), never the whole tenant CRM. Customers see/maintain their own row.
create policy customers_select on public.customers for select
using (
  public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and tenant_id = public.auth_tenant())
  or profile_id = auth.uid()
  or (
    public.auth_role() = 'employee'
    and tenant_id = public.auth_tenant()
    and exists (
      select 1 from public.bookings b
      where b.customer_id = customers.id
        and b.employee_id = public.auth_employee_id()
    )
  )
);

create policy customers_owner_write on public.customers for all
using (
  public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and tenant_id = public.auth_tenant())
)
with check (
  public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and tenant_id = public.auth_tenant())
);

create policy customers_self_update on public.customers for update
using (profile_id = auth.uid())
with check (profile_id = auth.uid() and tenant_id = public.auth_tenant());

-- ---------------- bookings ----------------
create policy bookings_select on public.bookings for select
using (
  public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and tenant_id = public.auth_tenant())
  or (public.auth_role() = 'employee' and employee_id = public.auth_employee_id())   -- assigned jobs only
  or (public.auth_role() = 'customer' and customer_id = public.auth_customer_id())
);

create policy bookings_owner_write on public.bookings for all
using (
  public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and tenant_id = public.auth_tenant())
)
with check (
  public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and tenant_id = public.auth_tenant())
);

-- Employees can update their assigned bookings (status, internal notes),
-- but not move them to another tenant/employee (columns still constrained
-- by with check on tenant/assignment).
create policy bookings_employee_update on public.bookings for update
using (
  public.auth_role() = 'employee'
  and employee_id = public.auth_employee_id()
)
with check (
  public.auth_role() = 'employee'
  and employee_id = public.auth_employee_id()
  and tenant_id = public.auth_tenant()
);

-- Customers may book from the portal and cancel/reschedule their own
-- not-yet-completed bookings.
create policy bookings_customer_insert on public.bookings for insert
with check (
  public.auth_role() = 'customer'
  and tenant_id = public.auth_tenant()
  and customer_id = public.auth_customer_id()
  and status = 'pending'
  and source = 'portal'
);

create policy bookings_customer_update on public.bookings for update
using (
  public.auth_role() = 'customer'
  and customer_id = public.auth_customer_id()
  and status in ('pending','confirmed')
)
with check (
  public.auth_role() = 'customer'
  and customer_id = public.auth_customer_id()
  and tenant_id = public.auth_tenant()
);

-- ---------------- booking_addons ----------------
-- Visibility follows the parent booking (RLS on bookings applies inside the
-- subquery because it runs as the calling user).
create policy booking_addons_select on public.booking_addons for select
using (
  exists (select 1 from public.bookings b where b.id = booking_addons.booking_id)
);

create policy booking_addons_write on public.booking_addons for all
using (
  public.auth_role() = 'super_admin'
  or exists (
    select 1 from public.bookings b
    where b.id = booking_addons.booking_id
      and b.tenant_id = public.auth_tenant()
      and public.auth_role() = 'business_owner'
  )
)
with check (
  public.auth_role() = 'super_admin'
  or exists (
    select 1 from public.bookings b
    where b.id = booking_addons.booking_id
      and b.tenant_id = public.auth_tenant()
      and public.auth_role() = 'business_owner'
  )
);

-- ---------------- invoices ----------------
-- No employee access: tenant-wide financials are owner/super_admin only.
-- Customers see their own invoices.
create policy invoices_select on public.invoices for select
using (
  public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and tenant_id = public.auth_tenant())
  or (public.auth_role() = 'customer' and customer_id = public.auth_customer_id())
);

create policy invoices_write on public.invoices for all
using (
  public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and tenant_id = public.auth_tenant())
)
with check (
  public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and tenant_id = public.auth_tenant())
);

-- invoice_counters: RLS enabled, no policies. Only the SECURITY DEFINER
-- numbering trigger (0003) and the service role can touch it.

-- ---------------- payments ----------------
create policy payments_select on public.payments for select
using (
  public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and tenant_id = public.auth_tenant())
  or (public.auth_role() = 'customer' and customer_id = public.auth_customer_id())
);

create policy payments_write on public.payments for all
using (
  public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and tenant_id = public.auth_tenant())
)
with check (
  public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and tenant_id = public.auth_tenant())
);

-- ---------------- coupons ----------------
create policy coupons_select on public.coupons for select
using (
  public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and tenant_id = public.auth_tenant())
  or (public.auth_role() = 'customer' and tenant_id = public.auth_tenant() and active)  -- portal code validation
);

create policy coupons_write on public.coupons for all
using (
  public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and tenant_id = public.auth_tenant())
)
with check (
  public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and tenant_id = public.auth_tenant())
);

-- ---------------- widget_configs ----------------
-- anon never reads this table directly; the widget goes through RPCs.
create policy widget_configs_select on public.widget_configs for select
using (
  public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and tenant_id = public.auth_tenant())
);

create policy widget_configs_write on public.widget_configs for all
using (
  public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and tenant_id = public.auth_tenant())
)
with check (
  public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and tenant_id = public.auth_tenant())
);

-- ---------------- employee_requests ----------------
create policy employee_requests_select on public.employee_requests for select
using (
  public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and tenant_id = public.auth_tenant())
  or employee_id = public.auth_employee_id()
);

create policy employee_requests_owner_write on public.employee_requests for all
using (
  public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and tenant_id = public.auth_tenant())
)
with check (
  public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and tenant_id = public.auth_tenant())
);

create policy employee_requests_self_insert on public.employee_requests for insert
with check (
  public.auth_role() = 'employee'
  and tenant_id = public.auth_tenant()
  and employee_id = public.auth_employee_id()
  and status = 'pending'
);

create policy employee_requests_self_update on public.employee_requests for update
using (
  public.auth_role() = 'employee'
  and employee_id = public.auth_employee_id()
  and status = 'pending'
)
with check (
  public.auth_role() = 'employee'
  and employee_id = public.auth_employee_id()
  and status = 'pending'
);

-- ---------------- plan_limits / feature_flags ----------------
create policy plan_limits_select on public.plan_limits for select
using (auth.uid() is not null);                       -- any signed-in user (gating UI)

create policy plan_limits_write on public.plan_limits for all
using (public.auth_role() = 'super_admin')
with check (public.auth_role() = 'super_admin');

create policy feature_flags_select on public.feature_flags for select
using (auth.uid() is not null);

create policy feature_flags_write on public.feature_flags for all
using (public.auth_role() = 'super_admin')
with check (public.auth_role() = 'super_admin');

-- ---------------- audit_logs ----------------
-- Written only by SECURITY DEFINER triggers (0003) / service role.
create policy audit_logs_select on public.audit_logs for select
using (
  public.auth_role() = 'super_admin'
  or (public.auth_role() = 'business_owner' and tenant_id = public.auth_tenant())
);

-- ============================================================
-- Storage buckets + policies
--   branding  : public-read tenant assets (logos, photos).
--               Path convention: {tenant_id}/...
--   invoices  : private PDFs. Path convention: {tenant_id}/{customer_id}/...
-- ============================================================

insert into storage.buckets (id, name, public)
values ('branding', 'branding', true), ('invoices', 'invoices', false)
on conflict (id) do nothing;

-- branding: anyone can view (bucket is public); only the tenant's owner
-- (or super_admin) can manage files under their tenant folder.
create policy "branding read" on storage.objects for select
using (bucket_id = 'branding');

create policy "branding owner insert" on storage.objects for insert
with check (
  bucket_id = 'branding'
  and (
    public.auth_role() = 'super_admin'
    or (
      public.auth_role() = 'business_owner'
      and (storage.foldername(name))[1] = public.auth_tenant()::text
    )
  )
);

create policy "branding owner update" on storage.objects for update
using (
  bucket_id = 'branding'
  and (
    public.auth_role() = 'super_admin'
    or (
      public.auth_role() = 'business_owner'
      and (storage.foldername(name))[1] = public.auth_tenant()::text
    )
  )
);

create policy "branding owner delete" on storage.objects for delete
using (
  bucket_id = 'branding'
  and (
    public.auth_role() = 'super_admin'
    or (
      public.auth_role() = 'business_owner'
      and (storage.foldername(name))[1] = public.auth_tenant()::text
    )
  )
);

-- invoices: owner reads/writes their tenant folder; a customer can read
-- files under {tenant_id}/{their customer_id}/... (PDFs are usually served
-- via short-lived signed URLs from the server, but direct reads are safe).
create policy "invoices owner all" on storage.objects for all
using (
  bucket_id = 'invoices'
  and (
    public.auth_role() = 'super_admin'
    or (
      public.auth_role() = 'business_owner'
      and (storage.foldername(name))[1] = public.auth_tenant()::text
    )
  )
)
with check (
  bucket_id = 'invoices'
  and (
    public.auth_role() = 'super_admin'
    or (
      public.auth_role() = 'business_owner'
      and (storage.foldername(name))[1] = public.auth_tenant()::text
    )
  )
);

create policy "invoices customer read" on storage.objects for select
using (
  bucket_id = 'invoices'
  and public.auth_role() = 'customer'
  and (storage.foldername(name))[1] = public.auth_tenant()::text
  and (storage.foldername(name))[2] = public.auth_customer_id()::text
);
