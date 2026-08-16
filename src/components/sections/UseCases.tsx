import { Container } from "@/components/ui/Container";
import { SectionHeading, Em } from "@/components/ui/SectionHeading";
import { Reveal } from "@/components/motion/Reveal";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { cn } from "@/lib/cn";

const cases = [
  {
    lead: true,
    ind: "Cleaning & recurring services",
    title: "Recurring revenue on rails",
    copy: "Weekly and bi-weekly plans rebook themselves, preferred cleaners stay assigned to their households, and skipped visits reschedule automatically. Your calendar compounds instead of resetting every Monday.",
    num: "3.2×",
    lbl: "more repeat bookings after switching to recurring plans",
  },
  {
    lead: false,
    ind: "HVAC & electrical",
    title: "Seasonal surge, absorbed",
    copy: "Priority slots for maintenance-contract members, overflow waitlists for heat waves, and dispatch that keeps the right certification on the right job.",
    num: "92%",
    lbl: "average technician utilization in peak season",
  },
  {
    lead: false,
    ind: "Plumbing & roofing",
    title: "Emergencies, without chaos",
    copy: "Urgent jobs slot into live routes with automatic customer ETAs, while estimates and inspections book themselves weeks out.",
    num: "-41%",
    lbl: "time from first call to crew on site",
  },
];

export function UseCases() {
  return (
    <section
      className={cn(
        "relative -mt-2 text-white",
        "bg-[linear-gradient(168deg,var(--navy-900)_0%,var(--navy-950)_70%)]",
        "[clip-path:polygon(0_clamp(28px,4.5vw,64px),100%_0,100%_100%,0_100%)]",
        "pt-[clamp(110px,13vw,180px)] pb-[clamp(96px,12vw,160px)]",
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_480px_at_88%_8%,rgb(46_134_193/0.22),transparent_60%),radial-gradient(600px_400px_at_4%_92%,rgb(46_134_193/0.13),transparent_60%)]"
      />
      <Container className="relative">
        <Reveal>
          <SectionHeading
            onDark
            eyebrow="In the field"
            title={
              <>
                Built around how service companies{" "}
                <Em tone="sky">actually operate.</Em>
              </>
            }
            lede="Different trades, same physics: trucks, crews, time windows, and customers who expect certainty. Diamond models all of it."
            className="mb-[clamp(48px,6vw,72px)] max-w-[600px]"
          />
        </Reveal>
        <Stagger className="grid gap-[18px] min-[961px]:grid-cols-[1.2fr_1fr_1fr]">
          {cases.map((c) => (
            <StaggerItem key={c.title} className="min-w-0">
              <article
                className={cn(
                  "flex h-full flex-col rounded-[18px] border border-white/10 px-[30px] py-[34px]",
                  "bg-[linear-gradient(160deg,rgb(255_255_255/0.05),rgb(255_255_255/0.015))]",
                  "transition-[transform,border-color,background] duration-[var(--duration-base)] ease-[var(--ease-out-expo)]",
                  "hover:-translate-y-[5px] hover:border-blue-300/40 hover:bg-[linear-gradient(160deg,rgb(46_134_193/0.13),rgb(255_255_255/0.02))]",
                )}
              >
                <div className="mb-4 text-[0.64rem] font-bold tracking-[0.18em] text-blue-300 uppercase">
                  {c.ind}
                </div>
                <h3 className="font-display mb-2.5 text-[1.2rem] leading-[1.3] font-bold tracking-[-0.02em] text-white">
                  {c.title}
                </h3>
                <p className="text-[0.9rem] leading-[1.65] font-light text-white/65">
                  {c.copy}
                </p>
                <div className="mt-auto flex items-baseline gap-2 pt-[26px]">
                  <span
                    className={cn(
                      "font-instrument text-[2rem] font-bold tracking-[-0.03em]",
                      c.lead ? "text-gold-500" : "text-white",
                    )}
                  >
                    {c.num}
                  </span>
                  <span className="text-[0.72rem] text-white/55">{c.lbl}</span>
                </div>
              </article>
            </StaggerItem>
          ))}
        </Stagger>
      </Container>
    </section>
  );
}
