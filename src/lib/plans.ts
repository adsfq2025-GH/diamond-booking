import type { PlanTier } from "@/types/database";

/**
 * Plan tier definitions. Must stay in sync with:
 *  - the pricing section on the marketing site
 *  - the plan_limits rows seeded in supabase/seed.sql
 *  - the Stripe Prices referenced by the STRIPE_PRICE_* env vars
 */

export interface PlanFeatures {
  widget: boolean;
  email_notifications: boolean;
  sms_reminders: boolean;
  invoicing: boolean;
  coupons: boolean;
  custom_branding: boolean;
  payroll_reports: boolean;
  api_access: boolean;
  priority_support: boolean;
}

export interface PlanDefinition {
  tier: PlanTier;
  name: string;
  /**
   * USD per month, and it MUST equal the amount on the Stripe Price that
   * STRIPE_PRICE_<TIER> points at. Showing one number and charging another is
   * how a $59 page ended up billing $69.99 — configCheck() now compares the
   * two at runtime and reports a blocker if they drift again.
   */
  priceMonthly: number;
  /**
   * USD per year, and it MUST equal the amount on the Stripe Price that
   * STRIPE_PRICE_<TIER>_YEARLY points at — configCheck compares them, the
   * same as the monthly pair.
   *
   * The pricing page used to compute this as priceMonthly * 10 and claim
   * "2 months free", which matched none of the real yearly prices.
   */
  priceYearly: number;
  description: string;
  /** null = unlimited */
  maxEmployees: number | null;
  /** null = unlimited */
  maxServices: number | null;
  features: PlanFeatures;
  /** Marketing bullet points, in display order. */
  highlights: string[];
}

export const PLANS: Record<PlanTier, PlanDefinition> = {
  starter: {
    tier: "starter",
    name: "Starter",
    priceMonthly: 29,
    priceYearly: 299,
    description: "Everything a solo operator needs to take bookings online.",
    maxEmployees: 3,
    maxServices: 10,
    features: {
      widget: true,
      email_notifications: true,
      sms_reminders: false,
      invoicing: false,
      coupons: false,
      custom_branding: false,
      payroll_reports: false,
      api_access: false,
      priority_support: false,
    },
    highlights: [
      "Embeddable booking widget",
      "Up to 3 team members",
      "Up to 10 services",
      "Email confirmations & reminders",
      "No-double-booking guarantee",
    ],
  },
  professional: {
    tier: "professional",
    name: "Professional",
    priceMonthly: 69.99,
    priceYearly: 600,
    description: "For growing teams that need payments, invoices and branding.",
    maxEmployees: 10,
    maxServices: null,
    features: {
      widget: true,
      email_notifications: true,
      sms_reminders: true,
      invoicing: true,
      coupons: true,
      custom_branding: true,
      payroll_reports: false,
      api_access: false,
      priority_support: false,
    },
    highlights: [
      "Everything in Starter",
      "Up to 10 team members",
      "Unlimited services",
      "SMS reminders",
      "Invoicing & deposits",
      "Coupons & promotions",
      "Custom branding",
    ],
  },
  elite: {
    tier: "elite",
    name: "Elite",
    // Matches the Stripe Price that STRIPE_PRICE_ELITE points at. Change both
    // together, or stripePriceProblems() will report a blocker.
    priceMonthly: 129,
    priceYearly: 1200,
    description: "Full platform power for established operations.",
    maxEmployees: null,
    maxServices: null,
    features: {
      widget: true,
      email_notifications: true,
      sms_reminders: true,
      invoicing: true,
      coupons: true,
      custom_branding: true,
      payroll_reports: true,
      api_access: true,
      priority_support: true,
    },
    highlights: [
      "Everything in Professional",
      "Unlimited team members",
      "Payroll & commission reports",
      "API access",
      "Priority support",
    ],
  },
};

export const PLAN_ORDER: PlanTier[] = ["starter", "professional", "elite"];

