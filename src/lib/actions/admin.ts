"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { supabaseEnvConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

export type AdminTenantMutationState = {
  error?: string;
  success?: boolean;
  suspended?: boolean;
} | null;

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

async function setTenantSuspended(
  formData: FormData,
  suspended: boolean,
): Promise<AdminTenantMutationState> {
  await requireRole("super_admin");

  const tenantId = field(formData, "tenantId");
  const reason = field(formData, "reason");

  if (!tenantId || !reason) {
    return { error: "A tenant and reason are required before saving." };
  }

  if (!supabaseEnvConfigured()) {
    return { success: true, suspended };
  }

  const admin = createAdminClient();
  const { error: tenantError } = await admin
    .from("tenants")
    .update({ suspended })
    .eq("id", tenantId);

  if (tenantError) {
    return { error: "We couldn't update that tenant right now." };
  }

  const { error: auditError } = await admin.from("audit_logs").insert({
    tenant_id: tenantId,
    action: suspended ? "admin_tenant_suspended" : "admin_tenant_restored",
    entity: "tenant",
    entity_id: tenantId,
    meta: { reason },
  });

  if (auditError) {
    return { error: "The tenant changed, but we couldn't write the audit log." };
  }

  revalidatePath("/admin");
  revalidatePath(`/admin/tenant/${tenantId}`);
  return { success: true, suspended };
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

export async function suspendAdminTenant(
  _prev: AdminTenantMutationState,
  formData: FormData,
): Promise<AdminTenantMutationState> {
  return setTenantSuspended(formData, true);
}

export async function restoreAdminTenant(
  _prev: AdminTenantMutationState,
  formData: FormData,
): Promise<AdminTenantMutationState> {
  return setTenantSuspended(formData, false);
}

export async function resetAdminTenantOnboarding(
  _prev: AdminTenantMutationState,
  formData: FormData,
): Promise<AdminTenantMutationState> {
  await requireRole("super_admin");

  const tenantId = field(formData, "tenantId");
  const reason = field(formData, "reason");

  if (!tenantId || !reason) {
    return { error: "A tenant and reason are required before resetting onboarding." };
  }

  if (!supabaseEnvConfigured()) {
    return { success: true };
  }

  const admin = createAdminClient();
  const { data: tenant, error: tenantReadError } = await admin
    .from("tenants")
    .select("settings")
    .eq("id", tenantId)
    .maybeSingle();

  if (tenantReadError) {
    return { error: "We couldn't load that tenant right now." };
  }

  const settings = ((tenant?.settings ?? {}) as Record<string, unknown>);
  const nextSettings = {
    ...settings,
    onboarding_complete: false,
    onboarding_step: 1,
  } as Json;

  const { error: updateError } = await admin
    .from("tenants")
    .update({ settings: nextSettings })
    .eq("id", tenantId);

  if (updateError) {
    return { error: "We couldn't reset onboarding right now." };
  }

  const { error: auditError } = await admin.from("audit_logs").insert({
    tenant_id: tenantId,
    action: "admin_onboarding_reset",
    entity: "tenant",
    entity_id: tenantId,
    meta: { reason },
  });

  if (auditError) {
    return { error: "Onboarding was reset, but the audit log could not be written." };
  }

  revalidatePath("/admin");
  revalidatePath(`/admin/tenant/${tenantId}`);
  return { success: true };
}
