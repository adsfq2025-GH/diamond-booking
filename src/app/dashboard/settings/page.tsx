import type { Metadata } from "next";
import { supabaseEnvConfigured } from "@/lib/env";
import { getBusinessProfile, getDashboardContext } from "@/lib/dashboard/data";
import { integrationStatus } from "@/lib/integrations/status";
import { SettingsClient } from "@/components/dashboard/sections/SettingsClient";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [context, profile] = await Promise.all([
    getDashboardContext(),
    getBusinessProfile(),
  ]);
  return (
    <SettingsClient
      profile={profile}
      plan={context.plan}
      preview={!supabaseEnvConfigured()}
      integrations={integrationStatus()}
    />
  );
}
