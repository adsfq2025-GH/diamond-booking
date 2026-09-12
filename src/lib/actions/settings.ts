"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { supabaseEnvConfigured } from "@/lib/env";
import { sendTestEmail } from "@/lib/integrations/email";
import { smsConfigured } from "@/lib/integrations/sms";
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

/** Persist booking rules (recurring toggle, auto-confirm). */
export async function saveBookingSettings(input: {
  recurringEnabled: boolean;
  autoConfirm: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
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
  const { error } = await supabase
    .from("tenants")
    .update({
      settings: {
        ...settings,
        recurring_enabled: input.recurringEnabled,
        auto_confirm: input.autoConfirm,
      } as Json,
    })
    .eq("id", profile.tenant_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/settings");
  return { ok: true };
}

export async function saveWidgetSettings(input: {
  primaryColor: string;
  radius: string;
  layout: string;
  allowedDomains: string[];
  customFields: Array<{ key: string; label: string; type: string; required: boolean }>;
  active: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!supabaseEnvConfigured()) {
    return { ok: false, error: "Connect Supabase to save widget settings." };
  }
  const profile = await requireRole("business_owner");
  if (!profile.tenant_id) return { ok: false, error: "No business found." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("widget_configs")
    .update({
      theme: {
        primary_color: input.primaryColor,
        radius: input.radius,
        layout: input.layout,
      } as Json,
      allowed_domains: input.allowedDomains,
      custom_fields: input.customFields as unknown as Json,
      active: input.active,
    })
    .eq("tenant_id", profile.tenant_id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard/widget");
  revalidatePath("/book/[public_key]", "page");
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

export async function saveNotificationSettings(input: {
  bookingConfirmations: boolean;
  reminderEmails: boolean;
  newBookingAlerts: boolean;
  dailySummary: boolean;
  smsReminders: boolean;
  smsReminder24h: boolean;
  smsReminder2h: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
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
  const notificationSettings = {
    booking_confirmations: input.bookingConfirmations,
    reminder_emails: input.reminderEmails,
    new_booking_alerts: input.newBookingAlerts,
    daily_summary: input.dailySummary,
    sms_reminders: input.smsReminders,
    sms_reminder_24h: input.smsReminder24h,
    sms_reminder_2h: input.smsReminder2h,
  };

  const { error } = await supabase
    .from("tenants")
    .update({ settings: { ...settings, notifications: notificationSettings } as Json })
    .eq("id", profile.tenant_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard/settings");
  return { ok: true };
}

export async function startGoogleCalendarConnect(): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const profile = await requireRole("business_owner", "employee");
  if (!profile.tenant_id) return { ok: false, error: "No business found." };
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return { ok: false, error: "Google Calendar isn't configured yet." };
  }
  return { ok: true, url: "/api/integrations/google/start" };
}

export async function testSmsConfiguration(
  to: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!smsConfigured()) return { ok: false, error: "Twilio isn't configured yet." };
  const profile = await requireRole("business_owner");
  if (!profile.tenant_id) return { ok: false, error: "No business found." };
  const { sendSms } = await import("@/lib/integrations/sms");
  const result = await sendSms(to.trim(), "Diamond Booking test reminder: your SMS configuration is working.");
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}
