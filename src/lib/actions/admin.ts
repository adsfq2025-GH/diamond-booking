"use server";

import { requireRole } from "@/lib/auth";
import { supabaseEnvConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/server";

export type AdminTenantMutationState = {
  error?: string;
  success?: boolean;
} | null;

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function saveAdminTenantNote(
  _prev: AdminTenantMutationState,
  formData: FormData,
): Promise<AdminTenantMutationState> {
  await requireRole("super_admin");

  const tenantId = field(formData, "tenantId");
  const note = field(formData, "note");

  if (!tenantId || !note) {
    return { error: "Enter a tenant and note before saving." };
  }

  if (!supabaseEnvConfigured()) {
    return { success: true };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("audit_logs").insert({
    tenant_id: tenantId,
    action: "admin_note_added",
    entity: "tenant",
    entity_id: tenantId,
    meta: { note },
  });

  if (error) {
    return { error: "We couldn't save that admin note right now." };
  }

  return { success: true };
}

export async function scheduleAdminTenantFollowUp(
  _prev: AdminTenantMutationState,
  formData: FormData,
): Promise<AdminTenantMutationState> {
  await requireRole("super_admin");

  const tenantId = field(formData, "tenantId");
  const followUpAt = field(formData, "followUpAt");

  if (!tenantId || !followUpAt) {
    return { error: "Choose a follow-up time before saving." };
  }

  if (!supabaseEnvConfigured()) {
    return { success: true };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("audit_logs").insert({
    tenant_id: tenantId,
    action: "admin_follow_up_scheduled",
    entity: "tenant",
    entity_id: tenantId,
    meta: { follow_up_at: followUpAt },
  });

  if (error) {
    return { error: "We couldn't save that follow-up right now." };
  }

  return { success: true };
}
