"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { supabaseEnvConfigured } from "@/lib/env";
import {
  createCalendarEventForBooking,
  removeCalendarEventForBooking,
  resyncCalendarEventForBooking,
} from "@/lib/integrations/calendar-sync";
import {
  computeOccurrences,
  DEFAULT_MAX_OCCURRENCES,
  type RecurrenceRule,
} from "@/lib/recurrence";
import { bookingErrorMessage } from "@/lib/booking-errors";
import { materializeSeries } from "@/lib/recurrence-series";
import type { BookingStatus } from "@/types/database";

async function scope() {
  const profile = await requireRole("business_owner");
  if (!profile.tenant_id) return null;
  const supabase = await createClient();
  return { supabase, tenantId: profile.tenant_id };
}

async function rescheduleBookingReminders(input: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  tenantId: string;
  bookingId: string;
  startsAt: string;
}) {
  const { data: reminders } = await input.supabase
    .from("booking_reminders")
    .select("id, channel")
    .eq("tenant_id", input.tenantId)
    .eq("booking_id", input.bookingId)
    .eq("status", "pending");

  if (!reminders?.length) return;

  const startTime = new Date(input.startsAt).getTime();
  const remindersByChannel = new Map<string, Array<{ id: string; channel: string }>>();

  for (const reminder of reminders) {
    const list = remindersByChannel.get(reminder.channel) ?? [];
    list.push(reminder);
    remindersByChannel.set(reminder.channel, list);
  }

  for (const [channel, channelReminders] of remindersByChannel) {
    const offsets =
      channel === "sms"
        ? [24 * 60 * 60 * 1000, 2 * 60 * 60 * 1000]
        : [24 * 60 * 60 * 1000];

    for (const [index, reminder] of channelReminders.entries()) {
      const offsetMs = offsets[Math.min(index, offsets.length - 1)];
      await input.supabase
        .from("booking_reminders")
        .update({
          scheduled_for: new Date(startTime - offsetMs).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", reminder.id)
        .eq("tenant_id", input.tenantId);
    }
  }
}

/** Change one booking's status (persisted). Freeing/cancelling a slot frees availability. */
export async function setBookingStatus(
  id: string,
  status: BookingStatus,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabaseEnvConfigured()) return { ok: true }; // preview: client keeps optimistic state
  const s = await scope();
  if (!s) return { ok: false, error: "No business found." };
  const { error } = await s.supabase
    .from("bookings")
    .update({ status })
    .eq("id", id)
    .eq("tenant_id", s.tenantId);
  if (error) return { ok: false, error: error.message };
  if (status === "cancelled") {
    await s.supabase
      .from("booking_reminders")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("booking_id", id)
      .eq("tenant_id", s.tenantId)
      .in("status", ["pending", "processing"]);
    await removeCalendarEventForBooking(id).catch(() => {});
  }
  if (status === "confirmed") {
    await createCalendarEventForBooking(id).catch(() => {});
  }
  revalidatePath("/dashboard/bookings");
  revalidatePath("/dashboard/calendar");
  return { ok: true };
}

/**
 * Move one appointment to a new time.
 *
 * The whole move now happens inside reschedule_booking() (0013), for two
 * reasons the audit found:
 *
 *  - B01. This action used to set the status to `rescheduled`, and the
 *    deployed conflict function, the exclusion constraint and the calendar
 *    query all counted only pending/confirmed. A moved appointment therefore
 *    stopped holding its new time AND vanished from the calendar on refresh,
 *    so the slot could be sold twice. The status is no longer changed at all;
 *    the move is recorded in rescheduled_at / reschedule_count.
 *
 *  - B02/B03. The old pre-check looked at booking conflicts only — not
 *    business hours, the employee's own working hours, approved time off,
 *    service eligibility or a future date — so the calendar could accept a
 *    time the public booking flow would have refused. And because the check
 *    and the write were two statements, two moves could pass it concurrently.
 *    The RPC validates against the same rules public booking uses, holding the
 *    per-employee capacity lock across the check and the write.
 */
export async function rescheduleBooking(
  id: string,
  startsAt: string,
): Promise<{ ok: boolean; error?: string; startsAt?: string; endsAt?: string }> {
  if (!supabaseEnvConfigured()) return { ok: true, startsAt, endsAt: startsAt };
  const s = await scope();
  if (!s) return { ok: false, error: "No business found." };

  const parsedStart = new Date(startsAt);
  if (Number.isNaN(parsedStart.getTime())) {
    return { ok: false, error: "Invalid start time." };
  }

  const { data, error } = await s.supabase.rpc("reschedule_booking", {
    p_booking_id: id,
    p_starts_at: parsedStart.toISOString(),
  });

  if (error) {
    return { ok: false, error: bookingErrorMessage(error.message, "owner") };
  }

  const moved = data as unknown as { starts_at: string; ends_at: string } | null;
  if (!moved) return { ok: false, error: "Could not move that appointment." };

  await rescheduleBookingReminders({
    supabase: s.supabase,
    tenantId: s.tenantId,
    bookingId: id,
    startsAt: moved.starts_at,
  }).catch(() => {});
  await resyncCalendarEventForBooking(id).catch(() => {});

  revalidatePath("/dashboard/bookings");
  revalidatePath("/dashboard/calendar");
  return { ok: true, startsAt: moved.starts_at, endsAt: moved.ends_at };
}

/**
 * Cancel an entire recurring series from now on — all current/future occurrences
 * in the group. Past (completed) occurrences are left untouched.
 */
export async function cancelSeries(
  groupId: string,
): Promise<{ ok: boolean; error?: string; count?: number }> {
  if (!supabaseEnvConfigured()) return { ok: true };
  const s = await scope();
  if (!s) return { ok: false, error: "No business found." };
  const nowIso = new Date().toISOString();
  const { data, error } = await s.supabase
    .from("bookings")
    .update({ status: "cancelled" satisfies BookingStatus })
    .eq("tenant_id", s.tenantId)
    .eq("recurrence_group_id", groupId)
    .gte("starts_at", nowIso)
    .in("status", ["pending", "confirmed", "rescheduled"])
    .select("id");
  if (error) return { ok: false, error: error.message };
  const ids = (data ?? []).map((row) => row.id);
  if (ids.length > 0) {
    const { error: reminderError } = await s.supabase
      .from("booking_reminders")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("tenant_id", s.tenantId)
      .in("booking_id", ids)
      .in("status", ["pending", "processing"]);
    if (reminderError) {
      console.error("cancelSeries: reminder cleanup failed", reminderError);
    }
    await Promise.all(ids.map((id) => removeCalendarEventForBooking(id).catch(() => {})));
  }
  revalidatePath("/dashboard/bookings");
  revalidatePath("/dashboard/calendar");
  return { ok: true, count: data?.length ?? 0 };
}

/**
 * Customer-facing cancel from the portal. Verifies the booking belongs to the
 * signed-in customer. If it's part of a recurring series, cancels the whole
 * future series (their standing appointment ends). Not promoted in the UI, but
 * available for a customer who goes looking for it.
 */
export async function cancelMyBooking(
  bookingId: string,
): Promise<{ ok: boolean; error?: string; cancelledCount?: number }> {
  if (!supabaseEnvConfigured()) return { ok: true };
  const profile = await requireRole("customer");
  const supabase = await createClient();
  const { data: custs } = await supabase
    .from("customers")
    .select("id")
    .eq("profile_id", profile.id);
  const custIds = (custs ?? []).map((c) => c.id);
  if (custIds.length === 0) return { ok: false, error: "No customer record found." };

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: "Cancellation is temporarily unavailable." };
  }

  const { data: bk } = await admin
    .from("bookings")
    .select("id, customer_id, recurrence_group_id, starts_at, tenant_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (!bk || !custIds.includes(bk.customer_id)) return { ok: false, error: "Booking not found." };

  // Enforce the business's cancellation window (A29). Onboarding collected
  // cancellation_window_hours and displayed the policy as if it bound the
  // customer, but nothing ever read it: a booking could be cancelled minutes
  // before the appointment whatever the owner had configured.
  const { data: tenantRow } = await admin
    .from("tenants")
    .select("settings")
    .eq("id", bk.tenant_id)
    .maybeSingle();
  const windowHours = Number(
    ((tenantRow?.settings ?? {}) as { cancellation_window_hours?: number })
      .cancellation_window_hours ?? 0,
  );
  if (windowHours > 0) {
    const hoursUntil = (new Date(bk.starts_at).getTime() - Date.now()) / (60 * 60 * 1000);
    if (hoursUntil < windowHours) {
      return {
        ok: false,
        error:
          hoursUntil <= 0
            ? "This appointment has already started — please contact the business directly."
            : `This business asks for ${windowHours} hours' notice to cancel online. Please contact them directly.`,
      };
    }
  }

  // Which bookings are actually being cancelled? The whole future series for a
  // standing appointment, otherwise just this one. Capturing the ids is what
  // lets the cleanup below cover EVERY affected visit: it used to clear the
  // reminder and calendar event of the clicked booking alone, so the rest of a
  // cancelled series kept reminding the customer about visits that no longer
  // existed, and kept their entries in the owner's Google Calendar (D02).
  const cancelQuery = bk.recurrence_group_id
    ? admin
        .from("bookings")
        .update({ status: "cancelled" satisfies BookingStatus })
        .eq("recurrence_group_id", bk.recurrence_group_id)
        .in("customer_id", custIds)
        .gte("starts_at", new Date().toISOString())
        .in("status", ["pending", "confirmed", "rescheduled"])
    : admin
        .from("bookings")
        .update({ status: "cancelled" satisfies BookingStatus })
        .eq("id", bookingId)
        .in("status", ["pending", "confirmed", "rescheduled"]);

  // The return value was discarded, so a refused or failed write reported
  // success to the portal, which had already removed the row from the list.
  const { data: cancelled, error: cancelError } = await cancelQuery.select("id");
  if (cancelError) {
    console.error("cancelMyBooking: cancellation write failed", cancelError);
    return {
      ok: false,
      error: "We could not cancel that appointment. Please contact the business directly.",
    };
  }
  const cancelledIds = (cancelled ?? []).map((row) => row.id);
  if (cancelledIds.length === 0) {
    return {
      ok: false,
      error: "That appointment is no longer active, so there was nothing to cancel.",
    };
  }

  const { error: reminderError } = await admin
    .from("booking_reminders")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .in("booking_id", cancelledIds)
    .in("status", ["pending", "processing"]);
  if (reminderError) {
    // The appointment IS cancelled; a stuck reminder is an operations problem,
    // not a reason to tell the customer their cancellation failed.
    console.error("cancelMyBooking: reminder cleanup failed", reminderError);
  }
  await Promise.all(
    cancelledIds.map((id) => removeCalendarEventForBooking(id).catch(() => {})),
  );
  revalidatePath("/portal");
  return { ok: true, cancelledCount: cancelledIds.length };
}

