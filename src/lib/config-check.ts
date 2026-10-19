import "server-only";
import { PLANS, PLAN_ORDER, formatPlanPrice } from "@/lib/plans";

/**
 * Configuration self-check (A06).
 *
 * The audit found that none of the three Stripe price variables the code reads
 * were present: .env.local defined STRIPE_PRICE_STARTER_MONTHLY,
 * STRIPE_PRICE_PRO_MONTHLY and STRIPE_PRICE_ENTERPRISE_MONTHLY, while
 * plans.ts reads STRIPE_PRICE_STARTER / _PROFESSIONAL / _ELITE. Every upgrade
 * threw, and tierFromStripePriceId swallowed the error and returned null, so
 * the webhook could not map a price back to a tier either. Nothing anywhere
 * said so.
 *
 * This reports the gaps instead. Call it from an admin surface, or run it at
 * boot — never let a feature fail silently because a variable is misspelt.
 */

export interface ConfigProblem {
  /** "blocker" = the feature cannot work at all. */
  severity: "blocker" | "warning";
  area: string;
  message: string;
}

function present(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

export function configProblems(): ConfigProblem[] {
  const problems: ConfigProblem[] = [];

  // ---- core ----
  for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) {
    if (!present(name)) {
      problems.push({ severity: "blocker", area: "Supabase", message: `${name} is not set.` });
    }
  }
  if (!present("SUPABASE_SERVICE_ROLE_KEY")) {
    problems.push({
      severity: "blocker",
      area: "Supabase",
      message:
        "SUPABASE_SERVICE_ROLE_KEY is not set: signup, webhooks, reminders and email settings all need it.",
    });
  }
  if (!present("NEXT_PUBLIC_APP_URL")) {
    problems.push({
      severity: "warning",
      area: "App",
      message: "NEXT_PUBLIC_APP_URL is not set: embed snippets and OAuth redirects will point at localhost.",
    });
  }

  // ---- scheduled jobs ----
  if (!present("CRON_SECRET")) {
    problems.push({
      severity: "blocker",
      area: "Cron",
      message:
        "CRON_SECRET is not set: both cron routes return 401, so reminders are never sent and recurring series are never extended.",
    });
  }

  // ---- subscriptions ----
  const stripeKey = present("STRIPE_SECRET_KEY");
  if (stripeKey) {
    const missingPrices = PLAN_ORDER.map(
      (tier) => `STRIPE_PRICE_${tier.toUpperCase()}`,
    ).filter((name) => !present(name));
    if (missingPrices.length > 0) {
      problems.push({
        severity: "blocker",
        area: "Stripe subscriptions",
        message: `Missing price ids: ${missingPrices.join(", ")}. These exact names are what the plan catalog reads — a _MONTHLY, _PRO or _ENTERPRISE variant will not be found and every upgrade will fail.`,
      });
    }
    if (!present("STRIPE_WEBHOOK_SECRET")) {
      problems.push({
        severity: "blocker",
        area: "Stripe webhooks",
        message:
          "STRIPE_WEBHOOK_SECRET is not set: the webhook returns 503, so no subscription or payment state is ever reconciled.",
      });
    }
    if (!present("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY")) {
      problems.push({
        severity: "warning",
        area: "Stripe",
        message:
          "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set. Note the NEXT_PUBLIC_ prefix: without it Next.js will not expose the key to the browser and Stripe.js cannot load.",
      });
    }
  } else {
    problems.push({
      severity: "warning",
      area: "Stripe",
      message: "STRIPE_SECRET_KEY is not set: subscriptions, deposits and refunds are all unavailable.",
    });
  }

  // ---- delivery ----
  const platformEmail =
    (present("RESEND_API_KEY") && present("RESEND_FROM_EMAIL")) ||
    (present("SMTP_HOST") && present("SMTP_USER") && present("SMTP_PASS"));
  if (!platformEmail) {
    problems.push({
      severity: "warning",
      area: "Email",
      message:
        "No platform-wide sender (Resend or SMTP). Tenants without their own SMTP will send no confirmations or reminders at all.",
    });
  }
  if (!present("TWILIO_ACCOUNT_SID") || !present("TWILIO_AUTH_TOKEN") || !present("TWILIO_FROM_NUMBER")) {
    problems.push({
      severity: "warning",
      area: "SMS",
      message: "Twilio is not fully configured: SMS reminders will be skipped even on plans that include them.",
    });
  }

  // ---- security ----
  if (present("SUPER_ADMIN_SETUP_TOKEN")) {
    problems.push({
      severity: "warning",
      area: "Security",
      message:
        "SUPER_ADMIN_SETUP_TOKEN is still set, so /api/admin/setup is live. Remove it once the super admin exists.",
    });
  }
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PLACEHOLDER_MODE === "true") {
    problems.push({
      severity: "blocker",
      area: "Security",
      message:
        "ALLOW_PLACEHOLDER_MODE is true in production: route protection is disabled and bookings are faked. Remove it.",
    });
  }

  return problems;
}

