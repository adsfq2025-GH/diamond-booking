import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { getCustomerPortalData } from "@/lib/portal/customer-data";
import { PortalShell } from "@/components/portal/PortalShell";
import { CustomerPortalClient } from "@/components/portal/CustomerPortalClient";

export const metadata: Metadata = { title: "My bookings" };

export default async function CustomerPortalPage() {
  const profile = await requireRole("customer");
  const data = await getCustomerPortalData(profile);

  return (
    <PortalShell eyebrow="Customer portal" userName={profile.full_name} userSubtitle="Customer">
      <CustomerPortalClient data={data} />
    </PortalShell>
  );
}
