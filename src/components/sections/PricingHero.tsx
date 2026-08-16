"use client";

import { useState } from "react";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { SectionHeading, Em } from "@/components/ui/SectionHeading";
import { Reveal } from "@/components/motion/Reveal";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { PLANS, PLAN_ORDER } from "@/lib/plans";
import { cn } from "@/lib/cn";

/**
 * Full pricing hero: billing toggle (monthly / yearly = 2 months free)
 * + the three tiers from src/lib/plans.ts, in the landing card style.
 */

function yearlyMonthlyEquivalent(monthly: number) {
  // Yearly = 10 × monthly (2 months free); shown as a monthly equivalent.
  return Math.round((monthly * 10) / 12);
}

function Check({ gold = false }: { gold?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      className={cn("mt-[3px] h-4 w-4 flex-none", gold ? "text-gold-500" : "text-blue-600")}
      aria-hidden
    >
      <path d="M5 13l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PricingHero() {
  const [yearly, setYearly] = useState(false);

  return (
    <section className="relative overflow-hidden bg-[radial-gradient(1000px_460px_at_50%_-14%,rgb(46_134_193/0.10),transparent_62%),linear-gradient(180deg,var(--surface-card)_0%,var(--surface)_55%,var(--surface-alt)_100%)] pt-[clamp(136px,16vh,184px)] pb-[clamp(72px,9vw,120px)]">
      <div aria-hidden className="hero-dots pointer-events-none absolute inset-0" />
      <Container className="relative">
        <Reveal>
          <SectionHeading
            as="h1"
            align="center"
            eyebrow="Pricing"
            title={
              <>
                Three plans. Seven free days. <Em>No surprises.</Em>
              </>
            }
            lede="Every plan starts with a 7-day free trial — no credit card, no setup fees, no contracts. Pick a lane now, change it whenever the business changes."
            className="mx-auto mb-[clamp(36px,4vw,48px)] max-w-[600px]"
          />
        </Reveal>

        {/* billing toggle */}
        <Reveal delay={0.08}>
          <div className="mb-[clamp(40px,5vw,56px)] flex justify-center">
            <div
              role="group"
              aria-label="Billing period"
              className="relative inline-flex items-center gap-1 rounded-[var(--radius-pill)] border border-line-strong bg-card p-1 shadow-[0_1px_2px_rgb(12_36_64/0.05)]"
            >
              {(
                [
                  { key: false, label: "Monthly" },
                  { key: true, label: "Yearly" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  aria-pressed={yearly === opt.key}
                  onClick={() => setYearly(opt.key)}
                  className={cn(
                    "relative cursor-pointer rounded-[var(--radius-pill)] px-5 py-2 text-[0.85rem] font-semibold",
                    "transition-[background-color,color,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-out-expo)]",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600",
                    yearly === opt.key
                      ? "bg-navy-800 text-white shadow-[0_2px_8px_rgb(12_36_64/0.25)]"
                      : "text-ink-muted hover:text-ink",
                  )}
                >
                  {opt.label}
                  {opt.key && (
                    <span
                      className={cn(
                        "ml-2 rounded-[var(--radius-pill)] px-2 py-[2px] text-[0.6rem] font-extrabold tracking-[0.06em] uppercase",
                        yearly
                          ? "bg-gold-500 text-navy-950"
                          : "bg-gold-100 text-gold-700",
                      )}
                    >
                      2 months free
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </Reveal>

        <Stagger className="mx-auto grid max-w-[460px] items-stretch gap-[22px] min-[961px]:max-w-[1080px] min-[961px]:grid-cols-[1fr_1.15fr_1fr]">
          {PLAN_ORDER.map((tier) => {
            const plan = PLANS[tier];
            const popular = tier === "professional";
            const price = yearly
              ? yearlyMonthlyEquivalent(plan.priceMonthly)
              : plan.priceMonthly;
            return (
              <StaggerItem
                key={tier}
                className={cn("min-w-0", popular && "max-[960px]:order-first")}
              >
                <div
                  className={cn(
                    "relative flex h-full flex-col rounded-[20px] border px-[34px] py-[38px]",
                    "transition-[transform,box-shadow] duration-[var(--duration-base)] ease-[var(--ease-out-expo)]",
                    popular
                      ? "border-navy-700 bg-[linear-gradient(165deg,var(--navy-700)_0%,var(--navy-950)_100%)] text-white shadow-float hover:-translate-y-1.5 min-[961px]:-translate-y-3.5 min-[961px]:hover:-translate-y-5"
                      : "border-navy-900/10 bg-card hover:-translate-y-1.5 hover:shadow-lift",
                  )}
                >
                  {popular && (
                    <span className="absolute -top-[13px] left-1/2 -translate-x-1/2 rounded-[var(--radius-pill)] bg-[linear-gradient(180deg,var(--gold-400),var(--gold-500))] px-4 py-1.5 text-[0.64rem] font-extrabold tracking-[0.12em] whitespace-nowrap text-navy-950 uppercase shadow-[0_6px_16px_rgb(244_185_66/0.4)]">
                      Most popular
                    </span>
                  )}
                  <div
                    className={cn(
                      "mb-3.5 text-[0.78rem] font-bold tracking-[0.16em] uppercase",
                      popular ? "text-blue-300" : "text-ink-faint",
                    )}
                  >
                    {plan.name}
                  </div>
                  <div className="font-instrument text-[3rem] leading-none font-bold tracking-[-0.04em]">
                    ${price}
                    <small
                      className={cn(
                        "ml-0.5 text-[0.9rem] font-medium tracking-normal",
                        popular ? "text-white/60" : "text-ink-faint",
                      )}
                    >
                      /month
                    </small>
                  </div>
                  <div
                    className={cn(
                      "mt-2 text-[0.74rem] font-medium",
                      popular ? "text-white/55" : "text-ink-faint",
                    )}
                  >
                    {yearly
                      ? `Billed yearly — $${(plan.priceMonthly * 10).toLocaleString()}/yr (2 months free)`
                      : "Billed monthly · cancel anytime"}
                  </div>
                  <p
                    className={cn(
                      "mt-3.5 mb-[26px] text-[0.88rem] leading-[1.6] font-light",
                      popular ? "text-white/72" : "text-ink-muted",
                    )}
                  >
                    {plan.description}
                  </p>
                  <ul className="mb-8 flex flex-col gap-3">
                    {plan.highlights.map((feature) => (
                      <li
                        key={feature}
                        className={cn(
                          "flex items-start gap-[11px] text-[0.88rem] leading-[1.5]",
                          popular ? "text-white/72" : "text-ink-muted",
                        )}
                      >
                        <Check gold={popular} />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Button
                    href="/signup"
                    variant={popular ? "gold" : "navy"}
                    className="mt-auto w-full"
                  >
                    Start free trial
                  </Button>
                </div>
              </StaggerItem>
            );
          })}
        </Stagger>

        <Reveal>
          <p className="mt-[34px] text-center text-[length:var(--text-small)] text-ink-faint">
            Businesses on Diamond grow{" "}
            <b className="font-semibold text-ink-muted">40% on average in their first year</b>.
            Your trial starts the clock.
          </p>
        </Reveal>
      </Container>
    </section>
  );
}
