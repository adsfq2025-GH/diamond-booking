import { Hero } from "@/components/sections/Hero";
import { IndustryMarquee } from "@/components/sections/IndustryMarquee";
import { Platform } from "@/components/sections/Platform";
import { CapabilitiesBento } from "@/components/sections/CapabilitiesBento";
import { UseCases } from "@/components/sections/UseCases";
import { Pricing } from "@/components/sections/Pricing";
import { Testimonials } from "@/components/sections/Testimonials";
import { Faq } from "@/components/sections/Faq";
import { ClosingCta } from "@/components/sections/ClosingCta";

export default function LandingPage() {
  return (
    <>
      <Hero />
      <IndustryMarquee />
      <Platform />
      <CapabilitiesBento />
      <UseCases />
      <Pricing />
      <Testimonials />
      <Faq />
      <ClosingCta />
    </>
  );
}
