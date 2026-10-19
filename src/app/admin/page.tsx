import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { getAdminData, getPlatformHealth } from "@/lib/portal/admin-data";
import { configProblems, stripePriceProblems } from "@/lib/config-check";
import { PortalShell } from "@/components/portal/PortalShell";
import { AdminClient } from "@/components/portal/AdminClient";

export const metadata: Metadata = { title: "Platform admin" };

export default async function AdminPage(props: PageProps<"/admin">) {
  const profile = await requireRole("super_admin");
  const searchParams = await props.searchParams;
  const tab = typeof searchParams.tab === "string" ? searchParams.tab : undefined;
  // The Stripe comparison is a network call; it must never stop the page
  // rendering, so a failure degrades to no extra problems rather than an error.
  const [data, health, priceProblems] = await Promise.all([
    getAdminData(),
    getPlatformHealth(),
    stripePriceProblems().catch(() => []),
  ]);
  const problems = [...configProblems(), ...priceProblems];

  // Platform-level email sender (env-configured), shown read-only in the console.
  const platformEmail =
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
      ? { method: "smtp" as const, detail: process.env.SMTP_HOST }
      : process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL
        ? { method: "resend" as const, detail: process.env.RESEND_FROM_EMAIL }
        : { method: "none" as const, detail: "" };

  return (
    <PortalShell eyebrow="Platform admin" userName={profile.full_name} userSubtitle="Super admin" accentColor="var(--navy-700)">
      <AdminClient
        data={data}
        platformEmail={platformEmail}
        initialTab={tab}
        health={health}
        configProblems={problems}
      />
    </PortalShell>
  );
}
