"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  createConnectAccountLink,
  createBillingPortal,
  createSubscriptionCheckout,
  fetchConnectAccountStatus,
  stripeConfigured,
} from "@/lib/integrations/stripe";
import {
  BILLING_CYCLES,
  PLAN_ORDER,
  cycleAvailable,
  type BillingCycle,
} from "@/lib/plans";
import type { PlanTier } from "@/types/database";

/**
 * Start Stripe Checkout for a subscription tier. On success this redirects the
 * browser to Stripe; on any failure it returns a message the UI can surface.
 */
export async function startCheckout(
  tier: PlanTier,
  cycle: BillingCycle = "monthly",
): Promise<{ ok: false; error: string }> {
  if (!stripeConfigured()) {
    return { ok: false, error: "Payments aren't set up yet. Add your Stripe keys to enable checkout." };
  }
  const profile = await requireRole("business_owner");
  if (!profile.tenant_id) return { ok: false, error: "No business found for this account." };

  // This is a public server action, so neither argument can be trusted: a
  // caller could post any string. Reject anything outside the catalog rather
  // than letting it reach Stripe.
  if (!PLAN_ORDER.includes(tier)) {
    return { ok: false, error: "Unknown plan." };
  }
  if (!BILLING_CYCLES.includes(cycle)) {
    return { ok: false, error: "Unknown billing period." };
  }
  if (!cycleAvailable(tier, cycle)) {
    return {
      ok: false,
      error:
        cycle === "yearly"
          ? "Yearly billing isn't available yet. Choose monthly, or contact support."
          : "That plan isn't available for purchase right now.",
    };
  }

  const supabase = await createClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("stripe_customer_id, email")
    .eq("id", profile.tenant_id)
    .maybeSingle();

  const res = await createSubscriptionCheckout({
    tier,
    cycle,
    tenantId: profile.tenant_id,
    customerEmail: tenant?.email ?? profile.email ?? "",
    stripeCustomerId: tenant?.stripe_customer_id,
  });
  if (!res.ok) return res;
  redirect(res.url);
}

/** Open the Stripe billing portal for the current tenant. */
export async function openBillingPortal(): Promise<{ ok: false; error: string }> {
  if (!stripeConfigured()) {
    return { ok: false, error: "Payments aren't set up yet." };
  }
  const profile = await requireRole("business_owner");
  if (!profile.tenant_id) return { ok: false, error: "No business found." };

  const supabase = await createClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("stripe_customer_id")
    .eq("id", profile.tenant_id)
    .maybeSingle();
  if (!tenant?.stripe_customer_id) {
    return { ok: false, error: "No billing account yet — start a subscription first." };
  }
  const res = await createBillingPortal(tenant.stripe_customer_id);
  if (!res.ok) return res;
  redirect(res.url);
}

export async function connectStripeAccount(): Promise<{ ok: false; error: string }> {
  if (!stripeConfigured()) {
    return { ok: false, error: "Stripe isn't configured yet." };
  }
  const profile = await requireRole("business_owner");
  if (!profile.tenant_id) return { ok: false, error: "No business found." };

  const supabase = await createClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("name, email, stripe_connect_account_id")
    .eq("id", profile.tenant_id)
    .maybeSingle();

  const result = await createConnectAccountLink({
    accountId: tenant?.stripe_connect_account_id,
    email: tenant?.email ?? profile.email,
    businessName: tenant?.name ?? "Diamond Booking Business",
  });
  if (!result.ok) return result;

  // Stripe Connect fields are platform-controlled columns (S01): client roles
  // no longer hold UPDATE on them, so this reviewed, owner-verified billing
  // operation writes them with the service role instead.
  const admin = createAdminClient();
  const { error: linkError } = await admin
    .from("tenants")
    .update({ stripe_connect_account_id: result.accountId, stripe_connect_status: "pending" })
    .eq("id", profile.tenant_id);
  if (linkError) {
    console.error("startStripeConnect: could not record the Connect account", linkError);
    return { ok: false, error: "We couldn't save your Stripe connection. Please try again." };
  }

  redirect(result.url);
}

export async function refreshStripeConnectStatus(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!stripeConfigured()) {
    return { ok: false, error: "Stripe isn't configured yet." };
  }
  const profile = await requireRole("business_owner");
  if (!profile.tenant_id) return { ok: false, error: "No business found." };

  const supabase = await createClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("stripe_connect_account_id")
    .eq("id", profile.tenant_id)
    .maybeSingle();
  if (!tenant?.stripe_connect_account_id) {
    return { ok: false, error: "Connect Stripe first." };
  }

  const status = await fetchConnectAccountStatus(tenant.stripe_connect_account_id);
  if (!status) return { ok: false, error: "Stripe isn't configured yet." };

  // Same reason as above: charge and payout readiness are platform fields.
  const admin = createAdminClient();
  const { error } = await admin
    .from("tenants")
    .update({
      stripe_connect_status: status.onboardingComplete ? "connected" : "pending",
      stripe_charges_enabled: status.chargesEnabled,
      stripe_payouts_enabled: status.payoutsEnabled,
    })
    .eq("id", profile.tenant_id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
