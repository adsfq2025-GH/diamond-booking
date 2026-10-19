import "server-only";
import Stripe from "stripe";
import { getStripePriceId, stripePriceEnvName, type BillingCycle } from "@/lib/plans";
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
  /** Monthly or yearly. Defaults to monthly so existing callers are unchanged. */
  cycle?: BillingCycle;
  tenantId: string;
  customerEmail: string;
  stripeCustomerId?: string | null;
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const stripe = getStripe();
  if (!stripe) return { ok: false, error: "Stripe is not configured." };
  const cycle: BillingCycle = opts.cycle ?? "monthly";

  let priceId: string;
  try {
    priceId = getStripePriceId(opts.tier, cycle);
  } catch {
    return {
      ok: false,
      error:
        cycle === "yearly"
          ? `Yearly billing isn't available for the ${opts.tier} plan yet. Choose monthly, or contact support.`
          : `No Stripe price configured for the ${opts.tier} plan.`,
    };
  }

  // Confirm the price really renews on the interval we are selling before
  // sending anyone to pay. A yearly price id pasted into the monthly variable
  // (or the reverse) would otherwise bill a customer on the wrong period, and
  // they would only find out on the receipt.
  try {
    const price = await stripe.prices.retrieve(priceId);
    const expected = cycle === "yearly" ? "year" : "month";
    const actual = price.recurring?.interval;
    if (!actual) {
      return { ok: false, error: "That plan's Stripe price is not a recurring price." };
    }
    if (actual !== expected) {
      console.error(
        `[stripe] ${stripePriceEnvName(opts.tier, cycle)} points at a ${actual}ly price; refusing to sell it as ${cycle}`,
      );
      return {
        ok: false,
        error: "This plan is misconfigured and cannot be purchased right now. Please contact support.",
      };
    }
    if (price.active === false) {
      return { ok: false, error: "That plan is not currently available for purchase." };
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not verify the plan price with Stripe.",
    };
  }

  try {
    const metadata = { tenant_id: opts.tenantId, tier: opts.tier, cycle };
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer: opts.stripeCustomerId ?? undefined,
      customer_email: opts.stripeCustomerId ? undefined : opts.customerEmail,
      client_reference_id: opts.tenantId,
      subscription_data: { metadata },
      metadata,
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

/**
 * Refund a captured payment (A17). The dashboard's Refund button used to flip
 * a value in React state and nothing else, so an owner could believe a
 * customer had been refunded when no money had moved.
 *
 * Returns the refund id; the resulting charge.refunded webhook is what writes
 * the ledger row and updates the invoice, so this stays the single source of
 * truth for refund state.
 */
export async function refundPayment(opts: {
  paymentIntentId: string;
  /** Omit for a full refund. */
  amountCents?: number;
  reason?: "duplicate" | "fraudulent" | "requested_by_customer";
}): Promise<{ ok: true; refundId: string; amountCents: number } | { ok: false; error: string }> {
  const stripe = getStripe();
  if (!stripe) return { ok: false, error: "Stripe is not configured." };
  try {
    const refund = await stripe.refunds.create({
      payment_intent: opts.paymentIntentId,
      ...(opts.amountCents ? { amount: opts.amountCents } : {}),
      reason: opts.reason ?? "requested_by_customer",
    });
    return { ok: true, refundId: refund.id, amountCents: refund.amount };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Stripe error." };
  }
}
