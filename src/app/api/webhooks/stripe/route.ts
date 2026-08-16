import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe, stripeConfigured } from "@/lib/integrations/stripe";
import { createAdminClient } from "@/lib/supabase/server";
import { tierFromStripePriceId } from "@/lib/plans";
import type { SubscriptionStatus, PlanTier } from "@/types/database";

/**
 * Stripe webhook receiver. Verifies the signature with STRIPE_WEBHOOK_SECRET,
 * then reconciles subscription state onto the tenant row via the service-role
 * admin client (webhooks are unauthenticated, so RLS can't apply).
 *
 * Configure in Stripe: Developers → Webhooks → add endpoint
 *   {APP_URL}/api/webhooks/stripe
 * Local dev: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.
 */
export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !stripeConfigured() || !secret) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid signature";
    return NextResponse.json({ error: `Webhook signature failed: ${msg}` }, { status: 400 });
  }

  try {
    await handleEvent(stripe, event);
  } catch (err) {
    // Log and 500 so Stripe retries; never leak internals to the caller.
    console.error("[stripe webhook] handler error", err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleEvent(stripe: Stripe, event: Stripe.Event) {
  const admin = createAdminClient();

  const setTenant = async (
    match: { column: "id" | "stripe_customer_id" | "stripe_subscription_id"; value: string },
    patch: Record<string, unknown>,
  ) => {
    await admin
      .from("tenants")
      .update(patch as never)
      .eq(match.column, match.value);
  };

  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      const tenantId = s.client_reference_id ?? s.metadata?.tenant_id;
      const tier = (s.metadata?.tier as PlanTier | undefined) ?? undefined;
      if (tenantId) {
        await setTenant(
          { column: "id", value: tenantId },
          {
            stripe_customer_id: typeof s.customer === "string" ? s.customer : null,
            stripe_subscription_id: typeof s.subscription === "string" ? s.subscription : null,
            subscription_status: "active" satisfies SubscriptionStatus,
            ...(tier ? { plan: tier } : {}),
          },
        );
      }
      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.created": {
      const sub = event.data.object as Stripe.Subscription;
      const tenantId = sub.metadata?.tenant_id;
      const priceId = sub.items.data[0]?.price.id;
      const tier = priceId ? tierFromStripePriceId(priceId) : null;
      const patch: Record<string, unknown> = {
        subscription_status: mapStatus(sub.status),
        stripe_subscription_id: sub.id,
        ...(tier ? { plan: tier } : {}),
      };
      if (tenantId) await setTenant({ column: "id", value: tenantId }, patch);
      else await setTenant({ column: "stripe_subscription_id", value: sub.id }, patch);
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await setTenant(
        { column: "stripe_subscription_id", value: sub.id },
        { subscription_status: "canceled" satisfies SubscriptionStatus },
      );
      break;
    }

    case "invoice.payment_failed": {
      const inv = event.data.object as Stripe.Invoice;
      const customer = typeof inv.customer === "string" ? inv.customer : null;
      if (customer) {
        await setTenant(
          { column: "stripe_customer_id", value: customer },
          { subscription_status: "past_due" satisfies SubscriptionStatus },
        );
      }
      break;
    }

    // Deposit PaymentIntents (widget) could be reconciled here into the
    // payments table once the deposit flow is live.
    default:
      break;
  }
}

/** Map Stripe subscription status → our SubscriptionStatus enum. */
function mapStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      return "active";
  }
}
