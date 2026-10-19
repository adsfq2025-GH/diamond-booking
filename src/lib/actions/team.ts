"use server";

/**
 * Teammate invitations (A22).
 *
 * "Invite teammate" was `<ActionButton icon="plus">Invite teammate</ActionButton>`
 * with no onClick. Nothing in the codebase sent an invitation: employees rows
 * carried invite_email and the UI showed an "Invited" badge, but no token was
 * generated, no email was sent, and there was no acceptance route to link a
 * profile to the employee row. Staff could therefore never reach their own
 * schedule — which is also why owners had no way to set working hours.
 *
 * Invitations are now real: a single-use token with a 14-day expiry, an email,
 * and an acceptance route that binds the profile inside one SECURITY DEFINER
 * function (the profiles role/tenant columns are protected by the 0007 guard,
 * so a client cannot do it directly).
 */

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { supabaseEnvConfigured } from "@/lib/env";
import { canAddEmployee, tenantPlanContext } from "@/lib/entitlements";
import { sendTeamInvitation } from "@/lib/integrations/email";

export type TeamActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function ownerScope() {
  const profile = await requireRole("business_owner");
  if (!profile.tenant_id) return null;
  const supabase = await createClient();
  return { profile, tenantId: profile.tenant_id, supabase };
}

/**
 * Create a teammate (if new) and send them an invitation.
 *
 * Re-inviting an existing, not-yet-accepted teammate replaces their pending
 * token rather than creating a duplicate employee row.
 */
export async function inviteTeammate(input: {
  name: string;
  email: string;
  title?: string;
  color?: string;
}): Promise<TeamActionResult> {
  if (!supabaseEnvConfigured()) {
    return { ok: false, error: "Preview mode — connect Supabase to send invitations." };
  }
  const s = await ownerScope();
  if (!s) return { ok: false, error: "No business found." };

  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name) return { ok: false, error: "Please enter their name." };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Please enter a valid email address." };

  // Is this an existing teammate, or a new seat?
  const { data: existing } = await s.supabase
    .from("employees")
    .select("id, profile_id")
    .eq("tenant_id", s.tenantId)
    .or(`invite_email.eq.${email},and(invite_email.is.null,display_name.eq.${name})`)
    .limit(1)
    .maybeSingle();

  if (existing?.profile_id) {
    return { ok: false, error: `${name} has already accepted an invitation.` };
  }

  let employeeId = existing?.id ?? null;

  if (!employeeId) {
    // New seat: check the plan limit before creating it.
    const planCtx = await tenantPlanContext();
    if (planCtx) {
      const allowed = await canAddEmployee(planCtx);
      if (!allowed.ok) return { ok: false, error: allowed.error };
    }

    const { data: created, error: createError } = await s.supabase
      .from("employees")
      .insert({
        tenant_id: s.tenantId,
        invite_email: email,
        display_name: name,
        title: input.title?.trim() || null,
        color: input.color || "#5a88a8",
        active: true,
      })
      .select("id")
      .single();
    if (createError || !created) {
      return { ok: false, error: createError?.message ?? "Could not create the teammate." };
    }
    employeeId = created.id;
  } else {
    await s.supabase
      .from("employees")
      .update({
        invite_email: email,
        display_name: name,
        title: input.title?.trim() || null,
        active: true,
      })
      .eq("id", employeeId)
      .eq("tenant_id", s.tenantId);
  }

  // Replace any pending invitation (the partial unique index allows only one).
  await s.supabase
    .from("employee_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("employee_id", employeeId)
    .is("accepted_at", null)
    .is("revoked_at", null);

  const { data: invitation, error: inviteError } = await s.supabase
    .from("employee_invitations")
    .insert({
      tenant_id: s.tenantId,
      employee_id: employeeId,
      email,
      invited_by: s.profile.id,
    })
    .select("token, expires_at")
    .single();
  if (inviteError || !invitation) {
    return { ok: false, error: inviteError?.message ?? "Could not create the invitation." };
  }

  // The business name for the email; the invitee has no context otherwise.
  const { data: tenant } = await s.supabase
    .from("tenants")
    .select("name")
    .eq("id", s.tenantId)
    .maybeSingle();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const acceptUrl = `${appUrl}/invite/${invitation.token}`;

  const sent = await sendTeamInvitation(
    {
      businessName: tenant?.name ?? "Your team",
      inviteeName: name,
      inviteeEmail: email,
      acceptUrl,
      expiresAt: invitation.expires_at,
    },
    s.tenantId,
  );

  revalidatePath("/dashboard/employees");

  if (!sent.ok) {
    // The invitation is valid either way — say so, and give the owner the link
    // rather than reporting a success that never reached anyone.
    return {
      ok: true,
      message: `${name} was added, but the invitation email could not be sent (${sent.error}). Share this link with them directly: ${acceptUrl}`,
    };
  }
  return { ok: true, message: `Invitation sent to ${email}. It expires in 14 days.` };
}

