"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { supabaseEnvConfigured } from "@/lib/env";
import type { TablesInsert } from "@/types/domain";

export interface ServiceAddonDraft {
  id?: string;
  name: string;
  priceCents: number;
  durationMinutes: number;
}
export interface ServiceDraft {
  id?: string;
  name: string;
  category: string;
  description: string;
  durationMinutes: number;
  priceCents: number;
  depositCents: number;
  bufferAfter: number;
  addons: ServiceAddonDraft[];
}

type Result = { ok: true; id: string } | { ok: false; error: string };

async function scope() {
  const profile = await requireRole("business_owner");
  if (!profile.tenant_id) return null;
  const supabase = await createClient();
  return { supabase, tenantId: profile.tenant_id };
}

/**
 * Create or update a single service and reconcile its add-ons — safe on a live
 * tenant (targets one service, never wipes the catalog). Add-ons referenced by
 * existing bookings are preserved even if removed in the editor.
 */
export async function saveService(input: ServiceDraft): Promise<Result> {
  if (!supabaseEnvConfigured()) {
    return { ok: false, error: "Preview mode — connect Supabase to save." };
  }
  const s = await scope();
  if (!s) return { ok: false, error: "No business found." };
  const { supabase, tenantId } = s;

  const name = input.name.trim();
  if (!name) return { ok: false, error: "The service needs a name." };

  const fields = {
    tenant_id: tenantId,
    name,
    description: input.description.trim() || null,
    category: input.category.trim() || null,
    duration_minutes: Math.max(5, Math.round(input.durationMinutes) || 60),
    price_cents: Math.max(0, Math.round(input.priceCents) || 0),
    deposit_cents: Math.max(0, Math.round(input.depositCents) || 0),
    buffer_after_minutes: Math.max(0, Math.round(input.bufferAfter) || 0),
  };

  let serviceId = input.id;
  if (serviceId) {
    const { error } = await supabase.from("services").update(fields).eq("id", serviceId).eq("tenant_id", tenantId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data, error } = await supabase.from("services").insert(fields).select("id").single();
    if (error || !data) return { ok: false, error: error?.message ?? "Could not create service." };
    serviceId = data.id;
  }

  // ---- reconcile add-ons for this service ----
  const { data: existing } = await supabase
    .from("service_addons")
    .select("id")
    .eq("service_id", serviceId);
  const existingIds = new Set((existing ?? []).map((a) => a.id));
  const keepIds = new Set(input.addons.filter((a) => a.id).map((a) => a.id as string));

  // Which existing add-ons are referenced by a booking? Never delete those.
  const removable = [...existingIds].filter((id) => !keepIds.has(id));
  let referenced = new Set<string>();
  if (removable.length) {
    const { data: refs } = await supabase
      .from("booking_addons")
      .select("addon_id")
      .in("addon_id", removable);
    referenced = new Set((refs ?? []).map((r) => r.addon_id));
  }
  const toDelete = removable.filter((id) => !referenced.has(id));
  if (toDelete.length) {
    await supabase.from("service_addons").delete().in("id", toDelete);
  }

  // Update existing, insert new.
  for (const a of input.addons) {
    const aName = a.name.trim();
    if (!aName) continue;
    const row = {
      tenant_id: tenantId,
      service_id: serviceId,
      name: aName,
      price_cents: Math.max(0, Math.round(a.priceCents) || 0),
      duration_minutes: Math.max(0, Math.round(a.durationMinutes) || 0),
    };
    if (a.id && existingIds.has(a.id)) {
      await supabase.from("service_addons").update(row).eq("id", a.id);
    } else {
      await supabase.from("service_addons").insert(row as TablesInsert<"service_addons">);
    }
  }

  revalidatePath("/dashboard/services");
  return { ok: true, id: serviceId };
}

/** Toggle a service active/inactive. */
export async function setServiceActive(id: string, active: boolean): Promise<{ ok: boolean; error?: string }> {
  if (!supabaseEnvConfigured()) return { ok: false, error: "Preview mode." };
  const s = await scope();
  if (!s) return { ok: false, error: "No business found." };
  const { error } = await s.supabase.from("services").update({ active }).eq("id", id).eq("tenant_id", s.tenantId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/services");
  return { ok: true };
}

/** Delete a service (blocked by DB if it has bookings — deactivate instead). */
export async function deleteService(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabaseEnvConfigured()) return { ok: false, error: "Preview mode." };
  const s = await scope();
  if (!s) return { ok: false, error: "No business found." };
  await s.supabase.from("service_addons").delete().eq("service_id", id);
  const { error } = await s.supabase.from("services").delete().eq("id", id).eq("tenant_id", s.tenantId);
  if (error) {
    return { ok: false, error: "This service has bookings — deactivate it instead of deleting." };
  }
  revalidatePath("/dashboard/services");
  return { ok: true };
}
