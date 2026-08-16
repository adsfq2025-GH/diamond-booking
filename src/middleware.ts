import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { supabaseEnvConfigured } from "@/lib/env";
import type { UserRole } from "@/types/database";

/**
 * Route protection. The app routes themselves may not exist yet — this
 * guards the path prefixes:
 *
 *   /dashboard/*  -> business_owner
 *   /onboarding   -> business_owner
 *   /team/*       -> employee
 *   /portal/*     -> customer
 *   /admin/*      -> super_admin
 *
 * Marketing routes and /book/* (the public widget/booking page) stay public.
 * Unauthenticated -> /login?redirect=<path>; wrong role -> their own home.
 *
 * Note: Next.js 16 renamed the `middleware` convention to `proxy`. The
 * middleware.ts convention still works (deprecated). To migrate, rename
 * this file to src/proxy.ts and export `proxy` instead of `middleware`.
 */

const PROTECTED_PREFIXES: Array<{ prefix: string; role: UserRole }> = [
  { prefix: "/dashboard", role: "business_owner" },
  { prefix: "/onboarding", role: "business_owner" },
  { prefix: "/team", role: "employee" },
  { prefix: "/portal", role: "customer" },
  { prefix: "/admin", role: "super_admin" },
];

const ROLE_HOME: Record<UserRole, string> = {
  super_admin: "/admin",
  business_owner: "/dashboard",
  employee: "/team",
  customer: "/portal",
};

function matchProtected(pathname: string) {
  return PROTECTED_PREFIXES.find(
    ({ prefix }) =>
      pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function middleware(request: NextRequest) {
  // PLACEHOLDER-ENV PREVIEW MODE: when .env.local still holds the local
  // placeholder Supabase keys there is no backend to authenticate against,
  // so route protection is skipped entirely. The protected pages themselves
  // detect the same condition (supabaseEnvConfigured) and render mock data.
  // With real keys this branch never runs.
  if (!supabaseEnvConfigured()) {
    return NextResponse.next();
  }

  // Always run the session refresh so auth cookies stay valid on every route.
  const { response, supabase, user } = await updateSession(request);

  const { pathname } = request.nextUrl;
  const match = matchProtected(pathname);
  if (!match) {
    return response; // public route (marketing, /book/*, /login, ...)
  }

  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set(
      "redirect",
      pathname + (request.nextUrl.search || ""),
    );
    return NextResponse.redirect(loginUrl);
  }

  // Role comes from the user's profile; JWT app_metadata is the fallback
  // (set at signup) so a missing/slow profile read doesn't lock users out.
  let role: UserRole | null = null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  role = profile?.role ?? (user.app_metadata?.role as UserRole | undefined) ?? null;

  if (!role) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (role !== match.role) {
    // Signed in, wrong area -> send them to their own home.
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = ROLE_HOME[role];
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Run on everything except static assets so the Supabase session is
     * refreshed on all real page/API requests.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|woff2?)$).*)",
  ],
};