/**
 * Extend an open-ended recurring series — materialize the next batch of
 * occurrences after the last one currently on the calendar. Use when a customer
 * keeps their standing appointment beyond the initially reserved window.
 */
export async function extendSeries(groupId: string): Promise<{
  ok: boolean;
  error?: string;
  count?: number;
  /** Dates that could not be reserved — shown, not swallowed. */
  skipped?: Array<{ startsAt: string; reason: string }>;
  incomplete?: boolean;
}> {
  if (!supabaseEnvConfigured()) return { ok: true, count: 0 };
  const s = await scope();
  if (!s) return { ok: false, error: "No business found." };

  // Last occurrence in the series (has all the fields to clone + the rule).
  const { data: last } = await s.supabase
    .from("bookings")
    .select("*")
    .eq("tenant_id", s.tenantId)
    .eq("recurrence_group_id", groupId)
    .order("starts_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!last) return { ok: false, error: "Series not found." };

  const rule = last.recurrence_rule as RecurrenceRule | null;
  if (!rule || rule === "none") return { ok: false, error: "Not a recurring booking." };
  if (last.recurrence_until) {
    return { ok: false, error: "This series has a fixed end date and can't be extended." };
  }

  // The tenant's own timezone, so a weekly series keeps its local time across
  // a daylight-saving change (B05).
  const { data: tenantRow } = await s.supabase
    .from("tenants")
    .select("timezone")
    .eq("id", s.tenantId)
    .maybeSingle();

  const occurrences = computeOccurrences(
    new Date(last.starts_at),
    rule,
    null,
    DEFAULT_MAX_OCCURRENCES,
    tenantRow?.timezone ?? "UTC",
  );

  // Every added visit goes through create_series_occurrence (B04): the copied
  // INSERTs here ran no hours, eligibility, time-off or buffer checks and
  // never carried the first visit's add-ons, so a later visit could land on a
  // closed day with half its job details missing.
  const result = await materializeSeries(s.supabase, last.id, occurrences);

  revalidatePath("/dashboard/bookings");
  revalidatePath("/dashboard/calendar");
  return {
    ok: true,
    count: result.reserved.length,
    skipped: result.skipped,
    incomplete: result.incomplete,
  };
}

