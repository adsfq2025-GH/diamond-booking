import type { Metadata } from "next";
import { supabaseEnvConfigured } from "@/lib/env";
import { requireRole } from "@/lib/auth";
import { getEmployeePortal } from "@/lib/portal/data";
import { PortalShell } from "@/components/portal/PortalShell";
import { EmployeePortalClient } from "@/components/portal/EmployeePortalClient";

export const metadata: Metadata = { title: "My schedule" };

export default async function TeamPortalPage() {
  const preview = !supabaseEnvConfigured();
  let name = "Maria Lopez";
  let title = "Team member";
  if (!preview) {
    const profile = await requireRole("employee");
    name = profile.full_name;
  }
  const data = getEmployeePortal();
  if (!preview) title = data.title;

  return (
    <PortalShell eyebrow="Team portal" userName={preview ? data.name : name} userSubtitle={title} accentColor={data.color}>
      <EmployeePortalClient data={data} preview={preview} />
    </PortalShell>
  );
}
