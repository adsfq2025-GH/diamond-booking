import "server-only";
import { stripeConfigured } from "./stripe";
import { emailConfigured } from "./email";
import { smsConfigured } from "./sms";
import { googleCalendarConfigured } from "./google-calendar";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";

/** Which integrations have their env vars set. For the settings UI. */
export interface IntegrationStatus {
  stripe: boolean;
  resend: boolean;
  twilio: boolean;
  googleCalendar: boolean;
}

export async function integrationStatus(): Promise<IntegrationStatus> {
  const profile = await getProfile();
  if (!profile?.tenant_id) {
    return {
      stripe: stripeConfigured(),
      resend: emailConfigured(),
      twilio: smsConfigured(),
      googleCalendar: googleCalendarConfigured(),
    };
  }
  const supabase = await createClient();
  const [{ data: tenant }, { data: calendars }] = await Promise.all([
    supabase.from("tenants").select("stripe_connect_account_id, stripe_charges_enabled").eq("id", profile.tenant_id).maybeSingle(),
    supabase.from("google_calendar_connections").select("id").eq("tenant_id", profile.tenant_id).limit(1),
  ]);
  return {
    stripe: stripeConfigured() && Boolean(tenant?.stripe_connect_account_id || tenant?.stripe_charges_enabled),
    resend: emailConfigured(),
    twilio: smsConfigured(),
    googleCalendar: googleCalendarConfigured() && Boolean(calendars?.length),
  };
}
