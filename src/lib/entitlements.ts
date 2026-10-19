import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import {
  PLANS,
  hasFeature,
  withinEmployeeLimit,
  withinServiceLimit,
  type PlanFeatures,
} from "@/lib/plans";
import type { PlanTier } from "@/types/database";

/**
 * Server-side entitlement enforcement (A19).
 *
 * plans.ts has defined limits and features all along, but withinEmployeeLimit
 * and withinServiceLimit were never called anywhere, and hasFeature was used
 * only to grey out navigation. So a Starter tenant could create unlimited
 * employees and services, and SMS reminders — a paid feature with a real
 * Twilio cost — were queued for every tenant regardless of plan.
 *
 * Hidden UI is cosmetic. These checks run in the server action or job that
 * performs the write.
 */

export interface TenantPlanContext {
  tenantId: string;
  plan: PlanTier;
  subscriptionStatus: string;
}

/** The signed-in owner's tenant and plan, or null when there isn't one. */
export async function tenantPlanContext(): Promise<TenantPlanContext | null> {
  const profile = await getProfile();
  if (!profile?.tenant_id) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("tenants")
    .select("plan, subscription_status")
    .eq("id", profile.tenant_id)
    .maybeSingle();
  if (!data) return null;
  return {
    tenantId: profile.tenant_id,
    plan: data.plan,
    subscriptionStatus: data.subscription_status,
  };
}

export type Entitlement =
  | { ok: true }
  | { ok: false; error: string; upgradeTo?: PlanTier };

/** The cheapest tier that includes a feature, for an accurate upgrade prompt. */
function cheapestTierWith(feature: keyof PlanFeatures): PlanTier | undefined {
  return (["starter", "professional", "elite"] as PlanTier[]).find((t) =>
    hasFeature(t, feature),
  );
}

/** Gate a feature for a tenant's plan. */
export function requireFeature(
  plan: PlanTier,
  feature: keyof PlanFeatures,
  label: string,
): Entitlement {
  if (hasFeature(plan, feature)) return { ok: true };
  const upgradeTo = cheapestTierWith(feature);
  return {
    ok: false,
    error: upgradeTo
      ? `${label} is not included in ${PLANS[plan].name}. Upgrade to ${PLANS[upgradeTo].name} to use it.`
      : `${label} is not available on your plan.`,
    upgradeTo,
  };
}

/**
 * Can this tenant add another team member? Counts ACTIVE employees, since a
 * deactivated one does not consume a seat.
 */
export async function canAddEmployee(ctx: TenantPlanContext): Promise<Entitlement> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", ctx.tenantId)
    .eq("active", true);
  const next = (count ?? 0) + 1;
  if (withinEmployeeLimit(ctx.plan, next)) return { ok: true };
  const limit = PLANS[ctx.plan].maxEmployees;
  return {
    ok: false,
    error: `${PLANS[ctx.plan].name} includes ${limit} team ${limit === 1 ? "member" : "members"}. Upgrade to add more.`,
    upgradeTo: ctx.plan === "starter" ? "professional" : "elite",
  };
}

/** Can this tenant add another service? Counts ACTIVE services. */
export async function canAddService(ctx: TenantPlanContext): Promise<Entitlement> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("services")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", ctx.tenantId)
    .eq("active", true);
  const next = (count ?? 0) + 1;
  if (withinServiceLimit(ctx.plan, next)) return { ok: true };
  const limit = PLANS[ctx.plan].maxServices;
  return {
    ok: false,
    error: `${PLANS[ctx.plan].name} includes ${limit} services. Upgrade to add more.`,
    upgradeTo: ctx.plan === "starter" ? "professional" : "elite",
  };
}

/**
 * Does this tenant's plan include SMS reminders? Used by the booking flow
 * before queueing an SMS reminder, so an unentitled tenant never incurs the
 * Twilio cost. Takes a plan read by the caller (often the service role, where
 * there is no session to derive one from).
 */
export function smsRemindersAllowed(plan: PlanTier): boolean {
  return hasFeature(plan, "sms_reminders");
}
