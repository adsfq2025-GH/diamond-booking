import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { CountUp } from "@/components/motion/CountUp";
import { cn } from "@/lib/cn";

const panel =
  "rounded-2xl border border-navy-900/8 bg-card shadow-float";

const stats = [
  { to: 3, unit: "K", suffix: "+", label: "Active businesses" },
  { to: 500, unit: "K", suffix: "+", label: "Appointments / month" },
  { to: 40, unit: "", suffix: "%", label: "Avg. growth in year one" },
];

export function Hero() {
  return (
    <section
      className={cn(
        "relative overflow-hidden",
        "pt-[clamp(140px,16vh,190px)] pb-[clamp(72px,9vw,120px)]",
        "bg-[radial-gradient(1100px_520px_at_82%_-10%,rgb(46_134_193/0.12),transparent_62%),radial-gradient(700px_480px_at_-8%_38%,rgb(46_134_193/0.07),transparent_60%),linear-gradient(178deg,var(--surface-card)_0%,var(--surface)_58%,var(--surface-alt)_100%)]",
      )}
    >
      {/* faint dot grid */}
      <div aria-hidden className="hero-dots pointer-events-none absolute inset-0" />

      <Container className="relative grid items-center gap-[clamp(40px,5vw,72px)] lg:grid-cols-[1.2fr_1fr]">
        <div className="min-w-0">
          <Eyebrow>Booking infrastructure for home services</Eyebrow>
          <h1 className="font-display mb-[26px] text-[length:var(--text-display-tight)] leading-[1.04] font-bold tracking-[-0.025em]">
            Every open slot,
            <br />
            <span className="gold-draw">
              booked and paid
              <svg viewBox="0 0 300 24" preserveAspectRatio="none" aria-hidden="true">
                <path pathLength={1} d="M4 17 C 60 8, 150 6, 296 12" />
              </svg>
            </span>{" "}
            —
            <br />
            while you&rsquo;re{" "}
            <span className="em-blue em-italic whitespace-nowrap">
              on the job.
            </span>
          </h1>
          <p className="mb-[38px] max-w-[34em] text-[clamp(1.05rem,1.4vw,1.22rem)] leading-[1.7] font-light text-ink-muted">
            Diamond Booking is the scheduling platform behind{" "}
            <strong className="font-semibold text-ink">
              3,000+ growing service companies
            </strong>{" "}
            — cleaning, HVAC, plumbing, roofing, landscaping. Online booking,
            dispatch, reminders, and payments in one precise system.
          </p>
          <div className="mb-[18px] flex flex-wrap items-center gap-4">
            <Button href="/signup" variant="gold" arrow>
              Start your 7-day free trial
            </Button>
            <Button href="/#product" variant="ghost">
              See the product
            </Button>
          </div>
          <p className="text-[length:var(--text-small)] text-ink-faint">
            No credit card required · Set up in under{" "}
            <b className="font-semibold text-ink-muted">10 minutes</b>
          </p>

          <Stagger className="mt-[clamp(44px,5vw,64px)] flex flex-wrap gap-[clamp(28px,4vw,56px)] border-t border-line pt-8">
            {stats.map((stat) => (
              <StaggerItem key={stat.label}>
                <div className="font-instrument text-[clamp(1.9rem,2.8vw,2.6rem)] leading-[1.05] font-bold tracking-[-0.03em] text-navy-700">
                  <CountUp to={stat.to} unit={stat.unit} suffix={stat.suffix} />
                </div>
                <div className="mt-1.5 text-[0.8125rem] tracking-[0.01em] text-ink-faint">
                  {stat.label}
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>

        {/* ---- layered product-UI composition ---- */}
        <div
          aria-hidden
          className="relative min-w-0 max-lg:mt-3 max-lg:grid max-lg:gap-5 lg:min-h-[560px]"
        >
          {/* calendar panel */}
          <div
            className={cn(
              panel,
              "w-full lg:absolute lg:top-2 lg:left-0 lg:z-[2] lg:w-[min(430px,100%)] lg:-rotate-[1.2deg]",
            )}
          >
            <div className="flex items-center justify-between border-b border-line px-[22px] py-[18px]">
              <div>
                <div className="text-[0.95rem] font-bold tracking-[-0.01em]">
                  Schedule — Field Team A
                </div>
                <div className="text-[0.72rem] text-ink-faint">
                  Week of Aug 10
                </div>
              </div>
              <span className="rounded-[var(--radius-pill)] bg-blue-50 px-2.5 py-1 text-[0.66rem] font-bold tracking-[0.08em] text-blue-600 uppercase">
                Live
              </span>
            </div>
            <div className="grid grid-cols-7 gap-[5px] px-[22px] pt-4 pb-2">
              {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                <div
                  key={`${d}${i}`}
                  className="pb-1 text-center text-[0.62rem] font-bold tracking-[0.08em] text-ink-faint"
                >
                  {d}
                </div>
              ))}
              {(
                [
                  ["27", "dim"], ["28", "dim"], ["29", "dim"], ["30", "dim"], ["31", "dim"], ["1", ""], ["2", ""],
                  ["3", ""], ["4", "busy"], ["5", ""], ["6", "busy"], ["7", ""], ["8", "busy"], ["9", ""],
                  ["10", "busy"], ["11", ""], ["12", "busy"], ["13", ""], ["14", "sel"], ["15", ""], ["16", ""],
                  ["17", ""], ["18", "busy"], ["19", ""], ["20", "busy"], ["21", ""], ["22", ""], ["23", ""],
                ] as const
              ).map(([day, kind], i) => (
                <div
                  key={i}
                  className={cn(
                    "relative flex aspect-square items-center justify-center rounded-lg text-[0.74rem] font-medium text-ink-muted",
                    kind === "dim" && "text-ink-faint/40",
                    kind === "busy" && "bg-blue-50 font-bold text-blue-600",
                    kind === "sel" &&
                      "bg-[linear-gradient(160deg,var(--blue-600),var(--blue-700))] font-bold text-white shadow-[0_6px_14px_rgb(46_134_193/0.4)]",
                  )}
                >
                  {day}
                  {kind === "busy" && (
                    <span className="absolute bottom-1 h-1 w-1 rounded-full bg-blue-600" />
                  )}
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2 px-[22px] pt-2 pb-5">
              {(
                [
                  ["bg-blue-600", "8:00 — Deep clean · Riverside Ave", "Maria T.", true],
                  ["bg-gold-500", "10:30 — AC tune-up · Unit 4B", "James R.", false],
                  ["bg-success-500", "1:00 — Drain inspection · Elm St", "Auto-assigned", false],
                ] as const
              ).map(([dot, text, who, booked]) => (
                <div
                  key={text}
                  className={cn(
                    "flex items-center gap-3 rounded-[10px] border px-3.5 py-[11px] text-[0.78rem] font-semibold whitespace-nowrap",
                    booked
                      ? "border-blue-600/25 bg-blue-50 text-navy-700"
                      : "border-line bg-card text-ink-muted",
                  )}
                >
                  <span className={cn("h-2 w-2 flex-none rounded-full", dot)} />
                  <span className="min-w-0 overflow-hidden text-ellipsis">{text}</span>
                  <span className="ml-auto text-[0.72rem] font-medium text-ink-faint">
                    {who}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* revenue card */}
          <div
            className={cn(
              panel,
              "px-6 pt-[22px] pb-5",
              "lg:absolute lg:-right-2.5 lg:bottom-0 lg:z-[3] lg:w-[min(310px,88%)] lg:rotate-[2deg]",
              "max-lg:-mt-[70px] max-lg:ml-[4%] max-lg:w-[min(360px,100%)] max-lg:-rotate-[1.2deg]",
            )}
          >
            <div className="text-[0.68rem] font-bold tracking-[0.14em] text-ink-faint uppercase">
              Booked revenue — August
            </div>
            <div className="font-instrument mt-1.5 mb-0.5 text-[2rem] font-bold tracking-[-0.03em]">
              $48,290
            </div>
            <span className="inline-flex items-center gap-1 text-[0.75rem] font-bold text-success-700">
              ▲ 22.4% vs. July
            </span>
            <svg
              viewBox="0 0 280 64"
              preserveAspectRatio="none"
              className="mt-3 h-16 w-full overflow-visible"
              role="img"
              aria-label="Revenue trend"
            >
              <defs>
                <linearGradient id="hero-rev-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" style={{ stopColor: "var(--blue-600)" }} stopOpacity="0.28" />
                  <stop offset="1" style={{ stopColor: "var(--blue-600)" }} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M0,52 C30,48 45,40 70,42 C95,44 108,30 135,28 C162,26 175,32 200,22 C225,12 250,14 280,4 L280,64 L0,64 Z"
                fill="url(#hero-rev-grad)"
              />
              <path
                d="M0,52 C30,48 45,40 70,42 C95,44 108,30 135,28 C162,26 175,32 200,22 C225,12 250,14 280,4"
                className="stroke-blue-600"
                fill="none"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <circle cx="280" cy="4" r="4" className="fill-gold-500 stroke-white" strokeWidth="2" />
            </svg>
          </div>

          {/* floating chip */}
          <div className="absolute -top-4 left-[38%] z-[4] hidden -rotate-1 items-center gap-2.5 rounded-xl bg-navy-900 px-[18px] py-3 text-[0.78rem] font-semibold text-white shadow-[0_14px_34px_rgb(8_26_46/0.35)] lg:flex">
            <span className="h-2 w-2 flex-none rotate-45 bg-gold-500" />
            New booking · just now
          </div>
        </div>
      </Container>
    </section>
  );
}
