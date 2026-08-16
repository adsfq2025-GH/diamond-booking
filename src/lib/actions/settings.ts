"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { supabaseEnvConfigured } from "@/lib/env";
import type { Json } from "@/types/database";
import type { BusinessProfile } from "@/lib/dashboard/data";

/**
 * Persist the business profile edited in Settings → Business profile.
 * Writes to the tenant row (name, industry, contact, address JSON, timezone).
 */
export async function saveBusinessProfile(
  input: BusinessProfile,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!supabaseEnvConfigured()) {
    return { ok: false, error: "Preview mode — connect Supabase to save changes." };
  }
  const profile = await requireRole("business_owner");
  if (!profile.tenant_id) return { ok: false, error: "No business found for this account." };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Your business needs a name." };

  const address: Json = {
    line1: input.street.trim() || null,
    city: input.city.trim() || null,
    state: input.state.trim() || null,
    zip: input.zip.trim() || null,
  };

  const supabase = await createClient();
  const { error } = await supabase
    .from("tenants")
    .update({
      name,
      industry: input.industry.trim() || null,
      email: input.email.trim() || null,
      phone: input.phone.trim() || null,
      address,
      timezone: input.timezone || "America/New_York",
    })
    .eq("id", profile.tenant_id);

  if (error) return { ok: false, error: error.message };

  // Times across the app render in this timezone — refresh the shell.
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}
