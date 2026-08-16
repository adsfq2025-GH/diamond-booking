// Server-side only: imports next/headers, so Next.js will refuse to bundle
// this module into client components.
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * SSR Supabase client bound to the current request's cookies.
 * Use in Server Components, Server Actions and Route Handlers.
 *
 * `sessionOnly: true` strips Max-Age/Expires from the auth cookies so they
 * become browser-session cookies — used by signIn when "keep me signed in"
 * is unchecked.
 */
export async function createClient(options?: { sessionOnly?: boolean }) {
  const cookieStore = await cookies();
  const sessionOnly = options?.sessionOnly ?? false;

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options: cookieOptions }) =>
              cookieStore.set(
                name,
                value,
                sessionOnly
                  ? { ...cookieOptions, maxAge: undefined, expires: undefined }
                  : cookieOptions,
              ),
            );
          } catch {
            // Called from a Server Component: cookies are read-only there.
            // Safe to ignore when middleware refreshes the session.
          }
        },
      },
    },
  );
}

/**
 * Service-role admin client. BYPASSES RLS — server-side only, never expose.
 * Use for: onboarding (creating tenants/profiles), Stripe webhooks,
 * invite acceptance, cross-tenant super-admin jobs.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "createAdminClient: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set",
    );
  }

  return createSupabaseClient<Database>(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
