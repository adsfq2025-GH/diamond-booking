import { Container } from "@/components/ui/Container";
import { SectionHeading, Em } from "@/components/ui/SectionHeading";
import { Reveal } from "@/components/motion/Reveal";
import { PLANS, PLAN_ORDER } from "@/lib/plans";
import { cn } from "@/lib/cn";

/**
 * Full plan comparison, generated from src/lib/plans.ts so the
 * marketing table can never drift from the real feature gates.
 * Sticky header row (below the 72px fixed nav); the Professional
 * column carries a quiet tint as the recommended lane.
 */

type Cell = boolean | string;
type Row = { label: string; cells: [Cell, Cell, Cell]; note?: string };
type Group = { heading: string; rows: Row[] };

const p = PLANS;
const yes = true;
const no = false;

function gate(feature: keyof typeof p.starter.features): [Cell, Cell, Cell] {
  return [
    p.starter.features[feature],
    p.professional.features[feature],
    p.elite.features[feature],
  ];
}

const groups: Group[] = [
  {
    heading: "Usage & team",
    rows: [
      {
        label: "Team members",
        cells: [
          `Up to ${p.starter.maxEmployees}`,
          `Up to ${p.professional.maxEmployees}`,
          "Unlimited",
        ],
      },
      {
        label: "Services",
        cells: [`Up to ${p.starter.maxServices}`, "Unlimited", "Unlimited"],
      },
      { label: "Online bookings", cells: ["Unlimited", "Unlimited", "Unlimited"] },
      { label: "Staff calendars & dispatch board", cells: [yes, yes, yes] },
    ],
  },
  {
    heading: "Booking & communication",
    rows: [
      { label: "Embeddable booking widget", cells: gate("widget") },
      { label: "Hosted booking page", cells: [yes, yes, yes] },
      { label: "Email confirmations & reminders", cells: gate("email_notifications") },
      { label: "SMS reminders & two-way texting", cells: gate("sms_reminders") },
      { label: "No-double-booking guarantee", cells: [yes, yes, yes] },
    ],
  },
  {
    heading: "Payments & growth",
    rows: [
      { label: "Invoicing & deposits", cells: gate("invoicing") },
      { label: "Coupons & promotions", cells: gate("coupons") },
      { label: "Custom branding on widget & emails", cells: gate("custom_branding") },
      { label: "Revenue analytics", cells: [no, yes, yes] },
    ],
  },
  {
    heading: "Scale & support",
    rows: [
      { label: "Payroll & commission reports", cells: gate("payroll_reports") },
      { label: "API access & custom integrations", cells: gate("api_access") },
      { label: "Priority support", cells: gate("priority_support") },
      { label: "Email support", cells: [yes, yes, yes] },
      { label: "Free migration from another tool", cells: [no, yes, yes] },
    ],
  },
];

function CellContent({ value, popular }: { value: Cell; popular: boolean }) {
  if (typeof value === "string") {
    return (
      <span className={cn("text-[0.84rem] font-semibold", popular ? "text-navy-800" : "text-ink-muted")}>
        {value}
      </span>
    );
  }
  if (value) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        className={cn("mx-auto h-[18px] w-[18px]", popular ? "text-blue-700" : "text-blue-600")}
        role="img"
        aria-label="Included"
      >
        <path d="M5 13l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <span aria-label="Not included" className="text-[0.9rem] text-ink-faint/50">
      —
    </span>
  );
}

export function ComparisonTable() {
  const names = PLAN_ORDER.map((t) => PLANS[t]);

  return (
    <section className="bg-surface-alt pb-[clamp(80px,10vw,130px)]">
      <Container>
        <Reveal>
          <SectionHeading
            align="center"
            eyebrow="Compare plans"
            title={
              <>
                Every line item, <Em><span className="whitespace-nowrap">no fine print.</span></Em>
              </>
            }
            lede="The same gates the product enforces — straight from the source."
            className="mx-auto mb-[clamp(40px,5vw,56px)] max-w-[520px]"
          />
        </Reveal>

        <Reveal>
          <div className="mx-auto max-w-[980px] overflow-x-auto rounded-[var(--radius-lg)] border border-navy-900/8 bg-card shadow-lift">
            <table className="w-full min-w-[680px] border-collapse text-left">
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="sticky top-[72px] z-10 w-[34%] rounded-tl-[var(--radius-lg)] border-b border-line bg-card/95 px-6 py-5 text-[0.7rem] font-bold tracking-[0.16em] text-ink-faint uppercase backdrop-blur-[10px]"
                  >
                    What you get
                  </th>
                  {names.map((plan, i) => (
                    <th
                      key={plan.tier}
                      scope="col"
                      className={cn(
                        "sticky top-[72px] z-10 w-[22%] border-b border-line px-4 py-5 text-center backdrop-blur-[10px]",
                        plan.tier === "professional"
                          ? "bg-blue-50/90"
                          : "bg-card/95",
                        i === names.length - 1 && "rounded-tr-[var(--radius-lg)]",
                      )}
                    >
                      <div
                        className={cn(
                          "text-[0.78rem] font-bold tracking-[0.12em] uppercase",
                          plan.tier === "professional" ? "text-blue-700" : "text-ink",
                        )}
                      >
                        {plan.name}
                        {plan.tier === "professional" && (
                          <span className="mt-1 block text-[0.56rem] font-extrabold tracking-[0.14em] text-gold-700">
                            Most popular
                          </span>
                        )}
                      </div>
                      <div className="font-instrument mt-1 text-[1.1rem] font-bold tracking-[-0.02em] text-ink">
                        ${plan.priceMonthly}
                        <small className="text-[0.66rem] font-medium text-ink-faint">/mo</small>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              {groups.map((group) => (
                <tbody key={group.heading}>
                  <tr>
                    <th
                      scope="rowgroup"
                      colSpan={4}
                      className="border-b border-line bg-surface-alt/70 px-6 pt-5 pb-2.5 text-[0.66rem] font-bold tracking-[0.18em] text-blue-700 uppercase"
                    >
                      {group.heading}
                    </th>
                  </tr>
                  {group.rows.map((row) => (
                    <tr key={row.label} className="group/row">
                      <th
                        scope="row"
                        className="border-b border-line px-6 py-[15px] text-[0.88rem] font-medium text-ink transition-colors duration-[var(--duration-fast)] group-hover/row:bg-surface-alt/50"
                      >
                        {row.label}
                      </th>
                      {row.cells.map((cell, i) => (
                        <td
                          key={i}
                          className={cn(
                            "border-b border-line px-4 py-[15px] text-center transition-colors duration-[var(--duration-fast)] group-hover/row:bg-surface-alt/50",
                            PLAN_ORDER[i] === "professional" && "bg-blue-50/45",
                          )}
                        >
                          <CellContent
                            value={cell}
                            popular={PLAN_ORDER[i] === "professional"}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        </Reveal>

        <Reveal>
          <p className="mt-6 text-center text-[0.8rem] text-ink-faint">
            All prices in USD. Yearly billing takes two months off every tier.
          </p>
        </Reveal>
      </Container>
    </section>
  );
}
