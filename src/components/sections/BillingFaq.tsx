"use client";

import { useState } from "react";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Em } from "@/components/ui/SectionHeading";
import { Reveal } from "@/components/motion/Reveal";
import { cn } from "@/lib/cn";

const items = [
  {
    q: "What exactly happens after the 7-day trial?",
    a: "You pick a plan or you walk away. We don't take a card up front, so nothing is charged automatically. If you do nothing, the account pauses — your data stays exportable for 90 days.",
  },
  {
    q: "Can I switch plans mid-cycle?",
    a: "Anytime. Upgrades apply immediately and we prorate the difference; downgrades take effect at the next billing date so you never lose time you've paid for.",
  },
  {
    q: "How does yearly billing work?",
    a: "You pay for 10 months and get 12 — two months free on every tier. If you cancel a yearly plan early, we refund the unused full months, no questions asked.",
  },
  {
    q: "Who counts as a team member?",
    a: "Anyone with a login: owners, office staff, and field technicians. Customers booking through your widget are never a seat — those are unlimited on every plan.",
  },
  {
    q: "Are there payment processing fees?",
    a: "Card payments run through Stripe at their standard processing rates. Diamond adds no markup on top — your plan price is the only thing we charge.",
  },
  {
    q: "How do I cancel?",
    a: "One click in Settings → Billing, effective at the end of the paid period. Export your customers, bookings, and invoices as CSV at any time — your data is yours.",
  },
];

export function BillingFaq() {
  const [open, setOpen] = useState<number>(0);

  return (
    <section id="billing-faq" className="scroll-mt-24 bg-surface py-[clamp(80px,10vw,130px)]">
      <Container className="grid items-start gap-[clamp(36px,5vw,72px)] min-[901px]:grid-cols-[1fr_1.2fr]">
        <Reveal>
          <Eyebrow>Billing questions</Eyebrow>
          <h2 className="font-display mb-4 text-[length:var(--text-h2-lg)] leading-[1.12] font-bold tracking-[-0.03em]">
            The money part, <Em>answered.</Em>
          </h2>
          <p className="mb-[26px] font-light text-ink-muted">
            Trials, proration, refunds, and seats — the questions every owner
            asks before entering a card number.
          </p>
          <Button href="/contact" variant="ghost" arrow>
            Ask us directly
          </Button>
        </Reveal>

        <Reveal>
          <div>
            {items.map((item, i) => {
              const isOpen = open === i;
              return (
                <div key={item.q} className="border-b border-line">
                  <h3>
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={`billing-faq-panel-${i}`}
                      id={`billing-faq-trigger-${i}`}
                      onClick={() => setOpen(isOpen ? -1 : i)}
                      className={cn(
                        "flex w-full cursor-pointer items-center justify-between gap-5 py-[22px] text-left",
                        "text-base font-semibold tracking-[-0.01em] text-ink",
                        "transition-colors duration-[var(--duration-fast)] hover:text-blue-600",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600",
                      )}
                    >
                      {item.q}
                      <span
                        aria-hidden
                        className={cn(
                          "flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full border border-navy-900/16 text-base font-normal text-blue-600",
                          "transition-[transform,background-color] duration-[var(--duration-base)] ease-[var(--ease-out-expo)]",
                          isOpen && "rotate-45 bg-blue-50",
                        )}
                      >
                        +
                      </span>
                    </button>
                  </h3>
                  <div
                    id={`billing-faq-panel-${i}`}
                    role="region"
                    aria-labelledby={`billing-faq-trigger-${i}`}
                    className={cn(
                      "grid transition-[grid-template-rows] duration-[var(--duration-base)] ease-[var(--ease-out-expo)]",
                      isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                    )}
                  >
                    <div className="overflow-hidden">
                      <p className="pr-10 pb-6 text-[0.94rem] leading-[1.7] font-light text-ink-muted">
                        {item.a}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
