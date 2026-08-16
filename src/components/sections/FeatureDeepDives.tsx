import { Container } from "@/components/ui/Container";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Em } from "@/components/ui/SectionHeading";
import { Reveal } from "@/components/motion/Reveal";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------ */
/*  Shared bits                                                        */
/* ------------------------------------------------------------------ */

type PlanHint = "all" | "pro" | "elite";

const planLabel: Record<PlanHint, string> = {
  all: "Included in every plan",
  pro: "Professional & Elite",
  elite: "Elite plan",
};

function PlanPill({ plan, onDark = false }: { plan: PlanHint; onDark?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-[var(--radius-pill)] px-3 py-[5px] text-[0.66rem] font-bold tracking-[0.1em] uppercase",
        onDark
          ? "border border-white/15 bg-white/8 text-white/70"
          : plan === "all"
            ? "bg-blue-50 text-blue-700"
            : plan === "pro"
              ? "bg-gold-100 text-gold-700"
              : "bg-navy-100 text-navy-700",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "h-1.5 w-1.5 rotate-45",
          onDark
            ? "bg-gold-500"
            : plan === "all"
              ? "bg-blue-600"
              : plan === "pro"
                ? "bg-gold-500"
                : "bg-navy-600",
        )}
      />
      {planLabel[plan]}
    </span>
  );
}

