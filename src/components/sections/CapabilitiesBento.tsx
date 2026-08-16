import { Container } from "@/components/ui/Container";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Em } from "@/components/ui/SectionHeading";
import { Reveal } from "@/components/motion/Reveal";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { cn } from "@/lib/cn";

const icons = {
  calendar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <rect x="3" y="4" width="18" height="17" rx="3" />
      <path d="M3 9h18M8 2v4M16 2v4" />
      <path d="M8.5 14.5l2.5 2.5 4.5-4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  mail: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M4 6l8 6 8-6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="4" y="5" width="16" height="14" rx="2.5" />
    </svg>
  ),
  card: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <rect x="3" y="6" width="18" height="13" rx="2.5" />
      <path d="M3 10.5h18" />
      <path d="M7 15.5h4" strokeLinecap="round" />
    </svg>
  ),
  team: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c.7-3 3-4.5 5.5-4.5s4.8 1.5 5.5 4.5" strokeLinecap="round" />
      <path d="M16 8.5l2 2 3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  chart: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M4 20V10M10 20V4M16 20v-8M21 20H3" strokeLinecap="round" />
    </svg>
  ),
};

function Tile({
  className,
  deep = false,
  ghost,
  icon,
  tag,
  title,
  copy,
}: {
  className?: string;
  deep?: boolean;
  ghost?: string;
  icon: React.ReactNode;
  tag?: string;
  title: string;
  copy: string;
}) {
  return (
    <StaggerItem className={cn("min-w-0", className)}>
      <div
        className={cn(
          "relative flex h-full flex-col justify-end overflow-hidden rounded-[18px] border p-[30px]",
          "transition-[transform,box-shadow,border-color] duration-[var(--duration-base)] ease-[var(--ease-out-expo)]",
          deep
            ? "border-navy-700 bg-[linear-gradient(155deg,var(--navy-700),var(--navy-950))] text-white hover:-translate-y-[5px] hover:border-blue-600/40"
            : "border-navy-900/8 bg-card hover:-translate-y-[5px] hover:border-blue-600/35 hover:shadow-lift",
        )}
      >
        {ghost && (
          <span
            aria-hidden
            className={cn(
              "font-instrument pointer-events-none absolute -top-7 -right-1.5 text-[9rem] leading-none font-bold tracking-[-0.05em]",
              deep ? "text-white/5" : "text-blue-600/5",
            )}
          >
            {ghost}
          </span>
        )}
        <span
          className={cn(
            "mb-auto flex h-10 w-10 items-center justify-center rounded-[11px]",
            deep ? "bg-blue-600/20 text-blue-300" : "bg-blue-50 text-blue-600",
          )}
        >
          {icon}
        </span>
        {tag && (
          <span
            className={cn(
              "relative mt-5 mb-2.5 text-[0.62rem] font-bold tracking-[0.12em] uppercase",
              deep ? "text-gold-500" : "text-blue-600",
            )}
          >
            {tag}
          </span>
        )}
        <h3
          className={cn(
            "font-display relative mb-2 text-[1.15rem] font-bold tracking-[-0.02em]",
            !tag && "mt-5",
            deep ? "text-white" : "text-ink",
          )}
        >
          {title}
        </h3>
        <p
          className={cn(
            "relative text-[0.9rem] leading-[1.6] font-light",
            deep ? "text-white/70" : "text-ink-muted",
          )}
        >
          {copy}
        </p>
      </div>
    </StaggerItem>
  );
}

export function CapabilitiesBento() {
  return (
    <section id="features" className="py-[clamp(88px,11vw,150px)]">
      <Container>
        <Reveal>
          <div className="mb-[clamp(44px,5vw,64px)] grid items-end gap-4 min-[861px]:grid-cols-[1.2fr_1fr] min-[861px]:gap-10">
            <div>
              <Eyebrow>Capabilities</Eyebrow>
              <h2 className="font-display text-[length:var(--text-h2-lg)] leading-[1.1] font-bold tracking-[-0.03em]">
                Precision tools for businesses that{" "}
                <Em>run on appointments.</Em>
              </h2>
            </div>
            <p className="font-light text-ink-muted">
              Everything below ships in every plan tier — engineered for teams
              in the field, not just behind a desk.
            </p>
          </div>
        </Reveal>

        <Stagger className="grid grid-cols-12 gap-[18px] min-[901px]:auto-rows-[minmax(120px,auto)]">
          <Tile
            className="col-span-12 min-[901px]:col-span-7 min-[901px]:row-span-2"
            ghost="24/7"
            icon={icons.calendar}
            tag="Smart scheduling"
            title="Availability that manages itself"
            copy="Buffer times, travel windows, crew capacity, and service areas are computed automatically — customers only ever see slots your team can actually serve. Double-bookings become structurally impossible."
          />
          <Tile
            className="col-span-12 min-[901px]:col-span-5 min-[901px]:row-span-2"
            deep
            ghost="98%"
            icon={icons.mail}
            tag="Automated reminders"
            title="No-shows, engineered away"
            copy="SMS and email sequences confirm, remind, and follow up on every job. Customers reschedule themselves instead of vanishing — our businesses average a 98% show rate."
          />
          <Tile
            className="col-span-12 min-[901px]:col-span-6 min-[1101px]:col-span-4"
            icon={icons.card}
            title="Payments & deposits"
            copy="Take deposits at booking, charge cards on completion, and reconcile automatically. Cash flow that arrives before the truck does."
          />
          <Tile
            className="col-span-12 min-[901px]:col-span-6 min-[1101px]:col-span-4"
            icon={icons.team}
            title="Team dispatch"
            copy="Route jobs by zone, skill, and workload. Every technician gets a clean mobile day-sheet; every change syncs instantly."
          />
          <Tile
            className="col-span-12 min-[1101px]:col-span-4"
            icon={icons.chart}
            title="Revenue analytics"
            copy="Booking sources, repeat rates, revenue per crew. The numbers that grow a service business, without the spreadsheet."
          />
        </Stagger>
      </Container>
    </section>
  );
}
