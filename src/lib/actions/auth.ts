"use server";

/**
 * Auth server actions: signUp, signIn, signOut, requestPasswordReset,
 * updatePassword.
 *
 * Rules honored here (see docs/BACKEND.md):
 *  - profiles are ONLY created by the service-role admin client (there is
 *    deliberately no self-serve insert policy on profiles)
 *  - app_metadata.role is set at signup so the middleware's JWT fallback
 *    works even if the profile read is slow/missing
 *  - tenant bootstrap (tenant + hours + widget config) happens atomically
 *    from the app's perspective: any failure rolls back the auth user.
 */

import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { supabaseEnvConfigured } from "@/lib/env";
import { slugify, uniqueSlug } from "@/lib/slug";
import { MIN_PASSWORD_SCORE, passwordScore } from "@/lib/password";
import {
  DEFAULT_ACCENT_COLOR,
  DEFAULT_PRIMARY_COLOR,
  defaultHours,
  type TenantSettings,
} from "@/lib/onboarding/types";
import type { Json, TablesInsert, UserRole } from "@/types/database";

export type AuthFormState = {
  error?: string;
  success?: boolean;
} | null;

const ROLE_HOME: Record<UserRole, string> = {
  super_admin: "/admin",
  business_owner: "/dashboard",
  employee: "/team",
  customer: "/portal",
};

const NOT_CONFIGURED =
  "The backend isn't configured yet — add real Supabase keys to .env.local first.";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TRIAL_DAYS = 7;

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** Only allow same-origin path redirects ("/dashboard", never "//evil.com"). */
function safeRedirectPath(raw: string): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

// ============================================================
// signUp
// ============================================================
export async function signUp(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!supabaseEnvConfigured()) return { error: NOT_CONFIGURED };

  const business = field(formData, "organization");
  const fullName = field(formData, "name");
  const email = field(formData, "email").toLowerCase();
  const password = String(formData.get("new-password") ?? "");
  const industry = field(formData, "industry");

  if (!business || !fullName || !industry || !EMAIL_RE.test(email)) {
    return { error: "Please fill out every field with valid values." };
  }
  if (passwordScore(password) < MIN_PASSWORD_SCORE) {
    return { error: "That password is too weak — use at least 8 characters, ideally with a number." };
  }

  const admin = createAdminClient();

  // 1. Auth user, with app_metadata.role for the middleware JWT fallback.
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: "business_owner" satisfies UserRole },
    user_metadata: { full_name: fullName },
  });

  if (createError || !created?.user) {
    const msg = createError?.message ?? "";
    if (createError?.code === "email_exists" || /already.*regist/i.test(msg)) {
      return { error: "That email already has a Diamond account — sign in instead." };
    }
    if (createError?.code === "weak_password" || /password/i.test(msg)) {
      return { error: "That password doesn't meet the security requirements — try a longer one." };
    }
    return { error: "We couldn't create your account. Please try again." };
  }
  const userId = created.user.id;

  // 2. Tenant + profile + defaults. Any failure -> remove the auth user so
  //    the email isn't burned by a half-created account.
  try {
    // Unique slug from the business name.
    const base = slugify(business);
    const { data: taken, error: slugError } = await admin
      .from("tenants")
      .select("slug")
      .like("slug", `${base}%`);
    if (slugError) throw slugError;
    const slug = uniqueSlug(base, new Set((taken ?? []).map((t) => t.slug)));

    const trialEndsAt = new Date(
      Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    const settings: TenantSettings = {
      auto_confirm: false,
      cancellation_window_hours: 24,
      deposit_required: false,
      payments_enabled: false,
      onboarding_step: 1,
      onboarding_complete: false,
    };

    const { data: tenant, error: tenantError } = await admin
      .from("tenants")
      .insert({
        slug,
        name: business,
        industry,
        email,
        timezone: "America/New_York",
        branding: {
          logo_url: null,
          primary_color: DEFAULT_PRIMARY_COLOR,
          accent_color: DEFAULT_ACCENT_COLOR,
          photos: [],
        } as unknown as Json,
        settings: settings as unknown as Json,
        plan: "starter",
        subscription_status: "trialing",
        trial_ends_at: trialEndsAt,
      })
      .select("id")
      .single();
    if (tenantError || !tenant) throw tenantError ?? new Error("tenant insert failed");

    // Profile — service role only (no self-serve insert policy).
    const { error: profileError } = await admin.from("profiles").insert({
      id: userId,
      tenant_id: tenant.id,
      role: "business_owner",
      full_name: fullName,
      email,
    });
    if (profileError) throw profileError;

    // Default business hours: Mon–Fri 8:00–18:00, weekend closed.
    const hoursRows: TablesInsert<"business_hours">[] = defaultHours().map(
      (d) => ({
        tenant_id: tenant.id,
        weekday: d.weekday,
        closed: d.closed,
        open_time: d.closed ? null : d.open_time,
        close_time: d.closed ? null : d.close_time,
      }),
    );
    const { error: hoursError } = await admin
      .from("business_hours")
      .insert(hoursRows);
    if (hoursError) throw hoursError;

    // Default widget config (public_key is generated by the DB).
    const { error: widgetError } = await admin.from("widget_configs").insert({
      tenant_id: tenant.id,
      theme: {
        primary_color: DEFAULT_PRIMARY_COLOR,
        accent_color: DEFAULT_ACCENT_COLOR,
        radius: "12px",
      } as unknown as Json,
    });
    if (widgetError) throw widgetError;
  } catch (err) {
    console.error("signUp: tenant bootstrap failed, rolling back auth user", err);
    await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    return { error: "We couldn't finish setting up your workspace. Please try again." };
  }

  // 3. Sign them in on this browser (cookie-bound client).
  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) {
    // Account exists and is fully set up; let them sign in manually.
    redirect("/login?created=1");
  }

  redirect("/onboarding");
}

