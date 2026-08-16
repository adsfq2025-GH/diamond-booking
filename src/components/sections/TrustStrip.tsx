import { Container } from "@/components/ui/Container";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";

const points = [
  { stat: "3,000+", label: "businesses run on Diamond" },
  { stat: "500K+", label: "appointments booked monthly" },
  { stat: "99.9%", label: "uptime over the last 12 months" },
  { stat: "0", label: "contracts, setup fees, or lock-ins" },
];

/** Quiet reassurance band between the comparison table and the FAQ. */
export function TrustStrip() {
  return (
    <section className="border-y border-line bg-card py-[clamp(40px,5vw,56px)]">
      <Container>
        <Stagger className="grid grid-cols-2 gap-x-6 gap-y-8 min-[861px]:grid-cols-4">
          {points.map((p) => (
            <StaggerItem key={p.label} className="min-w-0 text-center">
              <div className="font-instrument text-[clamp(1.6rem,2.4vw,2.1rem)] leading-[1.05] font-bold tracking-[-0.03em] text-navy-700">
                {p.stat}
              </div>
              <div className="mx-auto mt-1.5 max-w-[16em] text-[0.8rem] leading-[1.5] text-ink-faint">
                {p.label}
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </Container>
    </section>
  );
}