/** How often a subscription renews. */
export type BillingCycle = "monthly" | "yearly";

export const BILLING_CYCLES: BillingCycle[] = ["monthly", "yearly"];

/**
 * The env var holding a tier's Stripe Price id, per cycle. Monthly keeps the
 * unsuffixed name it already had, so no existing configuration breaks.
 */
export function stripePriceEnvName(tier: PlanTier, cycle: BillingCycle): string {
  const base = `STRIPE_PRICE_${tier.toUpperCase()}`;
  return cycle === "yearly" ? `${base}_YEARLY` : base;
}

/** Stripe Price IDs come from the environment (server-side only). */
export function getStripePriceId(tier: PlanTier, cycle: BillingCycle = "monthly"): string {
  const name = stripePriceEnvName(tier, cycle);
  const id = process.env[name]?.trim();
  if (!id) {
    throw new Error(`Missing Stripe price id: set ${name} for the ${tier} plan (${cycle})`);
  }
  return id;
}

/** Is a cycle actually purchasable, i.e. is its price id configured? */
export function cycleAvailable(tier: PlanTier, cycle: BillingCycle): boolean {
  return Boolean(process.env[stripePriceEnvName(tier, cycle)]?.trim());
}

/** Yearly is offered only when every tier has a yearly price configured. */
export function yearlyBillingAvailable(): boolean {
  return PLAN_ORDER.every((tier) => cycleAvailable(tier, "yearly"));
}

/**
 * Reverse lookup for the webhook: which tier AND cycle does a Stripe price id
 * belong to? Returning the cycle matters — without it a yearly subscription
 * could not be told apart from a monthly one, and the tenant's recorded cycle
 * would silently stay "monthly".
 */
export function planForStripePriceId(
  priceId: string,
): { tier: PlanTier; cycle: BillingCycle } | null {
  for (const tier of PLAN_ORDER) {
    for (const cycle of BILLING_CYCLES) {
      const configured = process.env[stripePriceEnvName(tier, cycle)]?.trim();
      if (configured && configured === priceId) return { tier, cycle };
    }
  }
  return null;
}

/** Reverse lookup by tier alone. Kept for callers that do not care about cycle. */
export function tierFromStripePriceId(priceId: string): PlanTier | null {
  return planForStripePriceId(priceId)?.tier ?? null;
}

/** The headline amount for a tier on a given cycle. */
export function planPrice(tier: PlanTier, cycle: BillingCycle): number {
  return cycle === "yearly" ? PLANS[tier].priceYearly : PLANS[tier].priceMonthly;
}

/** Feature gate helper: `hasFeature(tenant.plan, "invoicing")`. */
export function hasFeature(tier: PlanTier, feature: keyof PlanFeatures): boolean {
  return PLANS[tier].features[feature];
}

/** Employee-count gate. `null` limit means unlimited. */
export function withinEmployeeLimit(tier: PlanTier, employeeCount: number): boolean {
  const limit = PLANS[tier].maxEmployees;
  return limit === null || employeeCount <= limit;
}

/** Service-count gate. `null` limit means unlimited. */
export function withinServiceLimit(tier: PlanTier, serviceCount: number): boolean {
  const limit = PLANS[tier].maxServices;
  return limit === null || serviceCount <= limit;
}

/** "$29" / "$69.99" — whole dollars stay whole, cents are shown when present. */
export function formatPlanPrice(dollars: number): string {
  return Number.isInteger(dollars)
    ? `$${dollars.toLocaleString("en-US")}`
    : `$${dollars.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** What a tenant saves by paying yearly, as a fraction (0.29 = 29%). */
export function yearlySaving(tier: PlanTier): number {
  const plan = PLANS[tier];
  const twelveMonths = plan.priceMonthly * 12;
  if (twelveMonths <= 0) return 0;
  return Math.max(0, (twelveMonths - plan.priceYearly) / twelveMonths);
}
