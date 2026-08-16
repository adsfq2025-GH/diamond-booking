import type { Metadata } from "next";
import { supabaseEnvConfigured } from "@/lib/env";
import { requireRole } from "@/lib/auth";
import { getCustomerPortal } from "@/lib/portal/data";
import { PortalShell } from "@/components/portal/PortalShell";
import { CustomerPortalClient } from "@/components/portal/CustomerPortalClient";

export const metadata: Metadata = { title: "My bookings" };

export default async function CustomerPortalPage() {
  const preview = !supabaseEnvConfigured();
  const data = getCustomerPortal();
  let name = data.name;
  if (!preview) {
    const profile = await requireRole("customer");
    name = profile.full_name;
  }

  return (
    <PortalShell eyebrow="Customer portal" userName={name} userSubtitle="Customer">
      <CustomerPortalClient data={data} preview={preview} />
    </PortalShell>
  );
}
