import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { buildGoogleCalendarAuthUrl, googleCalendarConfigured } from "@/lib/integrations/google-calendar";

export async function GET() {
  const profile = await requireRole("business_owner", "employee");
  if (!googleCalendarConfigured()) {
    return NextResponse.redirect(new URL("/dashboard/settings#integrations?google=not-configured", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"));
  }
  const state = Buffer.from(JSON.stringify({ profileId: profile.id, tenantId: profile.tenant_id, role: profile.role })).toString("base64url");
  return NextResponse.redirect(buildGoogleCalendarAuthUrl(state));
}
