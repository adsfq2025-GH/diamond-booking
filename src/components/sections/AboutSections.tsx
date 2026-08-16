import { Container } from "@/components/ui/Container";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { SectionHeading, Em } from "@/components/ui/SectionHeading";
import { Reveal } from "@/components/motion/Reveal";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { CountUp } from "@/components/motion/CountUp";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------ */
/*  Hero — the mission statement                                       */
/* ------------------------------------------------------------------ */

export function AboutHero() {
  return (
    <section className="relative overflow-hidden bg-[radial-gradient(1000px_480px_at_72%_-12%,rgb(46_134_193/0.11),transparent_62%),linear-gradient(178deg,var(--surface-card)_0%,var(--surface)_70%,var(--surface-alt)_100%)] pt-[clamp(136px,16vh,184px)] pb-[clamp(64px,8vw,104px)]">
      <div aria-hidden className="hero-dots pointer-events-none absolute inset-0" />
      <Container className="relative">
        <Reveal>
          <div className="max-w-[820px]">
            <Eyebrow>About Diamond Booking</Eyebrow>
            <h1 className="font-display mb-6 text-[length:var(--text-display-tight)] leading-[1.05] font-bold tracking-[-0.025em]">
              Software as good as{" "}
              <Em>the craft it books.</Em>
            </h1>
            <p className="max-w-[38em] text-[clamp(1.02rem,1.3vw,1.18rem)] leading-[1.75] font-light text-ink-muted">
              Home service businesses run on skill, punctuality, and trust —
              and for decades their software offered none of the three. Our
              mission is simple:{" "}
              <strong className="font-semibold text-ink">
                give home service businesses software as good as their craft.
              </strong>{" "}
              Tools precise enough for a dispatcher, simple enough to use from
              the front seat of a truck.
            </p>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Stats band with CountUp                                            */
/* ------------------------------------------------------------------ */

const stats = [
  { to: 3, unit: "K", suffix: "+", label: "Businesses on the platform" },
  { to: 500, unit: "K", suffix: "+", label: "Appointments every month" },
  { to: 10, unit: "", suffix: "", label: "Home service verticals" },
  { to: 40, unit: "", suffix: "%", label: "Avg. first-year growth" },
];

export function AboutStats() {
  return (
    <section className="border-y border-line bg-card py-[clamp(48px,6vw,72px)]">
      <Container>
        <Stagger className="grid grid-cols-2 gap-x-6 gap-y-10 min-[861px]:grid-cols-4">
          {stats.map((stat) => (
            <StaggerItem key={stat.label} className="min-w-0 text-center">
              <div className="font-instrument text-[clamp(2.1rem,3.4vw,3rem)] leading-[1.05] font-bold tracking-[-0.03em] text-navy-700">
                <CountUp to={stat.to} unit={stat.unit} suffix={stat.suffix} />
              </div>
              <div className="mx-auto mt-2 max-w-[14em] text-[0.82rem] leading-[1.5] text-ink-faint">
                {stat.label}
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </Container>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Founder note — navy band, letter-style card                        */
/* ------------------------------------------------------------------ */

export function AboutStory() {
  return (
    <section
      className={cn(
        "relative text-white",
        "bg-[linear-gradient(168deg,var(--navy-900)_0%,var(--navy-950)_70%)]",
        "py-[clamp(88px,11vw,150px)]",
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_480px_at_85%_10%,rgb(46_134_193/0.2),transparent_60%)]"
      />
      <Container className="relative grid items-center gap-[clamp(40px,5vw,80px)] min-[961px]:grid-cols-[1fr_1.1fr]">
        <Reveal>
          <SectionHeading
            onDark
            eyebrow="Why we exist"
            title={
              <>
                We started where the phones{" "}
                <Em tone="sky">stopped ringing back.</Em>
              </>
            }
            lede="Diamond Booking began as an internal tool for a cleaning company drowning in voicemail — jobs lost to missed calls, crews double-booked, invoices chased for weeks. The software that fixed one office turned out to be the software every trade was waiting for."
          />
        </Reveal>
        <Reveal delay={0.1}>
          <figure className="relative rounded-[20px] border border-white/10 bg-[linear-gradient(160deg,rgb(255_255_255/0.07),rgb(255_255_255/0.02))] p-[clamp(28px,3.5vw,44px)] shadow-float">
            <span
              aria-hidden
              className="font-display absolute -top-5 left-7 text-[4.5rem] leading-none text-gold-500/80"
            >
              &ldquo;
            </span>
            <blockquote className="relative flex flex-col gap-4 text-[0.98rem] leading-[1.8] font-light text-white/80">
              <p>
                Every business we serve is someone&rsquo;s life&rsquo;s work. A
                two-truck plumbing outfit doesn&rsquo;t get a second chance at
                a first impression, and it can&rsquo;t afford software that
                loses a booking.
              </p>
              <p>
                So we hold ourselves to the field&rsquo;s standard, not the
                software industry&rsquo;s: show up on time, do exactly what
                you said, leave things cleaner than you found them. Every
                feature ships when it meets that bar — not before.
              </p>
            </blockquote>
            <figcaption className="mt-7 flex items-center gap-4 border-t border-white/10 pt-6">
              <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-[linear-gradient(140deg,var(--blue-600),var(--navy-600))]">
                <span aria-hidden className="h-3 w-3 rotate-45 bg-white" />
              </span>
              <div>
                <b className="block text-[0.9rem] tracking-[-0.01em] text-white">
                  The Diamond Booking team
                </b>
                <span className="text-[0.76rem] text-white/50">
                  Serving 10 home service verticals since day one
                </span>
              </div>
            </figcaption>
          </figure>
        </Reveal>
      </Container>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Values grid                                                        */
/* ------------------------------------------------------------------ */

const values = [
  {
    title: "Field first",
    copy: "Every screen is designed for the person using it — a dispatcher with three phones ringing, a technician with one thumb free. If it doesn't work from a truck, it doesn't ship.",
  },
  {
    title: "Reliability is a feature",
    copy: "A missed booking is someone's mortgage payment. We treat uptime, data integrity, and the no-double-booking guarantee as product features with names on them.",
  },
  {
    title: "Plain dealing",
    copy: "Transparent pricing, no contracts, exportable data, refunds without a fight. We keep customers the way our customers keep theirs: by earning the next visit.",
  },
  {
    title: "Compound the craft",
    copy: "Our users get better at their trade every year. The platform should too — steadily, without reinventing itself under the people who rely on it.",
  },
];

export function AboutValues() {
  return (
    <section className="bg-[linear-gradient(180deg,var(--surface)_0%,var(--surface-alt)_100%)] py-[clamp(88px,11vw,150px)]">
      <Container>
        <Reveal>
          <div className="mb-[clamp(44px,5vw,64px)] grid items-end gap-4 min-[861px]:grid-cols-[1.2fr_1fr] min-[861px]:gap-10">
            <div>
              <Eyebrow>What we hold to</Eyebrow>
              <h2 className="font-display text-[length:var(--text-h2-lg)] leading-[1.1] font-bold tracking-[-0.03em]">
                Values borrowed from{" "}
                <Em>the trades we serve.</Em>
              </h2>
            </div>
            <p className="font-light text-ink-muted">
              We didn&rsquo;t invent these — cleaners, plumbers, and
              electricians live them every day. We just wrote them down.
            </p>
          </div>
        </Reveal>

        <Stagger className="grid gap-[18px] min-[641px]:grid-cols-2">
          {values.map((v, i) => (
            <StaggerItem key={v.title} className="min-w-0">
              <div
                className={cn(
                  "relative h-full overflow-hidden rounded-[18px] border border-navy-900/8 bg-card p-[30px]",
                  "transition-[transform,box-shadow,border-color] duration-[var(--duration-base)] ease-[var(--ease-out-expo)]",
                  "hover:-translate-y-[5px] hover:border-blue-600/35 hover:shadow-lift",
                )}
              >
                <span
                  aria-hidden
                  className="font-instrument pointer-events-none absolute -top-6 -right-1 text-[7rem] leading-none font-bold tracking-[-0.05em] text-blue-600/5"
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="mb-5 flex h-10 w-10 items-center justify-center rounded-[11px] bg-blue-50">
                  <span aria-hidden className="h-2.5 w-2.5 rotate-45 bg-blue-600" />
                </span>
                <h3 className="font-display relative mb-2 text-[1.15rem] font-bold tracking-[-0.02em]">
                  {v.title}
                </h3>
                <p className="relative text-[0.9rem] leading-[1.65] font-light text-ink-muted">
                  {v.copy}
                </p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </Container>
    </section>
  );
}
