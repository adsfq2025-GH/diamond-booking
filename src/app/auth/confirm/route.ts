import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { supabaseEnvConfigured } from "@/lib/env";

/**
 * Email-link landing endpoint. Supabase auth emails (password recovery,
 * email confirmation, invites) point here with either:
 *   ?token_hash=...&type=recovery|invite|email...   (OTP-hash flow)
 *   ?code=...                                       (PKCE code flow)
 * We verify/exchange server-side (sets the session cookies) and forward to
 * `next` (e.g. /reset-password). Failures land on /login with a message.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");

  const rawNext = searchParams.get("next") ?? "/";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  const redirectTo = (path: string) =>
    NextResponse.redirect(new URL(path, request.nextUrl.origin));

  if (!supabaseEnvConfigured()) {
    return redirectTo("/login");
  }

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return redirectTo(next);
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return redirectTo(next);
  }

  return redirectTo("/login?link=expired");
}
