import { Marquee } from "@/components/motion/Marquee";

const industries = [
  "Cleaning",
  "HVAC",
  "Plumbing",
  "Roofing",
  "Landscaping",
  "Electrical",
  "Pest Control",
  "Pool Care",
  "Window Washing",
  "Appliance Repair",
];

export function IndustryMarquee() {
  return (
    <section id="industries" className="border-y border-line bg-card py-[34px]">
      <p className="mb-5 text-center text-[0.72rem] font-bold tracking-[0.22em] text-ink-faint uppercase">
        Built for every home service vertical
      </p>
      <Marquee items={industries} label="Industries served" />
    </section>
  );
}
