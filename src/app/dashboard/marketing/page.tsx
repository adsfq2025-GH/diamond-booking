import type { Metadata } from "next";
import { supabaseEnvConfigured } from "@/lib/env";
import { getCoupons, getDashboardContext } from "@/lib/dashboard/data";
import { hasFeature } from "@/lib/plans";
import { MarketingClient } from "@/components/dashboard/sections/MarketingClient";
import { UpgradeGate } from "@/components/dashboard/UpgradeGate";

export const metadata: Metadata = { title: "Marketing" };

export default async function MarketingPage() {
  const [context, coupons] = await Promise.all([getDashboardContext(), getCoupons()]);
  if (!hasFeature(context.plan, "coupons")) {
    return (
      <UpgradeGate
        icon="marketing"
        title="Promotions are a Professional feature"
        body="Run coupon codes, referrals and email campaigns to grow bookings by upgrading your plan."
      />
    );
  }
  return <MarketingClient initial={coupons} preview={!supabaseEnvConfigured()} />;
}
