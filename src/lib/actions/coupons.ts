"use server";

/**
 * Coupon actions (A16).
 *
 * Coupons were entirely local React state: creating one pushed an object with
 * id "local-<timestamp>" into an array, the activate toggle flipped a boolean
 * in the same array, and nothing was ever written to the coupons table — so
 * everything vanished on reload. Separately, create_widget_booking accepted no
 * code and computed no discount, so even a correctly stored coupon had no
 * effect on any price.
 *
 * These actions persist coupons; price_coupon / quote_booking /
 * apply_coupon_to_booking (0010) make them actually reduce what a customer
 * pays.
 */

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { supabaseEnvConfigured } from "@/lib/env";
import { requireFeature, tenantPlanContext } from "@/lib/entitlements";
import type { CouponView } from "@/lib/dashboard/types";

export interface CouponInput {
  code: string;
  type: "pct" | "amount";
  /** Percent (1–100) for "pct", dollars for "amount". */
  value: number;
  maxRedemptions?: number | null;
  expiresAt?: string | null;
  minSubtotalCents?: number;
}

export type CouponResult =
  | { ok: true; coupon: CouponView }
  | { ok: false; error: string };

async function scope() {
  const profile = await requireRole("business_owner");
  if (!profile.tenant_id) return null;
  const supabase = await createClient();
  return { supabase, tenantId: profile.tenant_id };
}

const CODE_RE = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;

export async function createCoupon(input: CouponInput): Promise<CouponResult> {
  if (!supabaseEnvConfigured()) {
    return { ok: false, error: "Preview mode — connect Supabase to save." };
  }
  const s = await scope();
  if (!s) return { ok: false, error: "No business found." };

  // Coupons are a paid feature; enforce it here, not just in the navigation.
  const planCtx = await tenantPlanContext();
  if (planCtx) {
    const allowed = requireFeature(planCtx.plan, "coupons", "Coupons");
    if (!allowed.ok) return { ok: false, error: allowed.error };
  }

  const code = input.code.trim().toUpperCase();
  if (!CODE_RE.test(code)) {
    return {
      ok: false,
      error: "Use 3–32 characters: letters, numbers, dashes or underscores.",
    };
  }
  if (input.type === "pct" && (input.value <= 0 || input.value > 100)) {
    return { ok: false, error: "A percentage discount must be between 1 and 100." };
  }
  if (input.type === "amount" && input.value <= 0) {
    return { ok: false, error: "An amount discount must be greater than zero." };
  }

  const row = {
    tenant_id: s.tenantId,
    code,
    pct_off: input.type === "pct" ? input.value : null,
    amount_off_cents: input.type === "amount" ? Math.round(input.value * 100) : null,
    active: true,
    expires_at: input.expiresAt ?? null,
    max_redemptions: input.maxRedemptions ?? null,
    min_subtotal_cents: Math.max(0, input.minSubtotalCents ?? 0),
  };

  const { data, error } = await s.supabase
    .from("coupons")
    .insert(row)
    .select("id, code, pct_off, amount_off_cents, active, expires_at, max_redemptions, redemptions")
    .single();

  if (error) {
    // unique (tenant_id, code)
    if (error.code === "23505" || /duplicate|unique/i.test(error.message)) {
      return { ok: false, error: `You already have a coupon with the code ${code}.` };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/dashboard/marketing");
  return {
    ok: true,
    coupon: {
      id: data.id,
      code: data.code,
      pctOff: data.pct_off,
      amountOffCents: data.amount_off_cents,
      active: data.active,
      expiresAt: data.expires_at,
      maxRedemptions: data.max_redemptions,
      redemptions: data.redemptions,
    },
  };
}

/** Activate or deactivate a coupon. Deactivated codes stop validating at once. */
export async function setCouponActive(
  id: string,
  active: boolean,
): Promise<{ ok: true; active: boolean } | { ok: false; error: string }> {
  if (!supabaseEnvConfigured()) {
    return { ok: false, error: "Preview mode — connect Supabase to save." };
  }
  const s = await scope();
  if (!s) return { ok: false, error: "No business found." };

  const { error } = await s.supabase
    .from("coupons")
    .update({ active })
    .eq("id", id)
    .eq("tenant_id", s.tenantId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard/marketing");
  return { ok: true, active };
}

/**
 * Delete a coupon that has never been redeemed. A redeemed coupon is kept and
 * deactivated instead, so the bookings that reference it keep their history.
 */
export async function deleteCoupon(
  id: string,
): Promise<{ ok: true; deleted: boolean } | { ok: false; error: string }> {
  if (!supabaseEnvConfigured()) {
    return { ok: false, error: "Preview mode — connect Supabase to save." };
  }
  const s = await scope();
  if (!s) return { ok: false, error: "No business found." };

  const { data: coupon } = await s.supabase
    .from("coupons")
    .select("redemptions")
    .eq("id", id)
    .eq("tenant_id", s.tenantId)
    .maybeSingle();
  if (!coupon) return { ok: false, error: "Coupon not found." };

  if ((coupon.redemptions ?? 0) > 0) {
    const { error } = await s.supabase
      .from("coupons")
      .update({ active: false })
      .eq("id", id)
      .eq("tenant_id", s.tenantId);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/dashboard/marketing");
    return { ok: true, deleted: false };
  }

  const { error } = await s.supabase
    .from("coupons")
    .delete()
    .eq("id", id)
    .eq("tenant_id", s.tenantId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard/marketing");
  return { ok: true, deleted: true };
}