function Check({ onDark = false }: { onDark?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      className={cn(
        "mt-[3px] h-4 w-4 flex-none",
        onDark ? "text-gold-500" : "text-blue-600",
      )}
      aria-hidden
    >
      <path d="M5 13l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const panel =
  "rounded-2xl border border-navy-900/8 bg-card shadow-float overflow-hidden";

/** Text column + mock column, direction controlled by `flip`. */
function Cluster({
  id,
  index,
  flip = false,
  bg,
  eyebrow,
  plan,
  title,
  copy,
  bullets,
  mock,
}: {
  id: string;
  index: string;
  flip?: boolean;
  bg?: string;
  eyebrow: string;
  plan: PlanHint;
  title: React.ReactNode;
  copy: string;
  bullets: string[];
  mock: React.ReactNode;
}) {
  return (
    <section id={id} className={cn("scroll-mt-24 py-[clamp(60px,7.5vw,110px)]", bg)}>
      <Container
        className={cn(
          "grid items-center gap-[clamp(36px,5vw,80px)]",
          "min-[961px]:grid-cols-[1fr_1.05fr]",
          flip && "min-[961px]:grid-cols-[1.05fr_1fr]",
        )}
      >
        <Reveal className={cn("min-w-0", flip && "min-[961px]:order-2")}>
          <Eyebrow>
            <span className="font-instrument mr-1 text-blue-600/50">{index}</span>
            {eyebrow}
          </Eyebrow>
          <h2 className="font-display mb-4 text-[length:var(--text-h2-lg)] leading-[1.12] font-bold tracking-[-0.03em]">
            {title}
          </h2>
          <p className="mb-6 max-w-[36em] leading-[1.7] font-light text-ink-muted">
            {copy}
          </p>
          <ul className="mb-7 flex flex-col gap-2.5">
            {bullets.map((b) => (
              <li
                key={b}
                className="flex items-start gap-[11px] text-[0.92rem] leading-[1.55] text-ink-muted"
              >
                <Check />
                {b}
              </li>
            ))}
          </ul>
          <PlanPill plan={plan} />
        </Reveal>
        <Reveal delay={0.1} className={cn("min-w-0", flip && "min-[961px]:order-1")}>
          <div aria-hidden>{mock}</div>
        </Reveal>
      </Container>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Mock compositions (aria-hidden, decorative product UI)             */
/* ------------------------------------------------------------------ */

function MockHeader({ title, meta, pill, pillCls }: { title: string; meta: string; pill: string; pillCls?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-line px-[22px] py-4">
      <div>
        <div className="text-[0.9rem] font-bold tracking-[-0.01em]">{title}</div>
        <div className="text-[0.7rem] text-ink-faint">{meta}</div>
      </div>
      <span
        className={cn(
          "rounded-[var(--radius-pill)] px-2.5 py-1 text-[0.62rem] font-bold tracking-[0.08em] uppercase",
          pillCls ?? "bg-blue-50 text-blue-600",
        )}
      >
        {pill}
      </span>
    </div>
  );
}

function BookingEngineMock() {
  return (
    <div className="relative">
      <div className={cn(panel, "max-w-[440px] min-[961px]:ml-auto")}>
        <MockHeader title="Book a service" meta="clean-sweep.diamondbooking.com" pill="Live" />
        <div className="px-[22px] pt-[18px] pb-[22px]">
          <div className="mb-2.5 flex items-center justify-between rounded-[9px] border border-blue-600 bg-card px-3.5 py-[11px] text-[0.78rem] font-semibold shadow-[0_0_0_3px_rgb(46_134_193/0.13)]">
            <span>Recurring home cleaning · 2h</span>
            <span className="text-[0.68rem] text-ink-faint">▾</span>
          </div>
          <div className="mb-3.5 flex items-center justify-between rounded-[9px] border border-line bg-card px-3.5 py-[11px] text-[0.78rem] text-ink-muted">
            <span>Add-on: inside oven · +30 min</span>
            <span className="rounded-md bg-surface-alt px-2 py-0.5 text-[0.64rem] font-bold text-ink-faint">+$25</span>
          </div>
          <div className="mb-1.5 text-[0.66rem] font-bold tracking-[0.12em] text-ink-faint uppercase">
            Friday, Aug 21 — real availability
          </div>
          <div className="mb-4 grid grid-cols-4 gap-[7px]">
            {["8:00", "10:30", "1:00", "3:30"].map((t) => (
              <div
                key={t}
                className={cn(
                  "rounded-lg border px-1 py-2 text-center text-[0.7rem] font-semibold",
                  t === "10:30"
                    ? "border-navy-700 bg-navy-700 text-white"
                    : "border-line bg-card text-ink-muted",
                )}
              >
                {t}
              </div>
            ))}
          </div>
          <div className="rounded-[9px] bg-[linear-gradient(180deg,var(--gold-400),var(--gold-500)_55%,var(--gold-600))] p-3 text-center text-[0.8rem] font-bold text-navy-950 shadow-[0_4px_14px_rgb(244_185_66/0.35)]">
            Confirm booking — $25 deposit
          </div>
        </div>
      </div>
      <div className="absolute -bottom-4 left-0 flex rotate-[-1.5deg] items-center gap-2.5 rounded-xl bg-navy-900 px-4 py-2.5 text-[0.72rem] font-semibold text-white shadow-[0_14px_34px_rgb(8_26_46/0.35)] min-[961px]:-left-6">
        <span className="h-1.5 w-1.5 flex-none rotate-45 bg-gold-500" />
        Travel buffer added automatically · 25 min
      </div>
    </div>
  );
}

function DispatchMock() {
  const crews: { name: string; jobs: { t: string; label: string; cls: string; h: string }[] }[] = [
    {
      name: "Crew A",
      jobs: [
        { t: "8:00", label: "Deep clean · Riverside", cls: "border-blue-600/25 bg-blue-50 text-navy-700", h: "h-[72px]" },
        { t: "11:30", label: "Move-out · Cedar Ln", cls: "border-line bg-surface-alt text-ink-muted", h: "h-[56px]" },
      ],
    },
    {
      name: "Crew B",
      jobs: [
        { t: "9:00", label: "AC tune-up · Unit 4B", cls: "border-gold-500/35 bg-gold-50 text-gold-900", h: "h-[56px]" },
        { t: "1:00", label: "Filter swap · Oak Hill", cls: "border-line bg-surface-alt text-ink-muted", h: "h-[48px]" },
      ],
    },
    {
      name: "Crew C",
      jobs: [
        { t: "8:30", label: "Drain scope · Elm St", cls: "border-success-500/30 bg-success-50 text-success-700", h: "h-[64px]" },
        { t: "12:00", label: "Emergency · Main St", cls: "border-blue-600/25 bg-blue-50 text-navy-700", h: "h-[52px]" },
      ],
    },
  ];
  return (
    <div className={cn(panel, "max-w-[460px]")}>
      <MockHeader title="Dispatch board" meta="Today · 3 crews · 12 jobs" pill="Auto-routed" pillCls="bg-success-50 text-success-700" />
      <div className="grid grid-cols-3 gap-2.5 px-[18px] pt-4 pb-5">
        {crews.map((crew) => (
          <div key={crew.name} className="min-w-0">
            <div className="mb-2 text-center text-[0.62rem] font-bold tracking-[0.1em] text-ink-faint uppercase">
              {crew.name}
            </div>
            <div className="flex flex-col gap-2">
              {crew.jobs.map((job) => (
                <div
                  key={job.label}
                  className={cn(
                    "flex flex-col justify-between overflow-hidden rounded-[9px] border px-2.5 py-2 text-[0.64rem] font-semibold",
                    job.cls,
                    job.h,
                  )}
                >
                  <span className="font-instrument text-[0.7rem] font-bold">{job.t}</span>
                  <span className="overflow-hidden leading-[1.35] text-ellipsis whitespace-nowrap">{job.label}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2.5 border-t border-line bg-surface-alt px-[18px] py-3 text-[0.7rem] font-semibold text-ink-muted">
        <span className="h-1.5 w-1.5 flex-none rounded-full bg-blue-600" />
        Emergency slotted into Crew C — ETAs texted to 2 customers
      </div>
    </div>
  );
}

function PaymentsMock() {
  return (
    <div className="relative max-w-[440px] min-[961px]:ml-auto">
      <div className={cn(panel)}>
        <MockHeader title="Invoice #2481" meta="Clean Sweep Services · Aug 14" pill="Paid" pillCls="bg-success-50 text-success-700" />
        <div className="px-[22px] pt-4 pb-5">
          {[
            ["Recurring home cleaning", "$180.00"],
            ["Inside oven add-on", "$25.00"],
            ["Deposit collected at booking", "−$25.00"],
          ].map(([label, amt]) => (
            <div
              key={label}
              className="flex items-center justify-between border-b border-line py-2.5 text-[0.8rem] text-ink-muted"
            >
              <span>{label}</span>
              <span className="font-instrument font-semibold text-ink">{amt}</span>
            </div>
          ))}
          <div className="flex items-center justify-between pt-3.5 pb-14">
            <span className="text-[0.78rem] font-bold tracking-[0.08em] text-ink-faint uppercase">
              Charged on completion
            </span>
            <span className="font-instrument text-[1.5rem] font-bold tracking-[-0.03em]">$180.00</span>
          </div>
        </div>
      </div>
      <div className="absolute -bottom-4 -left-2 flex rotate-[1.6deg] items-center gap-3 rounded-xl border border-navy-900/8 bg-card px-4 py-3 shadow-float min-[961px]:-left-8">
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] bg-success-50 text-success-700">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <path d="M12 3v18M17 7.5C17 5.6 14.8 5 12 5s-5 .9-5 2.8c0 4.4 10 2 10 6.4 0 1.9-2.2 2.8-5 2.8s-5-.6-5-2.5" strokeLinecap="round" />
          </svg>
        </span>
        <div>
          <div className="text-[0.78rem] font-bold">Payout — Friday</div>
          <div className="text-[0.7rem] text-ink-faint">
            $1,240.00 · 6 invoices · auto-reconciled
          </div>
        </div>
      </div>
    </div>
  );
}

function CrmMock() {
  const rows = [
    { init: "AP", bg: "bg-blue-600", name: "Anna Park", tags: ["Recurring", "VIP"], ltv: "$2,340" },
    { init: "RG", bg: "bg-navy-600", name: "Ray Gomez", tags: ["Bi-weekly"], ltv: "$1,180" },
    { init: "LW", bg: "bg-gold-600", name: "Lena Wu", tags: ["New"], ltv: "$205" },
  ];
  return (
    <div className={cn(panel, "max-w-[440px]")}>
      <MockHeader title="Customers" meta="1,284 records · synced live" pill="Segments" />
      <div className="px-[18px] pt-4">
        <div className="mb-3 flex items-center gap-2 rounded-[9px] border border-line bg-surface-alt px-3 py-2 text-[0.76rem] text-ink-faint">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.2-3.2" strokeLinecap="round" />
          </svg>
          recurring customers, 90+ days…
        </div>
        <div className="overflow-hidden rounded-[10px] border border-line">
          {rows.map((r, i) => (
            <div
              key={r.name}
              className={cn(
                "flex items-center gap-3 bg-card px-3.5 py-3",
                i < rows.length - 1 && "border-b border-line",
              )}
            >
              <span className={cn("flex h-7 w-7 flex-none items-center justify-center rounded-full text-[0.6rem] font-bold text-white", r.bg)}>
                {r.init}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[0.8rem] font-bold">{r.name}</div>
                <div className="mt-0.5 flex gap-1.5">
                  {r.tags.map((t) => (
                    <span key={t} className="rounded-[var(--radius-pill)] bg-blue-50 px-2 py-[2px] text-[0.58rem] font-bold text-blue-700">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <div className="text-right">
                <div className="font-instrument text-[0.85rem] font-bold">{r.ltv}</div>
                <div className="text-[0.6rem] text-ink-faint">lifetime</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mx-[18px] my-4 rounded-[10px] border border-gold-500/30 bg-gold-50 px-3.5 py-2.5 text-[0.72rem] leading-[1.5] text-gold-900">
        <b>Job note carried forward:</b> gate code 4482, dog is friendly, use
        side entrance.
      </div>
    </div>
  );
}

function TeamMock() {
  const rows = [
    { init: "SJ", bg: "bg-blue-600", name: "Sarah Johnson", role: "Owner", on: true },
    { init: "MT", bg: "bg-gold-600", name: "Maria Torres", role: "Dispatcher", on: true },
    { init: "JR", bg: "bg-navy-500", name: "James Reed", role: "Technician", on: false },
  ];
  return (
    <div className="rounded-2xl border border-white/10 bg-[linear-gradient(160deg,rgb(255_255_255/0.07),rgb(255_255_255/0.02))] shadow-float">
      <div className="flex items-center justify-between border-b border-white/10 px-[22px] py-4">
        <div>
          <div className="text-[0.9rem] font-bold text-white">Team & permissions</div>
          <div className="text-[0.7rem] text-white/50">9 of 10 seats used</div>
        </div>
        <span className="rounded-[var(--radius-pill)] bg-white/10 px-2.5 py-1 text-[0.62rem] font-bold tracking-[0.08em] text-white/70 uppercase">
          Roles
        </span>
      </div>
      <div className="px-[18px] py-4">
        {rows.map((r, i) => (
          <div
            key={r.name}
            className={cn(
              "flex items-center gap-3 py-2.5",
              i < rows.length - 1 && "border-b border-white/8",
            )}
          >
            <span className={cn("flex h-7 w-7 flex-none items-center justify-center rounded-full text-[0.6rem] font-bold text-white", r.bg)}>
              {r.init}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[0.8rem] font-bold text-white">{r.name}</div>
              <div className="text-[0.64rem] text-white/45">{r.role}</div>
            </div>
            <span
              className={cn(
                "rounded-[var(--radius-pill)] px-2.5 py-[3px] text-[0.6rem] font-bold tracking-[0.06em] uppercase",
                r.on ? "bg-success-500/15 text-success-500" : "bg-white/8 text-white/45",
              )}
            >
              {r.on ? "On shift" : "Off"}
            </span>
            <span
              className={cn(
                "relative h-[18px] w-8 flex-none rounded-full transition-colors",
                r.on ? "bg-blue-500" : "bg-white/15",
              )}
            >
              <span
                className={cn(
                  "absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white",
                  r.on ? "right-[2px]" : "left-[2px]",
                )}
              />
            </span>
          </div>
        ))}
        <div className="mt-3 flex items-center justify-between rounded-[10px] border border-white/10 bg-white/5 px-3.5 py-3">
          <div>
            <div className="text-[0.74rem] font-bold text-white">Payroll report — August</div>
            <div className="text-[0.62rem] text-white/45">Hours, commissions & tips per tech</div>
          </div>
          <span className="rounded-md bg-gold-500 px-2.5 py-1 text-[0.62rem] font-bold text-navy-950">
            Export
          </span>
        </div>
      </div>
    </div>
  );
}

function AnalyticsMock() {
  const bars = [34, 48, 42, 60, 55, 74, 68, 88];
  return (
    <div className="rounded-2xl border border-white/10 bg-[linear-gradient(160deg,rgb(255_255_255/0.07),rgb(255_255_255/0.02))] shadow-float">
      <div className="flex items-center justify-between border-b border-white/10 px-[22px] py-4">
        <div>
          <div className="text-[0.9rem] font-bold text-white">Revenue report</div>
          <div className="text-[0.7rem] text-white/50">Last 8 weeks · all crews</div>
        </div>
        <span className="rounded-[var(--radius-pill)] bg-white/10 px-2.5 py-1 text-[0.62rem] font-bold tracking-[0.08em] text-white/70 uppercase">
          Weekly
        </span>
      </div>
      <div className="px-[22px] py-5">
        <div className="mb-4 grid grid-cols-3 gap-2.5">
          {[
            ["Booked revenue", "$48.2K", "▲ 22%"],
            ["Repeat rate", "64%", "▲ 6%"],
            ["Avg. job value", "$212", "▲ $14"],
          ].map(([k, v, d]) => (
            <div key={k} className="min-w-0 rounded-[10px] border border-white/10 bg-white/5 px-3 py-2.5">
              <div className="truncate text-[0.56rem] font-bold tracking-[0.1em] text-white/45 uppercase">{k}</div>
              <div className="font-instrument mt-0.5 text-[1rem] font-bold text-white">
                {v}
                <small className="ml-1 text-[0.58rem] font-bold text-success-500">{d}</small>
              </div>
            </div>
          ))}
        </div>
        <div className="flex h-[96px] items-end gap-2">
          {bars.map((h, i) => (
            <div
              key={i}
              style={{ height: `${h}%` }}
              className={cn(
                "min-w-0 flex-1 rounded-t-[5px]",
                i === bars.length - 1
                  ? "bg-[linear-gradient(180deg,var(--gold-400),var(--gold-600))]"
                  : "bg-[linear-gradient(180deg,rgb(93_173_226/0.9),rgb(46_134_193/0.55))]",
              )}
            />
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3 text-[0.66rem] text-white/45">
          <span>Booking sources: widget 58% · phone 27% · repeat 15%</span>
          <span className="font-bold text-gold-500">Best week ever ↗</span>
        </div>
      </div>
    </div>
  );
}

function MarketingMock() {
  return (
    <div className="relative max-w-[440px] min-[961px]:ml-auto">
      <div className={cn(panel)}>
        <MockHeader title="Campaigns" meta="Quiet-week automations" pill="Running" pillCls="bg-success-50 text-success-700" />
        <div className="flex flex-col gap-3 px-[18px] py-4">
          <div className="rounded-[12px] border border-dashed border-gold-500/50 bg-gold-50 px-4 py-3.5">
            <div className="flex items-center justify-between">
              <span className="font-instrument text-[1.05rem] font-bold tracking-[0.06em] text-gold-900">
                SPRING20
              </span>
              <span className="rounded-[var(--radius-pill)] bg-card px-2.5 py-[3px] text-[0.6rem] font-bold text-gold-700">
                142 redeemed
              </span>
            </div>
            <div className="mt-1 text-[0.72rem] text-gold-900/80">
              20% off first recurring clean · expires Aug 31
            </div>
          </div>
          {[
            ["Win-back email", "Sent 480 · 62 rebooked", "13% conversion"],
            ["Review request SMS", "Sent after every 5-star job", "4.9★ average"],
          ].map(([name, meta, stat]) => (
            <div key={name} className="flex items-center justify-between rounded-[10px] border border-line bg-card px-3.5 py-3">
              <div>
                <div className="text-[0.78rem] font-bold">{name}</div>
                <div className="text-[0.66rem] text-ink-faint">{meta}</div>
              </div>
              <span className="rounded-[var(--radius-pill)] bg-blue-50 px-2.5 py-1 text-[0.62rem] font-bold text-blue-700">
                {stat}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="absolute -right-2 -bottom-4 flex rotate-[1.4deg] items-center gap-2.5 rounded-xl bg-navy-900 px-4 py-2.5 text-[0.72rem] font-semibold text-white shadow-[0_14px_34px_rgb(8_26_46/0.35)] min-[1100px]:-right-6">
        <span className="h-1.5 w-1.5 flex-none rotate-45 bg-gold-500" />
        Thursday gap detected — offer queued
      </div>
    </div>
  );
}

function WidgetMock() {
  return (
    <div className="grid gap-4 min-[521px]:grid-cols-[1.15fr_1fr] min-[521px]:items-center">
      <div className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-navy-950 shadow-float">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <span className="h-[9px] w-[9px] rounded-full bg-white/15" />
          <span className="h-[9px] w-[9px] rounded-full bg-white/15" />
          <span className="h-[9px] w-[9px] rounded-full bg-white/15" />
          <span className="ml-2 text-[0.64rem] font-medium text-white/40">index.html</span>
        </div>
        <pre className="overflow-x-auto px-5 py-5 text-[0.66rem] leading-[1.8] text-blue-200">
          <code>
            <span className="text-white/35">{"<!-- one line, any website -->"}</span>
            {"\n"}
            <span className="text-blue-300">{"<script"}</span>
            {"\n  "}
            <span className="text-gold-300">src</span>
            <span className="text-white/60">=</span>
            <span className="text-success-500">&quot;//embed.diamondbooking.com/v1.js&quot;</span>
            {"\n  "}
            <span className="text-gold-300">data-business</span>
            <span className="text-white/60">=</span>
            <span className="text-success-500">&quot;clean-sweep&quot;</span>
            {"\n"}
            <span className="text-blue-300">{"></script>"}</span>
          </code>
        </pre>
      </div>
      <div className="min-w-0 rounded-2xl border border-navy-900/8 bg-[linear-gradient(165deg,var(--surface-card),var(--blue-50))] p-5 shadow-lift">
        <div className="mb-3 flex items-center gap-2.5">
          <span className="flex h-[24px] w-[24px] items-center justify-center rounded-[6px] bg-[linear-gradient(150deg,var(--blue-600),var(--navy-600))]">
            <span className="h-2 w-2 rotate-45 bg-white" />
          </span>
          <div>
            <b className="block text-[0.78rem] tracking-[-0.01em]">Book a service</b>
            <small className="block text-[0.58rem] font-medium text-ink-faint">
              Matches your branding on Professional+
            </small>
          </div>
        </div>
        <div className="mb-2 rounded-[8px] border border-line bg-card px-3 py-2 text-[0.7rem] font-semibold">
          Gutter cleaning · $140
        </div>
        <div className="mb-3 grid grid-cols-3 gap-1.5">
          {["Thu", "Fri", "Sat"].map((d) => (
            <div
              key={d}
              className={cn(
                "rounded-md border py-1.5 text-center text-[0.62rem] font-bold",
                d === "Fri" ? "border-navy-700 bg-navy-700 text-white" : "border-line bg-card text-ink-muted",
              )}
            >
              {d}
            </div>
          ))}
        </div>
        <div className="rounded-[8px] bg-[linear-gradient(180deg,var(--gold-400),var(--gold-500)_55%,var(--gold-600))] py-2 text-center text-[0.7rem] font-bold text-navy-950">
          Confirm — pay deposit
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Navy band: team management + analytics                             */
/* ------------------------------------------------------------------ */

function NavyCluster({
  id,
  index,
  flip = false,
  eyebrow,
  plan,
  title,
  copy,
  bullets,
  mock,
}: {
  id: string;
  index: string;
  flip?: boolean;
  eyebrow: string;
  plan: PlanHint;
  title: React.ReactNode;
  copy: string;
  bullets: string[];
  mock: React.ReactNode;
}) {
  return (
    <div
      id={id}
      className={cn(
        "grid scroll-mt-32 items-center gap-[clamp(36px,5vw,80px)]",
        "min-[961px]:grid-cols-[1fr_1.05fr]",
        flip && "min-[961px]:grid-cols-[1.05fr_1fr]",
      )}
    >
      <Reveal className={cn("min-w-0", flip && "min-[961px]:order-2")}>
        <Eyebrow onDark>
          <span className="font-instrument mr-1 text-blue-300/50">{index}</span>
          {eyebrow}
        </Eyebrow>
        <h2 className="font-display mb-4 text-[length:var(--text-h2-lg)] leading-[1.12] font-bold tracking-[-0.03em] text-white">
          {title}
        </h2>
        <p className="mb-6 max-w-[36em] leading-[1.7] font-light text-white/65">{copy}</p>
        <ul className="mb-7 flex flex-col gap-2.5">
          {bullets.map((b) => (
            <li key={b} className="flex items-start gap-[11px] text-[0.92rem] leading-[1.55] text-white/70">
              <Check onDark />
              {b}
            </li>
          ))}
        </ul>
        <PlanPill plan={plan} onDark />
      </Reveal>
      <Reveal delay={0.1} className={cn("min-w-0", flip && "min-[961px]:order-1")}>
        <div aria-hidden>{mock}</div>
      </Reveal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Assembled page section                                             */
/* ------------------------------------------------------------------ */

export function FeatureDeepDives() {
  return (
    <>
      <Cluster
        id="booking-engine"
        index="01"
        bg="bg-card border-t border-line"
        eyebrow="Booking engine"
        plan="all"
        title={
          <>
            A calendar that fills itself — <Em>no phone required.</Em>
          </>
        }
        copy="Customers see only slots your team can actually serve. Service durations, add-ons, buffer times, travel windows, and crew capacity are computed on every request, so double-bookings are structurally impossible."
        bullets={[
          "Real-time availability across every crew and service area",
          "Add-ons, durations, and deposits priced per service",
          "Buffer and travel time applied automatically to every job",
        ]}
        mock={<BookingEngineMock />}
      />

      <Cluster
        id="dispatch"
        index="02"
        flip
        bg="bg-[linear-gradient(180deg,var(--surface)_0%,var(--surface-alt)_100%)]"
        eyebrow="Dispatch & calendar"
        plan="all"
        title={
          <>
            The right crew, the right zone, <Em>the right minute.</Em>
          </>
        }
        copy="Jobs route by zone, skill, and workload the moment they land. Emergencies slot into live routes with automatic customer ETAs, and every change syncs to each technician's mobile day-sheet instantly."
        bullets={[
          "Drag-and-drop board with zone and skill-aware auto-assign",
          "Live day-sheets for every technician, synced on change",
          "Emergency insertion with automatic ETA texts to customers",
        ]}
        mock={<DispatchMock />}
      />

      <Cluster
        id="payments"
        index="03"
        bg="bg-card"
        eyebrow="Payments & invoices"
        plan="pro"
        title={
          <>
            Cash that arrives <Em>before the truck does.</Em>
          </>
        }
        copy="Take deposits at booking, charge the card on file at completion, and let invoices reconcile themselves. Funds settle to your bank on a rolling basis — no envelope of checks riding around in the van."
        bullets={[
          "Deposits at booking, balance charged on completion",
          "Invoices generated from the job — line items included",
          "Automatic reconciliation and rolling payouts via Stripe",
        ]}
        mock={<PaymentsMock />}
      />

      <Cluster
        id="crm"
        index="04"
        flip
        bg="bg-[linear-gradient(180deg,var(--surface-alt)_0%,var(--surface)_100%)]"
        eyebrow="Customers & CRM"
        plan="all"
        title={
          <>
            Every customer, every job, <Em>remembered.</Em>
          </>
        }
        copy="Full history per household: services, notes, gate codes, preferred technicians, lifetime value. Segments update themselves, so 'recurring customers we haven't seen in 90 days' is one click, not one afternoon."
        bullets={[
          "Complete job and payment history on one record",
          "Notes and access details carried to every future visit",
          "Live segments by frequency, service, zone, and value",
        ]}
        mock={<CrmMock />}
      />

      {/* --- navy band: team + analytics --- */}
      <section
        className={cn(
          "relative text-white",
          "bg-[linear-gradient(168deg,var(--navy-900)_0%,var(--navy-950)_70%)]",
          "[clip-path:polygon(0_clamp(28px,4.5vw,64px),100%_0,100%_100%,0_100%)]",
          "pt-[clamp(110px,13vw,180px)] pb-[clamp(96px,12vw,160px)]",
        )}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_480px_at_88%_8%,rgb(46_134_193/0.22),transparent_60%),radial-gradient(600px_400px_at_4%_92%,rgb(46_134_193/0.13),transparent_60%)]"
        />
        <Container className="relative flex flex-col gap-[clamp(80px,10vw,140px)]">
          <NavyCluster
            id="team"
            index="05"
            eyebrow="Team management"
            plan="pro"
            title={
              <>
                Roles, permissions, payroll — <Em tone="sky">handled.</Em>
              </>
            }
            copy="Owners, dispatchers, and technicians each see exactly what they need — nothing more. Track hours and commissions per tech, and export payroll-ready reports instead of rebuilding them in a spreadsheet."
            bullets={[
              "Role-based access for owners, office staff, and field techs",
              "Shift tracking, time off, and capacity in one view",
              "Payroll and commission reports on Elite",
            ]}
            mock={<TeamMock />}
          />
          <NavyCluster
            id="analytics"
            index="06"
            flip
            eyebrow="Analytics & reports"
            plan="pro"
            title={
              <>
                The numbers that <Em tone="sky">grow a service business.</Em>
              </>
            }
            copy="Booking sources, repeat rates, revenue per crew, utilization by week. Diamond turns your operational exhaust into the handful of numbers that actually decide whether you add a truck this year."
            bullets={[
              "Revenue, utilization, and repeat-rate dashboards",
              "Source attribution: widget, phone, and repeat bookings",
              "Weekly digest email with the numbers that moved",
            ]}
            mock={<AnalyticsMock />}
          />
        </Container>
      </section>

      <Cluster
        id="marketing"
        index="07"
        bg="bg-card"
        eyebrow="Marketing tools"
        plan="pro"
        title={
          <>
            Quiet weeks, <Em>booked solid.</Em>
          </>
        }
        copy="Coupons, win-back emails, and review requests run themselves against your real calendar. When Diamond spots a soft Thursday, an offer goes out to the right segment — and the gap closes before you notice it."
        bullets={[
          "Coupons and promotions with redemption tracking",
          "Automated win-back and rebooking campaigns",
          "Review requests after every completed job",
        ]}
        mock={<MarketingMock />}
      />

      <Cluster
        id="widget"
        index="08"
        flip
        bg="bg-[linear-gradient(180deg,var(--surface)_0%,var(--surface-alt)_100%)]"
        eyebrow="Embeddable widget"
        plan="all"
        title={
          <>
            One line of code, <Em>bookings everywhere.</Em>
          </>
        }
        copy="Drop the widget into WordPress, Squarespace, Wix, or a hand-built site with a single snippet. No website? Every account ships with a hosted booking page. Branding follows your colors on Professional and above."
        bullets={[
          "Works on any website with one script tag",
          "Hosted booking page included with every account",
          "Custom branding and colors on Professional+",
        ]}
        mock={<WidgetMock />}
      />
    </>
  );
}
