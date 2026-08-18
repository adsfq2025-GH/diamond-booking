-- ============================================================
-- Diamond Booking — 0005_recurrence.sql
-- Recurring bookings: each occurrence is a REAL bookings row (so the
-- no-double-booking GiST constraint + get_available_slots automatically
-- block those times). Rows in one series share recurrence_group_id.
-- Apply after 0004. Idempotent.
-- ============================================================

alter table public.bookings
  add column if not exists recurrence_group_id uuid,
  add column if not exists recurrence_rule text,        -- weekly | biweekly | every_3_weeks | monthly | every_N_weeks
  add column if not exists recurrence_until timestamptz; -- null = open-ended (materialized in a rolling window)

-- Fast lookup of a whole series (edit / cancel-series, extend the window).
create index if not exists bookings_recurrence_group_idx
  on public.bookings (tenant_id, recurrence_group_id)
  where recurrence_group_id is not null;

-- RLS: inherited from the existing bookings policies (row-level, so the new
-- columns need no extra policy). The GiST exclusion constraint already prevents
-- two active bookings for the same employee from overlapping, which is exactly
-- what makes reserved recurring slots block new customer bookings.
