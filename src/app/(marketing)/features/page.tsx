import type { Metadata } from "next";
import { FeaturesHero } from "@/components/sections/FeaturesHero";
import { FeatureDeepDives } from "@/components/sections/FeatureDeepDives";
import { ClosingCta } from "@/components/sections/ClosingCta";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Booking engine, dispatch, payments, CRM, team management, analytics, marketing tools, and an embeddable widget — the full Diamond Booking feature tour.",
};

export default function FeaturesPage() {
  return (
    <>
      <FeaturesHero />
      <FeatureDeepDives />
      <ClosingCta />
    </>
  );
}
