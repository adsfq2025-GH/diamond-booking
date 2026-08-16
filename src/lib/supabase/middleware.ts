import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";

/**
 * Session refresh helper for the root middleware/proxy, per the
 * @supabase/ssr docs. Revalidates the auth token (supabase.auth.getUser())
 * and mirrors any refreshed cookies onto both the forwarded request and
 * the response.
 *
 * IMPORTANT: always return (a response derived from) the `response` object
 * this produces, or auth cookies will be dropped.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do NOT insert logic between client creation and getUser(): the call
  // refreshes expired tokens and must run on every matched request.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, supabase, user };
}
