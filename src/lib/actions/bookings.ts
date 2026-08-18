"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { supabaseEnvConfigured } from "@/lib/env";
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
  revalidatePath("/dashboard/bookings");
  revalidatePath("/dashboard/calendar");
  return { ok: true };
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
  revalidatePath("/dashboard/bookings");
  revalidatePath("/dashboard/calendar");
  return { ok: true, count: data?.length ?? 0 };
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
