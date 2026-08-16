-- ============================================================
-- Diamond Booking — seed.sql (local dev / demo data)
-- Demo tenant: Clean Sweep Services (cleaning industry)
-- All demo logins use password: password123
--   owner@cleansweep.demo    (business_owner)
--   maria@cleansweep.demo    (employee)
--   james@cleansweep.demo    (employee)
--   dana@customer.demo       (customer w/ portal account)
-- Widget public key: demo000000000000000000ff
-- ============================================================

-- ---------- auth users (local only; hosted projects create users via Auth) ----------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
   'owner@cleansweep.demo', extensions.crypt('password123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"],"role":"business_owner"}', '{"full_name":"Olivia Diaz"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
   'maria@cleansweep.demo', extensions.crypt('password123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"],"role":"employee"}', '{"full_name":"Maria Lopez"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000003', 'authenticated', 'authenticated',
   'james@cleansweep.demo', extensions.crypt('password123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"],"role":"employee"}', '{"full_name":"James Carter"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000004', 'authenticated', 'authenticated',
   'dana@customer.demo', extensions.crypt('password123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"],"role":"customer"}', '{"full_name":"Dana Whitfield"}', now(), now());

insert into auth.identities (
  id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(), u.id::text, u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now(), now(), now()
from auth.users u
where u.id in (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000002',
  'aaaaaaaa-0000-0000-0000-000000000003',
  'aaaaaaaa-0000-0000-0000-000000000004'
);

-- ---------- tenant ----------
insert into public.tenants (id, slug, name, industry, email, phone, address, timezone, branding, settings, plan, subscription_status, trial_ends_at)
values (
  '11111111-1111-1111-1111-111111111111',
  'clean-sweep',
  'Clean Sweep Services',
  'cleaning',
  'hello@cleansweep.demo',
  '+1-555-010-0000',
  '{"line1":"482 Maple Ave","city":"Springfield","state":"IL","zip":"62704"}',
  'America/New_York',
  '{"logo_url":null,"primary_color":"#0ea5e9","accent_color":"#111827"}',
  '{"auto_confirm":"false","cancellation_window_hours":24,"deposit_required":false}',
  'professional',
  'active',
  null
);

-- ---------- profiles ----------
insert into public.profiles (id, tenant_id, role, full_name, email, phone) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'business_owner', 'Olivia Diaz',    'owner@cleansweep.demo', '+1-555-010-0001'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'employee',       'Maria Lopez',    'maria@cleansweep.demo', '+1-555-010-0002'),
  ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'employee',       'James Carter',   'james@cleansweep.demo', '+1-555-010-0003'),
  ('aaaaaaaa-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'customer',       'Dana Whitfield', 'dana@customer.demo',    '+1-555-010-0004');

-- ---------- employees ----------
insert into public.employees (id, tenant_id, profile_id, title, color, hourly_rate_cents, commission_pct, active) values
  ('eeeeeeee-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002', 'Senior Cleaner', '#22c55e', 2200, 5.00, true),
  ('eeeeeeee-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000003', 'Cleaner',        '#f59e0b', 1900, null, true);

-- ---------- services ----------
insert into public.services (id, tenant_id, name, description, category, duration_minutes, price_cents, deposit_cents, buffer_before_minutes, buffer_after_minutes, active, sort) values
  ('55555555-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Standard Home Cleaning', 'Full clean of kitchen, bathrooms, bedrooms and living areas.', 'residential', 120, 12000, 0,    0, 30, true, 1),
  ('55555555-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Deep Cleaning',          'Top-to-bottom deep clean including baseboards, vents and fixtures.', 'residential', 240, 24000, 5000, 0, 30, true, 2),
  ('55555555-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Move-In / Move-Out',     'Empty-home cleaning for moves, inside cabinets and appliances.', 'residential', 300, 32000, 5000, 0, 30, true, 3),
  ('55555555-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Office Cleaning',        'After-hours cleaning for small offices up to 3,000 sq ft.', 'commercial', 90, 15000, 0, 0, 15, true, 4);

insert into public.service_addons (id, tenant_id, service_id, name, price_cents, duration_minutes) values
  ('aaaa1111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '55555555-0000-0000-0000-000000000001', 'Inside fridge',        2500, 30),
  ('aaaa1111-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '55555555-0000-0000-0000-000000000001', 'Inside oven',          2500, 30),
  ('aaaa1111-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', '55555555-0000-0000-0000-000000000001', 'Interior windows',     3500, 45),
  ('aaaa1111-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', '55555555-0000-0000-0000-000000000002', 'Laundry (2 loads)',    3000, 60),
  ('aaaa1111-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', '55555555-0000-0000-0000-000000000002', 'Inside fridge + oven', 4000, 60),
  ('aaaa1111-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', '55555555-0000-0000-0000-000000000003', 'Garage sweep-out',     4500, 60);

insert into public.employee_services (employee_id, service_id)
select e.id, s.id
from public.employees e
cross join public.services s
where e.tenant_id = '11111111-1111-1111-1111-111111111111'
  and s.tenant_id = '11111111-1111-1111-1111-111111111111';

-- ---------- business hours (0 = Sunday) ----------
insert into public.business_hours (tenant_id, weekday, open_time, close_time, closed) values
  ('11111111-1111-1111-1111-111111111111', 0, null,    null,    true),
  ('11111111-1111-1111-1111-111111111111', 1, '08:00', '18:00', false),
  ('11111111-1111-1111-1111-111111111111', 2, '08:00', '18:00', false),
  ('11111111-1111-1111-1111-111111111111', 3, '08:00', '18:00', false),
  ('11111111-1111-1111-1111-111111111111', 4, '08:00', '18:00', false),
  ('11111111-1111-1111-1111-111111111111', 5, '08:00', '18:00', false),
  ('11111111-1111-1111-1111-111111111111', 6, '09:00', '15:00', false);

-- ---------- availability ----------
-- Maria: Mon-Fri 08:00-16:00, James: Tue-Sat 09:00-17:00
insert into public.availability (tenant_id, employee_id, weekday, start_time, end_time)
select '11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000001', d, '08:00', '16:00'
from generate_series(1, 5) d;
insert into public.availability (tenant_id, employee_id, weekday, start_time, end_time)
select '11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000002', d, '09:00', '17:00'
from generate_series(2, 6) d;

-- ---------- time off ----------
insert into public.time_off (tenant_id, employee_id, starts_at, ends_at, reason, status) values
  ('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000002',
   ((current_date + 12)::timestamp) at time zone 'America/New_York',
   ((current_date + 13)::timestamp) at time zone 'America/New_York',
   'Family day', 'approved'),
  ('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000001',
   ((current_date + 20)::timestamp) at time zone 'America/New_York',
   ((current_date + 22)::timestamp) at time zone 'America/New_York',
   'Long weekend', 'pending');

-- ---------- customers ----------
insert into public.customers (id, tenant_id, profile_id, full_name, email, phone, addresses, tags) values
  ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000004',
   'Dana Whitfield', 'dana@customer.demo', '+1-555-010-0004',
   '[{"label":"Home","line1":"12 Birch Ln","city":"Springfield","state":"IL","zip":"62704"}]', '{repeat}'),
  ('cccccccc-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', null,
   'Robert Kim', 'robert.kim@example.com', '+1-555-010-0005',
   '[{"label":"Home","line1":"88 Cedar St","city":"Springfield","state":"IL","zip":"62702"}]', '{}'),
  ('cccccccc-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', null,
   'Priya Nair', 'priya.nair@example.com', null,
   '[]', '{new}');

-- ---------- bookings ----------
-- Helper shorthand: times are Eastern local wall-clock converted to timestamptz.
-- Maria = eeeeeeee-...01, James = eeeeeeee-...02
insert into public.bookings (id, tenant_id, customer_id, service_id, employee_id, status, starts_at, ends_at, price_cents, deposit_cents, address, customer_notes, source) values
  -- past, completed
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'completed',
   ((current_date - 14) + time '09:00') at time zone 'America/New_York', ((current_date - 14) + time '11:00') at time zone 'America/New_York',
   12000, 0, '{"line1":"12 Birch Ln","city":"Springfield"}', 'Please use the side door.', 'widget'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000002', '55555555-0000-0000-0000-000000000003', 'eeeeeeee-0000-0000-0000-000000000002', 'completed',
   ((current_date - 8) + time '09:30') at time zone 'America/New_York', ((current_date - 8) + time '14:30') at time zone 'America/New_York',
   32000, 5000, '{"line1":"88 Cedar St","city":"Springfield"}', null, 'admin'),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000002', '55555555-0000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000001', 'completed',
   ((current_date - 10) + time '10:00') at time zone 'America/New_York', ((current_date - 10) + time '14:00') at time zone 'America/New_York',
   24000, 5000, null, null, 'widget'),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000003', '55555555-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000002', 'completed',
   ((current_date - 12) + time '10:00') at time zone 'America/New_York', ((current_date - 12) + time '12:00') at time zone 'America/New_York',
   12000, 0, null, 'First-time customer.', 'widget'),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'completed',
   ((current_date - 7) + time '09:00') at time zone 'America/New_York', ((current_date - 7) + time '11:00') at time zone 'America/New_York',
   12000, 0, '{"line1":"12 Birch Ln","city":"Springfield"}', null, 'portal'),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000003', '55555555-0000-0000-0000-000000000004', 'eeeeeeee-0000-0000-0000-000000000001', 'completed',
   ((current_date - 3) + time '12:00') at time zone 'America/New_York', ((current_date - 3) + time '13:30') at time zone 'America/New_York',
   15000, 0, null, null, 'admin'),
  -- past, unhappy paths
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000003', '55555555-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000002', 'no_show',
   ((current_date - 5) + time '11:00') at time zone 'America/New_York', ((current_date - 5) + time '13:00') at time zone 'America/New_York',
   12000, 0, null, null, 'widget'),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000002', '55555555-0000-0000-0000-000000000004', 'eeeeeeee-0000-0000-0000-000000000002', 'cancelled',
   ((current_date - 2) + time '14:00') at time zone 'America/New_York', ((current_date - 2) + time '15:30') at time zone 'America/New_York',
   15000, 0, null, null, 'portal'),
  -- future, confirmed
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000002', '55555555-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000002', 'confirmed',
   ((current_date + 1) + time '10:00') at time zone 'America/New_York', ((current_date + 1) + time '12:00') at time zone 'America/New_York',
   12000, 0, '{"line1":"88 Cedar St","city":"Springfield"}', null, 'widget'),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'confirmed',
   ((current_date + 2) + time '09:00') at time zone 'America/New_York', ((current_date + 2) + time '11:00') at time zone 'America/New_York',
   12000, 0, '{"line1":"12 Birch Ln","city":"Springfield"}', 'Recurring bi-weekly clean.', 'portal'),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000003', '55555555-0000-0000-0000-000000000004', 'eeeeeeee-0000-0000-0000-000000000001', 'confirmed',
   ((current_date + 2) + time '13:00') at time zone 'America/New_York', ((current_date + 2) + time '14:30') at time zone 'America/New_York',
   15000, 0, null, null, 'admin'),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000002', 'confirmed',
   ((current_date + 3) + time '09:00') at time zone 'America/New_York', ((current_date + 3) + time '13:00') at time zone 'America/New_York',
   24000, 5000, '{"line1":"12 Birch Ln","city":"Springfield"}', null, 'widget'),
  -- future, pending
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000002', '55555555-0000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000001', 'pending',
   ((current_date + 5) + time '10:00') at time zone 'America/New_York', ((current_date + 5) + time '14:00') at time zone 'America/New_York',
   24000, 5000, null, 'Gate code 4482.', 'widget'),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000003', '55555555-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000002', 'pending',
   ((current_date + 6) + time '13:00') at time zone 'America/New_York', ((current_date + 6) + time '15:00') at time zone 'America/New_York',
   12000, 0, null, null, 'widget'),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'pending',
   ((current_date + 9) + time '09:00') at time zone 'America/New_York', ((current_date + 9) + time '11:00') at time zone 'America/New_York',
   12000, 0, '{"line1":"12 Birch Ln","city":"Springfield"}', null, 'portal');

