import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { buildGoogleCalendarAuthUrl, googleCalendarConfigured } from "@/lib/integrations/google-calendar";
import { signState } from "@/lib/signed-state";

export async function GET() {
  const profile = await requireRole("business_owner", "employee");
  if (!googleCalendarConfigured()) {
    return NextResponse.redirect(new URL("/dashboard/settings#integrations?google=not-configured", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"));
  }
  // Signed + expiring: the callback rejects anything it did not issue, and
  // re-checks the subject against the session (see lib/signed-state).
  const state = signState({
    profileId: profile.id,
    tenantId: profile.tenant_id,
    role: profile.role,
  });
  return NextResponse.redirect(buildGoogleCalendarAuthUrl(state));
}
