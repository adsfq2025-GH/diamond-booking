"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { supabaseEnvConfigured } from "@/lib/env";
import { sendTestEmail } from "@/lib/integrations/email";
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

// ---------- Email (SMTP) settings ----------

export interface EmailSettingsInput {
  provider: "smtp" | "resend" | "off";
  host: string;
  port: number;
  secure: boolean;
  user: string;
  /** Blank means "keep the existing saved password". */
  password: string;
  fromName: string;
  fromEmail: string;
}

/** Persist the tenant's email settings (SMTP creds live in tenant.settings.email). */
export async function saveEmailSettings(
  input: EmailSettingsInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!supabaseEnvConfigured()) {
    return { ok: false, error: "Preview mode — connect Supabase to save." };
  }
  const profile = await requireRole("business_owner");
  if (!profile.tenant_id) return { ok: false, error: "No business found." };

  const supabase = await createClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("settings")
    .eq("id", profile.tenant_id)
    .maybeSingle();
  const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
  const prevEmail = (settings.email ?? {}) as { smtp?: { pass?: string } };
  const prevPass = prevEmail.smtp?.pass ?? "";

  if (input.provider === "smtp") {
    if (!input.host.trim() || !input.user.trim() || !input.fromEmail.trim()) {
      return { ok: false, error: "SMTP host, username and from-address are required." };
    }
    if (!input.password && !prevPass) {
      return { ok: false, error: "Enter your SMTP password (or app password)." };
    }
  }

  const email = {
    provider: input.provider,
    smtp: {
      host: input.host.trim(),
      port: Math.round(input.port) || 587,
      secure: Boolean(input.secure),
      user: input.user.trim(),
      pass: input.password || prevPass, // keep existing when left blank
      fromName: input.fromName.trim(),
      fromEmail: input.fromEmail.trim(),
    },
  };

  const { error } = await supabase
    .from("tenants")
    .update({ settings: { ...settings, email } as Json })
    .eq("id", profile.tenant_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard/settings");
  return { ok: true };
}

/** Send a test email to the owner to confirm delivery works. */
export async function testEmailSettings(
  to: string,
): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  if (!supabaseEnvConfigured()) return { ok: false, error: "Preview mode." };
  const profile = await requireRole("business_owner");
  if (!profile.tenant_id) return { ok: false, error: "No business found." };
  const res = await sendTestEmail(profile.tenant_id, to.trim() || profile.email || "");
  if (res.ok) return { ok: true };
  return { ok: false, error: res.error, skipped: "skipped" in res ? res.skipped : undefined };
}
