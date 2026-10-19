import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe, stripeConfigured } from "@/lib/integrations/stripe";
import { createAdminClient } from "@/lib/supabase/server";
import { planForStripePriceId, type BillingCycle } from "@/lib/plans";
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
    match: { column: "id" | "stripe_customer_id" | "stripe_subscription_id" | "stripe_connect_account_id"; value: string },
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
      const cycle = normalizeCycle(s.metadata?.cycle);
      if (tenantId) {
        await setTenant(
          { column: "id", value: tenantId },
          {
            stripe_customer_id: typeof s.customer === "string" ? s.customer : null,
            stripe_subscription_id: typeof s.subscription === "string" ? s.subscription : null,
            subscription_status: "active" satisfies SubscriptionStatus,
            ...(tier ? { plan: tier } : {}),
            ...(cycle ? { billing_cycle: cycle } : {}),
          },
        );
      }
      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.created": {
      const sub = event.data.object as Stripe.Subscription;
      const tenantId = sub.metadata?.tenant_id;
      const price = sub.items.data[0]?.price;
      const matched = price?.id ? planForStripePriceId(price.id) : null;

      // Prefer the configured price id, which gives tier AND cycle together.
      // Fall back to the price's own interval so a subscription created outside
      // the app (or on a price id we no longer configure) still records the
      // right period instead of silently staying monthly.
      const cycle =
        matched?.cycle ??
        (price?.recurring?.interval === "year"
          ? "yearly"
          : price?.recurring?.interval === "month"
            ? "monthly"
            : null);

      const patch: Record<string, unknown> = {
        subscription_status: mapStatus(sub.status),
        stripe_subscription_id: sub.id,
        ...(matched?.tier ? { plan: matched.tier } : {}),
        ...(cycle ? { billing_cycle: cycle } : {}),
      };
      if (!matched && price?.id) {
        console.warn(
          `[stripe webhook] price ${price.id} matches no configured STRIPE_PRICE_* var; plan left unchanged`,
        );
      }
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

    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      await setTenant(
        { column: "stripe_connect_account_id", value: account.id },
        {
          stripe_connect_status: account.details_submitted ? "connected" : "pending",
          stripe_charges_enabled: Boolean(account.charges_enabled),
          stripe_payouts_enabled: Boolean(account.payouts_enabled),
        },
      );
      break;
    }

    case "payment_intent.succeeded":
    case "payment_intent.payment_failed": {
      const intent = event.data.object as Stripe.PaymentIntent;
      const tenantId = intent.metadata?.tenant_id;
      const bookingId = intent.metadata?.booking_id ?? null;
      const invoiceId = intent.metadata?.invoice_id ?? null;
      if (!tenantId) break;

      const succeeded = event.type === "payment_intent.succeeded";

      // Idempotent on stripe_payment_intent_id — which needs the unique index
      // added in 0007_security.sql. Without it this statement could not run at
      // all, so no payment was ever recorded and Stripe retried forever (A07).
      const { error: payErr } = await admin.from("payments").upsert(
        {
          tenant_id: tenantId,
          booking_id: bookingId,
          invoice_id: invoiceId,
          customer_id: intent.metadata?.customer_id ?? null,
          stripe_payment_intent_id: intent.id,
          amount_cents: intent.amount_received || intent.amount,
          status: succeeded ? "succeeded" : "failed",
          kind: intent.metadata?.kind ?? "payment",
        },
        { onConflict: "stripe_payment_intent_id" },
      );
      if (payErr) throw payErr;   // 500 → Stripe retries, rather than losing it

      if (!succeeded) break;

      // Reconcile what the money was FOR. Recording the ledger row alone left
      // the booking and the invoice looking unpaid.
      if (invoiceId) {
        const { data: invoice } = await admin
          .from("invoices")
          .select("total_cents, paid_cents")
          .eq("id", invoiceId)
          .eq("tenant_id", tenantId)
          .maybeSingle();
        if (invoice) {
          const paid = (invoice.paid_cents ?? 0) + (intent.amount_received || intent.amount);
          await admin
            .from("invoices")
            .update({
              paid_cents: paid,
              status: paid >= (invoice.total_cents ?? 0) ? "paid" : "partially_paid",
            })
            .eq("id", invoiceId)
            .eq("tenant_id", tenantId);
        }
      }

      // A paid deposit is the business's own signal to confirm the job.
      if (bookingId && (intent.metadata?.kind ?? "payment") === "deposit") {
        await admin
          .from("bookings")
          .update({ status: "confirmed" })
          .eq("id", bookingId)
          .eq("tenant_id", tenantId)
          .eq("status", "pending");
      }
      break;
    }

    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const intentId =
        typeof charge.payment_intent === "string" ? charge.payment_intent : null;
      if (!intentId) break;

      // Find the original payment so the refund lands on the right tenant.
      const { data: original } = await admin
        .from("payments")
        .select("tenant_id, booking_id, invoice_id, customer_id")
        .eq("stripe_payment_intent_id", intentId)
        .maybeSingle();
      if (!original) break;

      await admin.from("payments").upsert(
        {
          tenant_id: original.tenant_id,
          booking_id: original.booking_id,
          invoice_id: original.invoice_id,
          customer_id: original.customer_id,
          stripe_payment_intent_id: `${intentId}:refund:${charge.id}`,
          amount_cents: -(charge.amount_refunded ?? 0),
          status: "refunded",
          kind: "refund",
        },
        { onConflict: "stripe_payment_intent_id" },
      );

      if (original.invoice_id) {
        await admin
          .from("invoices")
          .update({ status: charge.refunded ? "refunded" : "partially_paid" })
          .eq("id", original.invoice_id)
          .eq("tenant_id", original.tenant_id);
      }
      break;
    }

    default:
      break;
  }
}

/** Only the two values the column's check constraint allows. */
function normalizeCycle(value: string | undefined): BillingCycle | null {
  return value === "yearly" || value === "monthly" ? value : null;
}

/**
 * Map Stripe subscription status → our SubscriptionStatus enum.
 *
 * Unknown statuses map to past_due (restricted), NOT active. The default used
 * to be "active", so `incomplete` — a subscription whose first payment never
 * completed — and `paused` both read as a paying subscriber, and so would any
 * status Stripe adds later (A33).
 */
function mapStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
    case "incomplete":
    case "paused":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      console.warn("[stripe webhook] unmapped subscription status, restricting:", status);
      return "past_due";
  }
}
