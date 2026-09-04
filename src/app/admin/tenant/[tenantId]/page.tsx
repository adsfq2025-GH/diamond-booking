import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getAdminTenantById } from "@/lib/portal/admin-data";
import { PortalShell } from "@/components/portal/PortalShell";
import { TenantProfileClient } from "@/components/portal/TenantProfileClient";

export const metadata: Metadata = { title: "Tenant profile" };

export default async function AdminTenantProfilePage({ params }: PageProps<"/admin/tenant/[tenantId]">) {
  const profile = await requireRole("super_admin");

  const { tenantId } = await params;
  const tenant = await getAdminTenantById(tenantId);

  if (!tenant) {
    notFound();
  }

  return (
    <PortalShell eyebrow="Platform admin" userName={profile.full_name} userSubtitle="Super admin" accentColor="var(--navy-700)">
      <TenantProfileClient tenant={tenant} />
    </PortalShell>
  );
}
