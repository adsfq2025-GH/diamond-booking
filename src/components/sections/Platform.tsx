import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { SectionHeading, Em } from "@/components/ui/SectionHeading";
import { Reveal } from "@/components/motion/Reveal";
import { VideoEmblem } from "@/components/sections/VideoEmblem";
import { cn } from "@/lib/cn";

function ShowCardCap({
  title,
  copy,
  linkLabel,
}: {
  title: string;
  copy: string;
  linkLabel: string;
}) {
  return (
    <div className="px-[34px] pt-[30px] pb-[26px] max-sm:px-6 max-sm:pt-[26px] max-sm:pb-[22px]">
      <h3 className="font-display mb-2 text-[length:var(--text-h3)] font-bold tracking-[-0.02em]">
        {title}
      </h3>
      <p className="max-w-[42em] text-[0.92rem] font-light text-ink-muted">
        {copy}
      </p>
      <Link
        href="/features"
        className="mt-3.5 inline-flex items-center gap-1.5 text-[0.85rem] font-semibold text-blue-600 transition-[gap] duration-[var(--duration-fast)] ease-[var(--ease-out-expo)] hover:gap-2.5"
      >
        {linkLabel} <span aria-hidden>→</span>
      </Link>
    </div>
  );
}

const dashRows = [
  { initials: "MT", bg: "bg-blue-600", job: "Deep clean · 8:00 · Riverside Ave", status: "Confirmed", pill: "bg-success-50 text-success-700" },
  { initials: "JR", bg: "bg-navy-600", job: "AC tune-up · 10:30 · Unit 4B", status: "En route", pill: "bg-blue-50 text-blue-600" },
  { initials: "DK", bg: "bg-gold-600", job: "Roof inspection · 1:00 · Oak Hill", status: "Pending", pill: "bg-gold-100 text-gold-700" },
  { initials: "AL", bg: "bg-success-500", job: "Lawn service · 3:30 · Cedar Ln", status: "Confirmed", pill: "bg-success-50 text-success-700" },
];

const dashKpis = [
  { k: "Jobs today", v: "34", delta: "▲ 6" },
  { k: "Utilization", v: "92%", delta: "▲ 4%" },
  { k: "Revenue MTD", v: "$48.2K", delta: "▲ 22%" },
];

