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

  // Platform-level email sender (env-configured), shown read-only in the console.
  const platformEmail =
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
      ? { method: "smtp" as const, detail: process.env.SMTP_HOST }
      : process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL
        ? { method: "resend" as const, detail: process.env.RESEND_FROM_EMAIL }
        : { method: "none" as const, detail: "" };

  return (
    <PortalShell eyebrow="Platform admin" userName={name} userSubtitle="Super admin" accentColor="var(--navy-700)">
      <AdminClient data={data} platformEmail={platformEmail} preview={preview} />
    </PortalShell>
  );
}
