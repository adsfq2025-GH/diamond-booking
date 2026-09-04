import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { getEmployeePortalData } from "@/lib/portal/employee-data";
import { PortalShell } from "@/components/portal/PortalShell";
import { EmployeePortalClient } from "@/components/portal/EmployeePortalClient";

export const metadata: Metadata = { title: "My schedule" };

export default async function TeamPortalPage() {
  const profile = await requireRole("employee");
  const data = await getEmployeePortalData(profile);

  return (
    <PortalShell eyebrow="Team portal" userName={profile.full_name} userSubtitle={data.title} accentColor={data.color}>
      <EmployeePortalClient data={data} />
    </PortalShell>
  );
}