/** Revoke a pending invitation. The token stops working immediately. */
export async function revokeInvitation(employeeId: string): Promise<TeamActionResult> {
  if (!supabaseEnvConfigured()) {
    return { ok: false, error: "Preview mode — connect Supabase first." };
  }
  const s = await ownerScope();
  if (!s) return { ok: false, error: "No business found." };

  const { error } = await s.supabase
    .from("employee_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("employee_id", employeeId)
    .eq("tenant_id", s.tenantId)
    .is("accepted_at", null)
    .is("revoked_at", null);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard/employees");
  return { ok: true, message: "Invitation revoked." };
}

/**
 * Accept an invitation as the signed-in user.
 *
 * All the checks live in accept_employee_invitation (0010): expiry, revocation,
 * single use, and that the signed-in account's email matches the invitation.
 */
export async function acceptInvitation(
  token: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!supabaseEnvConfigured()) {
    return { ok: false, error: "Invitations are unavailable right now." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_employee_invitation", {
    p_token: token,
  });
  if (!error) {
    // Keep app_metadata.role in step with profiles.role. The middleware reads
    // the profile first and only falls back to the JWT claim, but leaving a
    // stale "customer" claim behind would strand this user in /portal on any
    // request where the profile read fails.
    const accepted = data as unknown as { tenant_id?: string } | null;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user && accepted?.tenant_id) {
        const admin = createAdminClient();
        await admin.auth.admin.updateUserById(user.id, {
          app_metadata: { ...(user.app_metadata ?? {}), role: "employee" },
        });
      }
    } catch (err) {
      // Not fatal: the profile is already an employee, which is what RLS and
      // the middleware's primary path both use.
      console.error("acceptInvitation: could not sync app_metadata", err);
    }
  }
  if (error) {
    const code = error.message.toLowerCase();
    if (code.includes("not_signed_in")) {
      return { ok: false, error: "Please sign in with the email the invitation was sent to." };
    }
    if (code.includes("invitation_not_found")) {
      return { ok: false, error: "That invitation link is not valid." };
    }
    if (code.includes("invitation_revoked")) {
      return { ok: false, error: "That invitation was withdrawn. Ask the business to send a new one." };
    }
    if (code.includes("invitation_already_used")) {
      return { ok: false, error: "That invitation has already been used." };
    }
    if (code.includes("invitation_expired")) {
      return { ok: false, error: "That invitation has expired. Ask the business to send a new one." };
    }
    if (code.includes("invitation_email_mismatch")) {
      return {
        ok: false,
        error: "This invitation was sent to a different email address. Sign in with that address instead.",
      };
    }
    if (code.includes("employee_already_linked")) {
      return { ok: false, error: "That teammate record is already linked to another account." };
    }
    console.error("acceptInvitation failed", error);
    return { ok: false, error: "Could not accept the invitation. Please try again." };
  }
  return { ok: true };
}

/**
 * Pending-invitation state for the team screen, so the "Invited" badge is
 * backed by a real invitation rather than just a stored email address.
 */
export async function pendingInvitations(): Promise<
  Record<string, { email: string; expiresAt: string }>
> {
  if (!supabaseEnvConfigured()) return {};
  const s = await ownerScope();
  if (!s) return {};
  const { data } = await s.supabase
    .from("employee_invitations")
    .select("employee_id, email, expires_at")
    .eq("tenant_id", s.tenantId)
    .is("accepted_at", null)
    .is("revoked_at", null);

  const map: Record<string, { email: string; expiresAt: string }> = {};
  for (const row of data ?? []) {
    map[row.employee_id] = { email: row.email, expiresAt: row.expires_at };
  }
  return map;
}

/**
 * Super-admin helper: resolve an invitation token to the business it belongs
 * to, for the acceptance page's heading before the user signs in. Uses the
 * service role because an unauthenticated visitor can read nothing itself.
 */
export async function invitationPreview(
  token: string,
): Promise<{ businessName: string; email: string; expired: boolean } | null> {
  if (!supabaseEnvConfigured()) return null;
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return null;
  }
  const { data } = await admin
    .from("employee_invitations")
    .select("email, expires_at, accepted_at, revoked_at, tenants(name)")
    .eq("token", token)
    .maybeSingle();
  if (!data) return null;

  const tenant = Array.isArray(data.tenants) ? data.tenants[0] : data.tenants;
  return {
    businessName: tenant?.name ?? "this business",
    email: data.email,
    expired:
      Boolean(data.accepted_at) ||
      Boolean(data.revoked_at) ||
      new Date(data.expires_at).getTime() < Date.now(),
  };
}
