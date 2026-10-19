import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { verifyState } from "@/lib/signed-state";
import { exchangeGoogleCode, fetchGoogleCalendarProfile } from "@/lib/integrations/google-calendar";

/**
 * Google Calendar OAuth callback.
 *
 * Two independent checks before any token is stored:
 *   1. `state` must carry a valid, unexpired HMAC signature from this server
 *      (see lib/signed-state). Previously it was unsigned base64, so anyone
 *      could name any tenant and have their own Google tokens written into it
 *      — the connected calendar then received that tenant's bookings.
 *   2. The signed subject must match the live session. A valid state replayed
 *      by someone else is rejected.
 *
 * Both failures redirect to Settings with an error flag rather than reporting
 * success, and nothing is written.
 */

function settingsRedirect(status?: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const url = new URL("/dashboard/settings", base);
  if (status) url.searchParams.set("google", status);
  url.hash = "integrations";
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");

  // Google reports user-side failures (consent declined) here too.
  if (req.nextUrl.searchParams.get("error")) return settingsRedirect("declined");
  if (!code || !state) return settingsRedirect("invalid");

  const payload = verifyState<{ profileId: string; tenantId: string | null }>(state);
  if (!payload || !payload.profileId || !payload.tenantId) {
    return settingsRedirect("invalid-state");
  }

  // The state is authentic — now confirm it belongs to whoever is driving this
  // request, so a captured state cannot be replayed by another account.
  const profile = await getProfile();
  if (
    !profile ||
    profile.id !== payload.profileId ||
    profile.tenant_id !== payload.tenantId
  ) {
    return settingsRedirect("session-mismatch");
  }

  try {
    const token = await exchangeGoogleCode(code);
    const googleProfile = await fetchGoogleCalendarProfile(token.access_token);
    const admin = createAdminClient();
    const { error } = await admin.from("google_calendar_connections").upsert(
      {
        tenant_id: profile.tenant_id,
        profile_id: profile.id,
        email: googleProfile.email ?? null,
        calendar_id: "primary",
        access_token: token.access_token,
        refresh_token: token.refresh_token ?? null,
        token_expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(),
        sync_enabled: true,
      },
      { onConflict: "profile_id,provider" },
    );
    if (error) {
      console.error("[google callback] could not store connection", error);
      return settingsRedirect("store-failed");
    }
  } catch (err) {
    console.error("[google callback] token exchange failed", err);
    return settingsRedirect("exchange-failed");
  }

  return settingsRedirect("connected");
}
