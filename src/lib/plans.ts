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
  /** USD per month. */
  priceMonthly: number;
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
    priceMonthly: 59,
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
    priceMonthly: 119,
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

/** Stripe Price IDs come from the environment (server-side only). */
export function getStripePriceId(tier: PlanTier): string {
  const map: Record<PlanTier, string | undefined> = {
    starter: process.env.STRIPE_PRICE_STARTER,
    professional: process.env.STRIPE_PRICE_PROFESSIONAL,
    elite: process.env.STRIPE_PRICE_ELITE,
  };
  const id = map[tier];
  if (!id) {
    throw new Error(`Missing Stripe price id env var for plan "${tier}"`);
  }
  return id;
}

/** Reverse lookup: which tier does a Stripe price id belong to? */
export function tierFromStripePriceId(priceId: string): PlanTier | null {
  for (const tier of PLAN_ORDER) {
    try {
      if (getStripePriceId(tier) === priceId) return tier;
    } catch {
      // env var not set for that tier; keep looking
    }
  }
  return null;
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
