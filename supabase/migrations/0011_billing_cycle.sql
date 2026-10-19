-- ============================================================
-- Diamond Booking — 0011_billing_cycle.sql
-- Self-serve annual billing. Apply after 0010. Idempotent.
--
-- Until now a tenant could only be billed monthly: startCheckout resolved one
-- price id per tier and nothing recorded a billing period, so the pricing
-- page's yearly toggle was display-only (A44) and selecting it would have
-- charged monthly anyway.
--
-- The cycle is recorded here rather than re-read from Stripe on every page:
-- the webhook already writes the tenant row when a subscription changes, and
-- the dashboard should not make a network call to render "billed yearly".
-- Stripe remains authoritative — this column is a cache the webhook refreshes.
-- ============================================================

alter table public.tenants
  add column if not exists billing_cycle text not null default 'monthly';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tenants_billing_cycle_check'
  ) then
    alter table public.tenants
      add constraint tenants_billing_cycle_check
      check (billing_cycle in ('monthly', 'yearly'));
  end if;
end $$;

comment on column public.tenants.billing_cycle is
  'monthly | yearly. Set by the Stripe webhook from the subscribed price''s interval. A cache of Stripe''s state, not the source of truth.';
