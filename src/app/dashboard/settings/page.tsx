import type { Metadata } from "next";
import { supabaseEnvConfigured } from "@/lib/env";
import {
  getBookingSettings,
  getBusinessProfile,
  getDashboardContext,
  getEmailSettings,
} from "@/lib/dashboard/data";
import { integrationStatus } from "@/lib/integrations/status";
import { SettingsClient } from "@/components/dashboard/sections/SettingsClient";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [context, profile, email, booking] = await Promise.all([
    getDashboardContext(),
    getBusinessProfile(),
    getEmailSettings(),
    getBookingSettings(),
  ]);
  return (
    <SettingsClient
      profile={profile}
      email={email}
      booking={booking}
      plan={context.plan}
      preview={!supabaseEnvConfigured()}
      integrations={integrationStatus()}
    />
  );
}
