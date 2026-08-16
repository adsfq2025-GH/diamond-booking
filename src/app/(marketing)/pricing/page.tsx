import type { Metadata } from "next";
import { PricingHero } from "@/components/sections/PricingHero";
import { ComparisonTable } from "@/components/sections/ComparisonTable";
import { TrustStrip } from "@/components/sections/TrustStrip";
import { BillingFaq } from "@/components/sections/BillingFaq";
import { ClosingCta } from "@/components/sections/ClosingCta";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Starter, Professional, and Elite plans with a 7-day free trial. Full feature comparison, yearly billing with two months free, no contracts.",
};

export default function PricingPage() {
  return (
    <>
      <PricingHero />
      <ComparisonTable />
      <TrustStrip />
      <BillingFaq />
      <ClosingCta />
    </>
  );
}
