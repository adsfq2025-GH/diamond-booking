-- ============================================================
-- Diamond Booking — which migrations are actually applied?
--
-- Run this FIRST, before any migration, on any database you are about to
-- change. Read-only: it creates nothing and changes nothing.
--
-- Why not just read supabase_migrations.schema_migrations? Because that table
-- is only populated by `supabase db push` (the CLI). If the migrations were
-- applied by pasting them into the SQL editor — which is what docs/GO-LIVE.md
-- used to tell you to do — it is empty or stale, and will cheerfully tell you
-- nothing is applied when half of it is.
--
-- So this probes for the OBJECTS each migration creates. That is the ground
-- truth, whatever the bookkeeping says.
-- ============================================================

with probe as (
  select * from (values
    -- migration, what it must have created, how to detect it
    ('0001_schema',             'table public.tenants',
      to_regclass('public.tenants') is not null),
    ('0001_schema',             'function public.auth_role()',
      exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'auth_role')),

    ('0002_rls',                'policy tenants_select on tenants',
      exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'tenants' and policyname = 'tenants_select')),
    ('0002_rls',                'RLS enabled on bookings',
      coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.bookings')), false)),

    ('0003_functions',          'function public.get_widget_config()',
      exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'get_widget_config')),

    ('0004_onboarding',         'column employees.display_name',
      exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'employees' and column_name = 'display_name')),

    ('0005_recurrence',         'column bookings.recurrence_group_id',
      exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'bookings' and column_name = 'recurrence_group_id')),

    ('0006_integrations',       'table public.google_calendar_connections',
      to_regclass('public.google_calendar_connections') is not null),
    ('0006_integrations',       'table public.booking_reminders',
      to_regclass('public.booking_reminders') is not null),
    ('0006_integrations',       'column tenants.stripe_charges_enabled',
      exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'tenants' and column_name = 'stripe_charges_enabled')),

    ('0007_security',           'table public.tenant_secrets',
      to_regclass('public.tenant_secrets') is not null),
    ('0007_security',           'trigger profiles_guard_identity',
      exists (select 1 from pg_trigger
              where tgname = 'profiles_guard_identity' and tgrelid = to_regclass('public.profiles'))),
    ('0007_security',           'unique index on payments.stripe_payment_intent_id',
      exists (select 1 from pg_indexes
              where schemaname = 'public' and indexname = 'payments_stripe_payment_intent_id_key')),

    ('0008_booking_correctness','function public.booking_conflicts()',
      exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'booking_conflicts')),
    ('0008_booking_correctness','get_available_slots takes add-on ids',
      exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'get_available_slots'
                and p.pronargs = 4)),

    ('0009_onboarding_upsert',  'function public.onboarding_save_catalog()',
      exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'onboarding_save_catalog')),
    ('0009_onboarding_upsert',  'column services.pricing_unit',
      exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'services' and column_name = 'pricing_unit')),

    ('0010_completeness',       'table public.contact_submissions',
      to_regclass('public.contact_submissions') is not null),
    ('0010_completeness',       'table public.employee_invitations',
      to_regclass('public.employee_invitations') is not null),
    ('0010_completeness',       'function public.price_coupon()',
      exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'price_coupon')),
    ('0010_completeness',       'column bookings.coupon_id',
      exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'bookings' and column_name = 'coupon_id'))
  ) as t(migration, object, present)
)
select
  migration,
  count(*)                                   as checks,
  count(*) filter (where present)            as found,
  case
    when bool_and(present)      then 'APPLIED'
    when bool_or(present)       then 'PARTIAL  <-- investigate before continuing'
    else                             'NOT APPLIED'
  end                                        as status,
  coalesce(
    string_agg(object, '; ') filter (where not present),
    ''
  )                                          as missing
from probe
group by migration
order by migration;

-- A second, blunter answer: the lowest migration that is not fully applied is
-- where you must start. Anything above a gap may fail exactly the way 0007
-- failed on a database missing 0006.
--
-- Also worth knowing, since it is what the CLI reads:
--   select version from supabase_migrations.schema_migrations order by version;
-- If that returns nothing while the table probe above says 0001-0006 are
-- APPLIED, the migrations were applied by hand and the CLI's bookkeeping is
-- simply empty. That is not a problem in itself — but do not then run
-- `supabase db push`, because it will try to apply everything from 0001.
