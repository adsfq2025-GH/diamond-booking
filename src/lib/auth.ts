import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/database";
import type { Profile } from "@/types/domain";

const ROLE_HOME: Record<UserRole, string> = {
  super_admin: "/admin",
  business_owner: "/dashboard",
  employee: "/team",
  customer: "/portal",
};

/**
 * The authenticated user for the current request, or null.
 * Uses getUser() (revalidates the JWT against Supabase) — do not trust
 * getSession() alone on the server.
 */
export const getSession = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * The current user's profile row (role + tenant), or null when signed out
 * or when no profile exists yet.
 */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  return profile ?? null;
});

/**
 * Guard for server components/actions. Redirects to /login when signed out
 * and to the user's own home when their role is not in `roles`.
 * Returns the profile when the check passes.
 */
export async function requireRole(
  ...roles: UserRole[]
): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) {
    redirect("/login");
  }
  if (roles.length > 0 && !roles.includes(profile.role)) {
    redirect(ROLE_HOME[profile.role]);
  }
  return profile;
}

/** Convenience: require any signed-in user with a profile. */
export async function requireUser(): Promise<Profile> {
  return requireRole();
}
