import "server-only";
import Stripe from "stripe";
import { getStripePriceId } from "@/lib/plans";
import type { PlanTier } from "@/types/database";
import type { StripeConnectStatus } from "@/lib/integrations/types";

/**
 * Stripe integration. Everything is behind STRIPE_SECRET_KEY: when it's unset
 * the app runs fully without payments (graceful degradation) and these helpers
 * report "not configured" rather than throwing. Server-side only.
 */

let cached: Stripe | null = null;

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/** Lazily construct the Stripe client, or null when no key is set. */
export function getStripe(): Stripe | null {
  if (!stripeConfigured()) return null;
  if (!cached) {
    cached = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
      // Pin nothing — use the account's default API version. Typed loosely
      // so an SDK bump doesn't break the build.
      appInfo: { name: "Diamond Booking" },
    });
  }
  return cached;
}

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export function stripeConnectConfigured(): boolean {
  return stripeConfigured();
}

export async function createConnectAccountLink(opts: {
  accountId?: string | null;
  email: string;
  businessName: string;
}): Promise<{ ok: true; url: string; accountId: string } | { ok: false; error: string }> {
  const stripe = getStripe();
  if (!stripe) return { ok: false, error: "Stripe is not configured." };
  try {
    const account = opts.accountId
      ? await stripe.accounts.retrieve(opts.accountId)
      : await stripe.accounts.create({
          type: "express",
          email: opts.email,
          business_type: "company",
          business_profile: { name: opts.businessName },
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
          metadata: { product: "diamond-booking" },
        });

    const link = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${appUrl()}/dashboard/settings#integrations`,
      return_url: `${appUrl()}/dashboard/settings#integrations`,
      type: "account_onboarding",
    });
    return { ok: true, url: link.url, accountId: account.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Stripe error." };
  }
}

export async function fetchConnectAccountStatus(accountId: string): Promise<StripeConnectStatus | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const account = await stripe.accounts.retrieve(accountId);
  return {
    configured: true,
    connected: true,
    accountId: account.id,
    chargesEnabled: Boolean(account.charges_enabled),
    payoutsEnabled: Boolean(account.payouts_enabled),
    onboardingComplete: Boolean(account.details_submitted),
  };
}

/**
 * Create a Checkout Session for a subscription tier. Reuses/attaches the
 * tenant's Stripe customer. Returns the redirect URL, or an error.
 */
export async function createSubscriptionCheckout(opts: {
  tier: PlanTier;
  tenantId: string;
  customerEmail: string;
  stripeCustomerId?: string | null;
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const stripe = getStripe();
  if (!stripe) return { ok: false, error: "Stripe is not configured." };

  let priceId: string;
  try {
    priceId = getStripePriceId(opts.tier);
  } catch {
    return { ok: false, error: `No Stripe price configured for the ${opts.tier} plan.` };
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer: opts.stripeCustomerId ?? undefined,
      customer_email: opts.stripeCustomerId ? undefined : opts.customerEmail,
      client_reference_id: opts.tenantId,
      subscription_data: { metadata: { tenant_id: opts.tenantId, tier: opts.tier } },
      metadata: { tenant_id: opts.tenantId, tier: opts.tier },
      success_url: `${appUrl()}/dashboard?billing=success`,
      cancel_url: `${appUrl()}/dashboard/settings#billing`,
      allow_promotion_codes: true,
    });
    if (!session.url) return { ok: false, error: "Stripe did not return a checkout URL." };
    return { ok: true, url: session.url };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Stripe error." };
  }
}

/** Open the Stripe customer billing portal for self-service management. */
export async function createBillingPortal(
  stripeCustomerId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const stripe = getStripe();
  if (!stripe) return { ok: false, error: "Stripe is not configured." };
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${appUrl()}/dashboard/settings#billing`,
    });
    return { ok: true, url: session.url };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Stripe error." };
  }
}

/**
 * Create a PaymentIntent for a booking deposit (used by the widget once
 * payments are enabled). Amount is in integer cents.
 */
export async function createDepositIntent(opts: {
  amountCents: number;
  tenantId: string;
  bookingId: string;
  customerEmail: string;
}): Promise<{ ok: true; clientSecret: string } | { ok: false; error: string }> {
  const stripe = getStripe();
  if (!stripe) return { ok: false, error: "Stripe is not configured." };
  try {
    const intent = await stripe.paymentIntents.create({
      amount: opts.amountCents,
      currency: "usd",
      receipt_email: opts.customerEmail,
      metadata: { tenant_id: opts.tenantId, booking_id: opts.bookingId, kind: "deposit" },
      automatic_payment_methods: { enabled: true },
    });
    if (!intent.client_secret) return { ok: false, error: "No client secret returned." };
    return { ok: true, clientSecret: intent.client_secret };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Stripe error." };
  }
}
