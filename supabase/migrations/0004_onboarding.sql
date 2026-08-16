-- ============================================================
-- Diamond Booking — 0004_onboarding.sql
-- Schema gap found while building the onboarding wizard:
--
-- Step 3 (Team) collects a NAME for each invited employee, but names
-- previously lived only on profiles.full_name — which doesn't exist until
-- the invite is accepted (employees.profile_id is null until then). The
-- calendar, the wizard and the day sheet all need something to display for
-- a not-yet-accepted teammate, so employees gets a display_name column.
--
-- Once the invite is accepted, profiles.full_name wins (see the view
-- below); display_name is only the pre-acceptance fallback.
-- ============================================================

alter table public.employees
  add column if not exists display_name text;

-- employee_directory: same contract as 0001 (payroll-free tenant-wide
-- directory), but full_name now falls back to the pre-invite display_name.
create or replace view public.employee_directory
with (security_invoker = off) as
select
  e.id,
  e.tenant_id,
  e.profile_id,
  coalesce(p.full_name, e.display_name) as full_name,
  e.title,
  e.color,
  e.active
from public.employees e
left join public.profiles p on p.id = e.profile_id
where e.tenant_id = public.auth_tenant()
   or public.auth_role() = 'super_admin';

grant select on public.employee_directory to authenticated;
revoke all on public.employee_directory from anon;
