import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { exchangeGoogleCode, fetchGoogleCalendarProfile } from "@/lib/integrations/google-calendar";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state) {
    return NextResponse.redirect(new URL("/dashboard/settings#integrations", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"));
  }

  const payload = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as { profileId: string; tenantId: string | null };
  if (!payload.tenantId) {
    return NextResponse.redirect(new URL("/dashboard/settings#integrations", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"));
  }

  const token = await exchangeGoogleCode(code);
  const googleProfile = await fetchGoogleCalendarProfile(token.access_token);
  const admin = createAdminClient();
  await admin.from("google_calendar_connections").upsert({
    tenant_id: payload.tenantId,
    profile_id: payload.profileId,
    email: googleProfile.email ?? null,
    calendar_id: "primary",
    access_token: token.access_token,
    refresh_token: token.refresh_token ?? null,
    token_expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(),
    sync_enabled: true,
  }, { onConflict: "profile_id,provider" });

  return NextResponse.redirect(new URL("/dashboard/settings#integrations", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"));
}
