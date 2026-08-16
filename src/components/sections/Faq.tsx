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
    q: "How fast can we go live?",
    a: "Most businesses take their first online booking within a day. Import your customers, set your services and service areas, drop the widget on your site — done. Migration from another tool is handled by our team on Professional and Enterprise.",
  },
  {
    q: "Does it work with my existing website?",
    a: "Yes. The booking widget embeds in any site — WordPress, Squarespace, Wix, custom builds — with one snippet. No website? Every account includes a hosted booking page.",
  },
  {
    q: "What happens after the 7-day trial?",
    a: "You pick a plan or walk away — no card required up front, nothing charged automatically. Your data stays exportable either way.",
  },
  {
    q: "Can customers pay when they book?",
    a: "On Professional and above, you can require deposits at booking and charge the balance on completion. Funds settle to your bank on a rolling basis.",
  },
];

export function Faq() {
  const [open, setOpen] = useState<number>(0);

  return (
    <section id="faq" className="bg-surface py-[clamp(80px,10vw,130px)]">
      <Container className="grid items-start gap-[clamp(36px,5vw,72px)] min-[901px]:grid-cols-[1fr_1.2fr]">
        <Reveal>
          <Eyebrow>Questions</Eyebrow>
          <h2 className="font-display mb-4 text-[length:var(--text-h2-lg)] leading-[1.12] font-bold tracking-[-0.03em]">
            Before you <Em>switch.</Em>
          </h2>
          <p className="mb-[26px] font-light text-ink-muted">
            The short answers. Our team covers the long ones on a 20-minute
            call.
          </p>
          <Button href="/contact" variant="ghost" arrow>
            Talk to sales
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
                      aria-controls={`faq-panel-${i}`}
                      id={`faq-trigger-${i}`}
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
                    id={`faq-panel-${i}`}
                    role="region"
                    aria-labelledby={`faq-trigger-${i}`}
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