// ============================================================
// signIn
// ============================================================
export async function signIn(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!supabaseEnvConfigured()) return { error: NOT_CONFIGURED };

  const email = field(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const remember = formData.get("remember") != null;
  const redirectParam = safeRedirectPath(field(formData, "redirect"));

  if (!EMAIL_RE.test(email) || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient({ sessionOnly: !remember });
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    if (error?.code === "invalid_credentials") {
      return { error: "That email and password don't match an account. Check both and try again." };
    }
    if (error?.code === "email_not_confirmed") {
      return { error: "Confirm your email first — check your inbox for the confirmation link." };
    }
    return { error: "Sign-in failed. Please try again in a moment." };
  }

  // Role from the profile; app_metadata is the fallback (set at signup).
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", data.user.id)
    .maybeSingle();
  const role =
    profile?.role ??
    (data.user.app_metadata?.role as UserRole | undefined) ??
    null;

  if (!role) {
    await supabase.auth.signOut();
    return { error: "Your account isn't fully set up yet. Contact support." };
  }

  // Owners land on onboarding until it's marked complete.
  let destination = ROLE_HOME[role];
  if (role === "business_owner" && profile?.tenant_id) {
    const { data: tenant } = await supabase
      .from("tenants")
      .select("settings")
      .eq("id", profile.tenant_id)
      .maybeSingle();
    const settings = (tenant?.settings ?? {}) as TenantSettings;
    if (!settings.onboarding_complete) destination = "/onboarding";
  }

  // An explicit ?redirect= wins when present (middleware bounces wrong roles).
  redirect(redirectParam ?? destination);
}

// ============================================================
// signOut
// ============================================================
export async function signOut(): Promise<void> {
  if (supabaseEnvConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}

// ============================================================
// requestPasswordReset
// ============================================================
export async function requestPasswordReset(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!supabaseEnvConfigured()) return { error: NOT_CONFIGURED };

  const email = field(formData, "email").toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return { error: "Enter the email on your account." };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const supabase = await createClient();
  // Deliberately ignore "user not found" — never leak whether an email exists.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl}/auth/confirm?next=/reset-password`,
  });

  return { success: true };
}

// ============================================================
// updatePassword (the /reset-password page, after the email link)
// ============================================================
export async function updatePassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!supabaseEnvConfigured()) return { error: NOT_CONFIGURED };

  const password = String(formData.get("new-password") ?? "");
  const confirm = String(formData.get("confirm-password") ?? "");

  if (passwordScore(password) < MIN_PASSWORD_SCORE) {
    return { error: "Use at least 8 characters — a number helps too." };
  }
  if (password !== confirm) {
    return { error: "Those passwords don't match." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error:
        "This reset link has expired or was already used. Request a new one from the sign-in page.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (/different from the old password|same_password/i.test(error.message)) {
      return { error: "Your new password must be different from the old one." };
    }
    return { error: "We couldn't update your password. Please try again." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role =
    profile?.role ?? (user.app_metadata?.role as UserRole | undefined) ?? null;

  redirect(role ? ROLE_HOME[role] : "/login");
}
