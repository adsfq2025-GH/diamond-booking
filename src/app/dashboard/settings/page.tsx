import type { Metadata } from "next";
import { supabaseEnvConfigured } from "@/lib/env";
import { getDashboardContext } from "@/lib/dashboard/data";
import { integrationStatus } from "@/lib/integrations/status";
import { SettingsClient } from "@/components/dashboard/sections/SettingsClient";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const context = await getDashboardContext();
  return (
    <SettingsClient
      tenantName={context.tenantName}
      ownerEmail={context.ownerEmail}
      plan={context.plan}
      preview={!supabaseEnvConfigured()}
      integrations={integrationStatus()}
    />
  );
}
