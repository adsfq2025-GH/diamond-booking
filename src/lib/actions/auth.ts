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
import type { Json, PlanTier, TablesInsert, UserRole } from "@/types/database";

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

/**
 * Whether a new owner must prove they control the email address before they
 * can sign in.
 *
 * Owner signup confirms the address automatically, which the review flagged as
 * a decision nobody had made: fine for invited pilot businesses whose address
 * the operator already knows, not fine for open registration, where it lets
 * anyone create a workspace against somebody else's email. The behaviour is
 * now an explicit, documented switch rather than an accident of
 * `email_confirm: true`. Set REQUIRE_EMAIL_VERIFICATION=true before opening
 * registration to the public.
 */
function emailVerificationRequired(): boolean {
  return process.env.REQUIRE_EMAIL_VERIFICATION === "true";
}

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

  // Plan the owner chose on the signup form (they trial it for 7 days).
  const planRaw = field(formData, "plan");
  const plan: PlanTier = (["starter", "professional", "elite"] as const).includes(
    planRaw as PlanTier,
  )
    ? (planRaw as PlanTier)
    : "professional";

  if (!business || !fullName || !industry || !EMAIL_RE.test(email)) {
    return { error: "Please fill out every field with valid values." };
  }
  if (passwordScore(password) < MIN_PASSWORD_SCORE) {
    return { error: "That password is too weak — use at least 8 characters, ideally with a number." };
  }

  const admin = createAdminClient();

  // 1. Auth user, with app_metadata.role for the middleware JWT fallback.
  const requireVerification = emailVerificationRequired();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: !requireVerification,
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

  // 2. Tenant + profile + defaults. Any failure -> remove BOTH the auth user
  //    and any tenant already created, so the email isn't burned by a
  //    half-created account and no ownerless tenant is left behind.
  let rollbackTenantId: string | null = null;
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
        plan,
        subscription_status: "trialing",
        trial_ends_at: trialEndsAt,
      })
      .select("id")
      .single();
    if (tenantError || !tenant) throw tenantError ?? new Error("tenant insert failed");
    rollbackTenantId = tenant.id;

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
    console.error("signUp: tenant bootstrap failed, rolling back", err);
    // Both halves of the rollback. Only the auth user was removed before, so a
    // failure after the tenant insert — hours, profile or widget config —
    // left an orphan tenant behind with no owner and no way to reach it.
    // profiles, business_hours and widget_configs all cascade from tenants.
    if (rollbackTenantId) {
      const { error: tenantCleanupError } = await admin
        .from("tenants")
        .delete()
        .eq("id", rollbackTenantId);
      if (tenantCleanupError) {
        // Worth knowing about: this is the orphan the audit looked for.
        console.error("signUp: could not remove the orphan tenant", rollbackTenantId, tenantCleanupError);
      }
    }
    await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    return { error: "We couldn't finish setting up your workspace. Please try again." };
  }

  // 3. Sign them in on this browser (cookie-bound client) — unless the address
  //    has to be verified first, in which case there is nothing to sign in to
  //    yet and saying so is the honest outcome.
  if (requireVerification) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const verify = await createClient();
    await verify.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${appUrl}/auth/confirm?next=/onboarding` },
    });
    redirect("/login?verify=1");
  }

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

  // A guest who booked before they had an account owns customers rows with no
  // profile_id, and the portal only shows bookings linked to the signed-in
  // profile — so their own history was invisible with no way to claim it.
  // Adopting those rows on sign-in is the missing step; it matches on the
  // address this session just authenticated, and only takes unclaimed rows.
  if (role === "customer") {
    const { error: linkError } = await supabase.rpc("link_guest_customer_records");
    if (linkError) {
      // Not fatal: they can still sign in, they just may not see past guest
      // bookings yet. Worth a log, since it is silent to the customer.
      console.error("signIn: could not link guest customer records", linkError);
    }
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