-- one booking with addons
insert into public.booking_addons (booking_id, addon_id, price_cents) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaa1111-0000-0000-0000-000000000001', 2500),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaa1111-0000-0000-0000-000000000002', 2500);

-- ---------- invoices (numbers assigned by trigger: INV-YYYY-0001, -0002) ----------
insert into public.invoices (id, tenant_id, customer_id, booking_id, status, line_items, subtotal_cents, tax_cents, total_cents, paid_cents, due_at) values
  ('dddddddd-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'paid',
   '[{"description":"Standard Home Cleaning","qty":1,"amount_cents":12000},{"description":"Inside fridge","qty":1,"amount_cents":2500},{"description":"Inside oven","qty":1,"amount_cents":2500}]',
   17000, 0, 17000, 17000, ((current_date - 7)::timestamp) at time zone 'America/New_York'),
  ('dddddddd-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'partially_paid',
   '[{"description":"Move-In / Move-Out","qty":1,"amount_cents":32000}]',
   32000, 0, 32000, 5000, ((current_date + 7)::timestamp) at time zone 'America/New_York');

-- ---------- payments ----------
insert into public.payments (tenant_id, invoice_id, booking_id, customer_id, stripe_payment_intent_id, amount_cents, status, kind) values
  ('11111111-1111-1111-1111-111111111111', 'dddddddd-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'pi_demo_000000000001', 17000, 'succeeded', 'payment'),
  ('11111111-1111-1111-1111-111111111111', 'dddddddd-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000002', 'pi_demo_000000000002', 5000, 'succeeded', 'deposit');

-- ---------- coupons ----------
insert into public.coupons (tenant_id, code, pct_off, amount_off_cents, active, expires_at, max_redemptions) values
  ('11111111-1111-1111-1111-111111111111', 'WELCOME10', 10.00, null, true, ((current_date + 90)::timestamp) at time zone 'America/New_York', 100),
  ('11111111-1111-1111-1111-111111111111', 'SPRING25', null, 2500, false, null, null);

-- ---------- widget config (known demo key) ----------
insert into public.widget_configs (id, tenant_id, public_key, theme, custom_fields, allowed_domains, active) values
  ('99999999-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'demo000000000000000000ff',
   '{"primary_color":"#0ea5e9","radius":"12px","font":"Inter","layout":"vertical"}',
   '[{"key":"pets","label":"Any pets we should know about?","type":"text","required":false}]',
   '{}', true);

-- ---------- employee requests ----------
insert into public.employee_requests (tenant_id, employee_id, kind, body, status) values
  ('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000001', 'equipment', 'Vacuum in van #2 is losing suction — requesting a replacement.', 'pending'),
  ('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000002', 'schedule_change', 'Could I swap Saturday for Monday availability next month?', 'approved');

-- ---------- plan limits ----------
insert into public.plan_limits (plan, max_employees, max_services, features) values
  ('starter', 3, 10,
   '{"widget":true,"email_notifications":true,"sms_reminders":false,"invoicing":false,"coupons":false,"custom_branding":false,"payroll_reports":false,"api_access":false,"priority_support":false}'),
  ('professional', 10, null,
   '{"widget":true,"email_notifications":true,"sms_reminders":true,"invoicing":true,"coupons":true,"custom_branding":true,"payroll_reports":false,"api_access":false,"priority_support":false}'),
  ('elite', null, null,
   '{"widget":true,"email_notifications":true,"sms_reminders":true,"invoicing":true,"coupons":true,"custom_branding":true,"payroll_reports":true,"api_access":true,"priority_support":true}');

-- ---------- feature flags (platform-wide) ----------
insert into public.feature_flags (key, enabled, description) values
  ('customer_portal', true,  'Customer self-service portal (/portal)'),
  ('stripe_payments', true,  'Stripe checkout + deposits'),
  ('sms_reminders',   true,  'Twilio SMS reminders'),
  ('widget_v2',       false, 'Next-gen embeddable widget');
