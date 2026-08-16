import type { Metadata } from "next";
import {
  AboutHero,
  AboutStats,
  AboutStory,
  AboutValues,
} from "@/components/sections/AboutSections";
import { ClosingCta } from "@/components/sections/ClosingCta";

export const metadata: Metadata = {
  title: "About",
  description:
    "Our mission: give home service businesses software as good as their craft. The story and values behind Diamond Booking.",
};

export default function AboutPage() {
  return (
    <>
      <AboutHero />
      <AboutStats />
      <AboutStory />
      <AboutValues />
      <ClosingCta />
    </>
  );
}