export function Platform() {
  return (
    <section
      id="product"
      className="relative bg-[linear-gradient(180deg,var(--surface)_0%,var(--surface-alt)_100%)] pt-[clamp(88px,11vw,150px)] pb-[clamp(80px,10vw,130px)]"
    >
      <Container>
        <Reveal>
          <div className="mb-[clamp(48px,6vw,80px)] grid items-center gap-2 min-[961px]:grid-cols-[minmax(0,640px)_minmax(0,1fr)] min-[961px]:gap-[clamp(32px,4vw,64px)]">
            <SectionHeading
              eyebrow="The platform"
              title={
                <>
                  One command center.
                  <br />
                  From first click to <Em>final payment.</Em>
                </>
              }
              lede="Your website takes the booking. Diamond routes the job, reminds the customer, and settles the invoice — while you watch it all from one dashboard."
              ledeClassName="text-[1.05rem] mt-[18px]"
            />
            <VideoEmblem className="max-[960px]:mt-2.5" />
          </div>
        </Reveal>

        <div className="grid items-stretch gap-[clamp(28px,3.5vw,48px)] min-[961px]:grid-cols-[1.2fr_1fr]">
          {/* operations dashboard card */}
          <Reveal className="min-w-0">
            <Card interactive className="flex h-full flex-col overflow-hidden shadow-lift">
              <ShowCardCap
                title="The operations dashboard"
                copy="Jobs, crews, revenue, and utilization at a glance. Assign technicians by zone and skill, spot gaps in tomorrow's schedule, and act before they cost you."
                linkLabel="Explore the dashboard"
              />
              <div
                aria-hidden
                className="relative ml-[34px] flex-1 overflow-hidden rounded-tl-[14px] border-t border-l border-line bg-surface-alt shadow-[inset_0_1px_0_rgb(255_255_255/0.8)] min-[961px]:min-h-[340px] max-sm:ml-6"
              >
                <div className="flex items-center gap-2 border-b border-line bg-card px-[18px] py-3">
                  <span className="h-[9px] w-[9px] rounded-full bg-line" />
                  <span className="h-[9px] w-[9px] rounded-full bg-line" />
                  <span className="h-[9px] w-[9px] rounded-full bg-line" />
                  <span className="ml-2.5 flex h-[22px] min-w-0 flex-1 items-center overflow-hidden rounded-md bg-surface-alt px-2.5 text-[0.62rem] font-medium whitespace-nowrap text-ink-faint">
                    app.diamond-booking.com/dashboard
                  </span>
                </div>
                <div className="grid min-h-[300px] grid-cols-[150px_minmax(0,1fr)] max-sm:grid-cols-[52px_minmax(0,1fr)]">
                  <div className="bg-navy-900 py-4">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className={cn(
                          "mx-[18px] my-3.5 h-3 rounded bg-white/15 max-sm:mx-3 max-sm:my-3",
                          i === 0 && "bg-blue-600",
                        )}
                      />
                    ))}
                  </div>
                  <div className="p-[18px] max-sm:p-3">
                    <div className="mb-3 grid grid-cols-3 gap-2.5 max-sm:gap-[7px]">
                      {dashKpis.map((kpi) => (
                        <div
                          key={kpi.k}
                          className="min-w-0 rounded-[10px] border border-line bg-card p-3 max-sm:p-[9px]"
                        >
                          <div className="text-[0.56rem] font-bold tracking-[0.1em] text-ink-faint uppercase">
                            {kpi.k}
                          </div>
                          <div className="font-instrument mt-[3px] text-[1.05rem] font-bold tracking-[-0.02em] max-sm:text-[0.9rem]">
                            {kpi.v}
                            <small className="ml-[5px] text-[0.6rem] font-bold text-success-700">
                              {kpi.delta}
                            </small>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="overflow-hidden rounded-[10px] border border-line bg-card">
                      {dashRows.map((row, i) => (
                        <div
                          key={row.initials}
                          className={cn(
                            "flex items-center gap-2.5 px-3.5 py-2.5 text-[0.68rem] text-ink-muted max-sm:gap-2 max-sm:px-2.5 max-sm:py-[9px] max-sm:text-[0.64rem]",
                            i < dashRows.length - 1 && "border-b border-line",
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full text-[0.55rem] font-bold text-white",
                              row.bg,
                            )}
                          >
                            {row.initials}
                          </span>
                          <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                            {row.job}
                          </span>
                          <span
                            className={cn(
                              "ml-auto flex-none rounded-[var(--radius-pill)] px-[9px] py-[3px] text-[0.58rem] font-bold",
                              row.pill,
                            )}
                          >
                            {row.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </Reveal>

          {/* booking widget card */}
          <Reveal className="min-w-0">
            <Card interactive className="flex h-full flex-col overflow-hidden shadow-lift">
              <ShowCardCap
                title="The embeddable booking widget"
                copy="One line of code drops a branded booking flow into any website. Customers pick a service, see real availability, and pay a deposit — 24/7."
                linkLabel="See the embed docs"
              />
              <div aria-hidden className="flex flex-1 items-end px-[34px] max-sm:px-6">
                <div className="w-full rounded-t-[14px] border border-b-0 border-line bg-[linear-gradient(165deg,var(--surface-card),var(--blue-50))] px-[22px] pt-[22px] pb-[26px] shadow-[0_-2px_20px_rgb(8_26_46/0.05)]">
                  <div className="mb-4 flex items-center gap-2.5">
                    <span className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] bg-[linear-gradient(150deg,var(--blue-600),var(--navy-600))]">
                      <span className="h-[9px] w-[9px] rotate-45 bg-white" />
                    </span>
                    <div>
                      <b className="text-[0.85rem] tracking-[-0.01em]">Book a service</b>
                      <small className="block text-[0.65rem] font-medium text-ink-faint">
                        Powered by Diamond Booking
                      </small>
                    </div>
                  </div>
                  <div className="mb-[9px] flex items-center justify-between rounded-[9px] border border-blue-600 bg-card px-3.5 py-[11px] text-[0.76rem] font-semibold text-ink shadow-[0_0_0_3px_rgb(46_134_193/0.13)]">
                    <span>Recurring home cleaning</span>
                    <span className="text-[0.68rem] text-ink-faint">▾</span>
                  </div>
                  <div className="mb-[9px] flex items-center justify-between rounded-[9px] border border-line bg-card px-3.5 py-[11px] text-[0.76rem] text-ink-muted">
                    <span>Fri, Aug 14</span>
                    <span className="text-[0.68rem] text-ink-faint">▾</span>
                  </div>
                  <div className="mt-3 mb-4 grid grid-cols-3 gap-[7px]">
                    {["9:00", "10:30", "1:00"].map((t) => (
                      <div
                        key={t}
                        className={cn(
                          "rounded-lg border px-1 py-2 text-center text-[0.68rem] font-semibold",
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
            </Card>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
