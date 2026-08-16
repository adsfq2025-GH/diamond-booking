import type { Metadata } from "next";
import { supabaseEnvConfigured } from "@/lib/env";
import { requireRole } from "@/lib/auth";
import { getDashboardContext } from "@/lib/dashboard/data";
import { DashboardChrome } from "@/components/dashboard/DashboardChrome";

export const metadata: Metadata = {
  title: {
    template: "%s · Diamond Booking",
    default: "Dashboard · Diamond Booking",
  },
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // With real keys, gate the whole app surface to the business owner.
  // In placeholder mode the guard is skipped and mock context is used.
  if (supabaseEnvConfigured()) {
    await requireRole("business_owner");
  }
  const context = await getDashboardContext();

  return <DashboardChrome context={context}>{children}</DashboardChrome>;
}
