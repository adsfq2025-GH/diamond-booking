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
      .eq("status", "pending");
    await removeCalendarEventForBooking(id).catch(() => {});
  }
  if (status === "confirmed") {
    await createCalendarEventForBooking(id).catch(() => {});
  }
  revalidatePath("/dashboard/bookings");
  revalidatePath("/dashboard/calendar");
  return { ok: true };
}

export async function rescheduleBooking(
  id: string,
  startsAt: string,
): Promise<{ ok: boolean; error?: string; startsAt?: string; endsAt?: string }> {
  if (!supabaseEnvConfigured()) return { ok: true, startsAt, endsAt: startsAt };
  const s = await scope();
  if (!s) return { ok: false, error: "No business found." };

  const { data: booking, error: bookingError } = await s.supabase
    .from("bookings")
    .select("id, tenant_id, starts_at, ends_at, status")
    .eq("id", id)
    .eq("tenant_id", s.tenantId)
    .maybeSingle();

  if (bookingError) return { ok: false, error: bookingError.message };
  if (!booking) return { ok: false, error: "Booking not found." };

  const parsedStart = new Date(startsAt);
  if (Number.isNaN(parsedStart.getTime())) {
    return { ok: false, error: "Invalid start time." };
  }

  const durationMs = new Date(booking.ends_at).getTime() - new Date(booking.starts_at).getTime();
  const nextEnd = new Date(parsedStart.getTime() + durationMs).toISOString();

  const { error } = await s.supabase
    .from("bookings")
    .update({
      starts_at: startsAt,
      ends_at: nextEnd,
      status: booking.status === "pending" ? "pending" : "rescheduled",
    })
    .eq("id", id)
    .eq("tenant_id", s.tenantId);

  if (error) return { ok: false, error: error.message };

  await rescheduleBookingReminders({
    supabase: s.supabase,
    tenantId: s.tenantId,
    bookingId: id,
    startsAt,
  }).catch(() => {});
  await resyncCalendarEventForBooking(id).catch(() => {});

  revalidatePath("/dashboard/bookings");
  revalidatePath("/dashboard/calendar");
  return { ok: true, startsAt, endsAt: nextEnd };
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
    await s.supabase
      .from("booking_reminders")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("tenant_id", s.tenantId)
      .in("booking_id", ids)
      .eq("status", "pending");
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
): Promise<{ ok: boolean; error?: string }> {
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
    .select("id, customer_id, recurrence_group_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (!bk || !custIds.includes(bk.customer_id)) return { ok: false, error: "Booking not found." };

  if (bk.recurrence_group_id) {
    await admin
      .from("bookings")
      .update({ status: "cancelled" satisfies BookingStatus })
      .eq("recurrence_group_id", bk.recurrence_group_id)
      .in("customer_id", custIds)
      .gte("starts_at", new Date().toISOString())
      .in("status", ["pending", "confirmed", "rescheduled"]);
  } else {
    await admin
      .from("bookings")
      .update({ status: "cancelled" satisfies BookingStatus })
      .eq("id", bookingId);
  }
  await admin
    .from("booking_reminders")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("booking_id", bookingId)
    .eq("status", "pending");
  await removeCalendarEventForBooking(bookingId).catch(() => {});
  revalidatePath("/portal");
  return { ok: true };
}

/**
 * Extend an open-ended recurring series — materialize the next batch of
 * occurrences after the last one currently on the calendar. Use when a customer
 * keeps their standing appointment beyond the initially reserved window.
 */
export async function extendSeries(
  groupId: string,
): Promise<{ ok: boolean; error?: string; count?: number }> {
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

  const durationMs = new Date(last.ends_at).getTime() - new Date(last.starts_at).getTime();
  const occurrences = computeOccurrences(
    new Date(last.starts_at),
    rule,
    null,
    DEFAULT_MAX_OCCURRENCES,
  );
  const status: BookingStatus = last.status === "pending" ? "pending" : "confirmed";

  let count = 0;
  for (const start of occurrences) {
    const ends = new Date(start.getTime() + durationMs);
    const { error } = await s.supabase.from("bookings").insert({
      tenant_id: last.tenant_id,
      customer_id: last.customer_id,
      service_id: last.service_id,
      employee_id: last.employee_id,
      status,
      starts_at: start.toISOString(),
      ends_at: ends.toISOString(),
      price_cents: last.price_cents,
      deposit_cents: last.deposit_cents,
      address: last.address,
      customer_notes: last.customer_notes,
      source: last.source,
      recurrence_group_id: groupId,
      recurrence_rule: rule,
      recurrence_until: null,
    });
    if (!error) count += 1;
    else if (!/exclu|overlap|conflict|23P01/i.test(error.message)) break;
  }

  revalidatePath("/dashboard/bookings");
  revalidatePath("/dashboard/calendar");
  return { ok: true, count };
}
