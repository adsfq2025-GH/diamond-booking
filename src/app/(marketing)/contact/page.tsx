import type { Metadata } from "next";
import { ContactSection } from "@/components/sections/ContactSection";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Talk to the Diamond Booking team — sales questions, migration help, or a 20-minute demo. Median first reply under 4 business hours.",
};

export default function ContactPage() {
  return <ContactSection />;
}
