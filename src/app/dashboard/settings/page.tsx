import type { Metadata } from "next";
import {
  getBookingSettings,
  getBusinessProfile,
  getDashboardContext,
  getEmailSettings,
  getIntegrationConnections,
  getNotificationSettings,
} from "@/lib/dashboard/data";
import { integrationStatus } from "@/lib/integrations/status";
import { SettingsClient } from "@/components/dashboard/sections/SettingsClient";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [context, profile, email, booking, notificationSettings, connections, integrations] = await Promise.all([
    getDashboardContext(),
    getBusinessProfile(),
    getEmailSettings(),
    getBookingSettings(),
    getNotificationSettings(),
    getIntegrationConnections(),
    integrationStatus(),
  ]);
  return (
    <SettingsClient
      profile={profile}
      email={email}
      booking={booking}
      plan={context.plan}
      integrations={integrations}
      notificationSettings={notificationSettings}
      connections={connections}
    />
  );
}
