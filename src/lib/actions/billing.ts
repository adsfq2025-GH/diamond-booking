"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  createConnectAccountLink,
  createBillingPortal,
  createSubscriptionCheckout,
  fetchConnectAccountStatus,
  stripeConfigured,
} from "@/lib/integrations/stripe";
import type { PlanTier } from "@/types/database";

/**
 * Start Stripe Checkout for a subscription tier. On success this redirects the
 * browser to Stripe; on any failure it returns a message the UI can surface.
 */
export async function startCheckout(
  tier: PlanTier,
): Promise<{ ok: false; error: string }> {
  if (!stripeConfigured()) {
    return { ok: false, error: "Payments aren't set up yet. Add your Stripe keys to enable checkout." };
  }
  const profile = await requireRole("business_owner");
  if (!profile.tenant_id) return { ok: false, error: "No business found for this account." };

  const supabase = await createClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("stripe_customer_id, email")
    .eq("id", profile.tenant_id)
    .maybeSingle();

  const res = await createSubscriptionCheckout({
    tier,
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

  await supabase
    .from("tenants")
    .update({ stripe_connect_account_id: result.accountId, stripe_connect_status: "pending" })
    .eq("id", profile.tenant_id);

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

  const { error } = await supabase
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
