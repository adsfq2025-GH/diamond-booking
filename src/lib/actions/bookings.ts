"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { supabaseEnvConfigured } from "@/lib/env";
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