/** True when nothing is outright broken. */
export function configIsLaunchable(): boolean {
  return configProblems().every((p) => p.severity !== "blocker");
}

/**
 * Compare what the app DISPLAYS against what Stripe will actually CHARGE.
 *
 * This is the check that would have caught the launch-blocking version of this
 * bug: the catalog said Professional was $59 and Elite $119, while the Stripe
 * Prices those tiers pointed at were $69.99 and $129.00. A customer would have
 * been shown one price and billed another, and nothing in the product would
 * ever have mentioned it.
 *
 * Network call, so it is deliberately NOT part of configProblems(): the admin
 * health tab awaits it separately and the page still renders if Stripe is
 * unreachable. Unreachable is a warning, a mismatch is a blocker.
 */
export async function stripePriceProblems(): Promise<ConfigProblem[]> {
  const problems: ConfigProblem[] = [];
  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret) return problems; // already reported by configProblems()

  for (const tier of PLAN_ORDER) {
    const envName = `STRIPE_PRICE_${tier.toUpperCase()}`;
    const priceId = process.env[envName]?.trim();
    if (!priceId) continue; // already reported as a blocker

    try {
      const res = await fetch(`https://api.stripe.com/v1/prices/${encodeURIComponent(priceId)}`, {
        headers: { Authorization: `Bearer ${secret}` },
        // The dashboard should not hammer Stripe on every render.
        next: { revalidate: 300 },
      });
      if (!res.ok) {
        problems.push({
          severity: res.status === 404 ? "blocker" : "warning",
          area: "Stripe prices",
          message:
            res.status === 404
              ? `${envName} points at ${priceId}, which does not exist in this Stripe account. Checkout for ${PLANS[tier].name} will fail.`
              : `Could not read the ${PLANS[tier].name} price from Stripe (HTTP ${res.status}); displayed and charged amounts are unverified.`,
        });
        continue;
      }

      const price = (await res.json()) as {
        unit_amount: number | null;
        currency?: string;
        active?: boolean;
        recurring?: { interval?: string } | null;
      };
      const charged = (price.unit_amount ?? 0) / 100;
      const shown = PLANS[tier].priceMonthly;

      if (Math.abs(charged - shown) > 0.005) {
        problems.push({
          severity: "blocker",
          area: "Stripe prices",
          message: `${PLANS[tier].name}: the app shows ${formatPlanPrice(shown)}/month but Stripe charges $${charged.toFixed(2)}. A customer would be billed an amount they were never shown. Fix lib/plans.ts or the Stripe Price so they agree.`,
        });
      }
      if (price.active === false) {
        problems.push({
          severity: "blocker",
          area: "Stripe prices",
          message: `${PLANS[tier].name}: the Stripe Price ${priceId} is archived, so checkout will fail.`,
        });
      }
      if (price.recurring?.interval && price.recurring.interval !== "month") {
        problems.push({
          severity: "blocker",
          area: "Stripe prices",
          message: `${PLANS[tier].name}: ${envName} points at a ${price.recurring.interval}ly price, but it is used as the monthly plan.`,
        });
      }
      if (price.currency && price.currency !== "usd") {
        problems.push({
          severity: "warning",
          area: "Stripe prices",
          message: `${PLANS[tier].name}: the Stripe Price is in ${price.currency.toUpperCase()} while the app renders US dollars.`,
        });
      }
    } catch {
      problems.push({
        severity: "warning",
        area: "Stripe prices",
        message: `Could not reach Stripe to verify the ${PLANS[tier].name} price; displayed and charged amounts are unverified.`,
      });
    }
  }

  return problems;
}
