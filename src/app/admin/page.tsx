import type { Metadata } from "next";
import { supabaseEnvConfigured } from "@/lib/env";
import { requireRole } from "@/lib/auth";
import { getAdminData } from "@/lib/portal/data";
import { PortalShell } from "@/components/portal/PortalShell";
import { AdminClient } from "@/components/portal/AdminClient";

export const metadata: Metadata = { title: "Platform admin" };

export default async function AdminPage() {
  const preview = !supabaseEnvConfigured();
  let name = "Diamond Admin";
  if (!preview) {
    const profile = await requireRole("super_admin");
    name = profile.full_name;
  }
  const data = getAdminData();

  return (
    <PortalShell eyebrow="Platform admin" userName={name} userSubtitle="Super admin" accentColor="var(--navy-700)">
      <AdminClient data={data} preview={preview} />
    </PortalShell>
  );
}
