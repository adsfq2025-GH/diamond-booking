import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { SectionHeading, Em } from "@/components/ui/SectionHeading";
import { Reveal } from "@/components/motion/Reveal";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { cn } from "@/lib/cn";

type Plan = {
  name: string;
  price: string;
  desc: string;
  features: string[];
  popular?: boolean;
};

const plans: Plan[] = [
  {
    name: "Starter",
    price: "$29",
    desc: "For solo operators and new businesses taking their first online bookings.",
    features: [
      "Unlimited online bookings",
      "Embeddable booking widget",
      "Email confirmations & reminders",
      "1 staff calendar",
    ],
  },
  {
    name: "Professional",
    price: "$59",
    desc: "For growing teams that live by the schedule — the plan most of our 3,000+ businesses run on.",
    popular: true,
    features: [
      "Everything in Starter",
      "SMS reminders & two-way texting",
      "Up to 10 staff calendars & dispatch",
      "Deposits & card-on-file payments",
      "Revenue analytics",
    ],
  },
  {
    name: "Enterprise",
    price: "$119",
    desc: "For multi-crew and multi-location operations that need control at scale.",
    features: [
      "Everything in Professional",
      "Unlimited staff & locations",
      "API access & custom integrations",
      "Dedicated success manager",
    ],
  },
];

function Check({ gold = false }: { gold?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      className={cn(
        "mt-[3px] h-4 w-4 flex-none",
        gold ? "text-gold-500" : "text-blue-600",
      )}
      aria-hidden
    >
      <path d="M5 13l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Pricing() {
  return (
    <section
      id="pricing"
      className="bg-[linear-gradient(180deg,var(--surface)_0%,var(--surface-alt)_100%)] pt-[clamp(96px,12vw,160px)] pb-[clamp(80px,10vw,130px)]"
    >
      <Container>
        <Reveal>
          <SectionHeading
            align="center"
            eyebrow="Pricing"
            title={
              <>
                Pays for itself by the <Em>second booking.</Em>
              </>
            }
            lede="Every plan starts with a 7-day free trial. No setup fees, no contracts, cancel anytime."
            className="mx-auto mb-[clamp(48px,6vw,72px)] max-w-[560px]"
          />
        </Reveal>

        <Stagger className="mx-auto grid max-w-[460px] items-stretch gap-[22px] min-[961px]:max-w-[1080px] min-[961px]:grid-cols-[1fr_1.15fr_1fr]">
          {plans.map((plan) => (
            <StaggerItem
              key={plan.name}
              className={cn("min-w-0", plan.popular && "max-[960px]:order-first")}
            >
              <div
                className={cn(
                  "relative flex h-full flex-col rounded-[20px] border px-[34px] py-[38px]",
                  "transition-[transform,box-shadow] duration-[var(--duration-base)] ease-[var(--ease-out-expo)]",
                  plan.popular
                    ? "border-navy-700 bg-[linear-gradient(165deg,var(--navy-700)_0%,var(--navy-950)_100%)] text-white shadow-float hover:-translate-y-1.5 min-[961px]:-translate-y-3.5 min-[961px]:hover:-translate-y-5"
                    : "border-navy-900/10 bg-card hover:-translate-y-1.5 hover:shadow-lift",
                )}
              >
                {plan.popular && (
                  <span className="absolute -top-[13px] left-1/2 -translate-x-1/2 rounded-[var(--radius-pill)] bg-[linear-gradient(180deg,var(--gold-400),var(--gold-500))] px-4 py-1.5 text-[0.64rem] font-extrabold tracking-[0.12em] whitespace-nowrap text-navy-950 uppercase shadow-[0_6px_16px_rgb(244_185_66/0.4)]">
                    Most popular
                  </span>
                )}
                <div
                  className={cn(
                    "mb-3.5 text-[0.78rem] font-bold tracking-[0.16em] uppercase",
                    plan.popular ? "text-blue-300" : "text-ink-faint",
                  )}
                >
                  {plan.name}
                </div>
                <div className="font-instrument text-[3rem] leading-none font-bold tracking-[-0.04em]">
                  {plan.price}
                  <small
                    className={cn(
                      "ml-0.5 text-[0.9rem] font-medium tracking-normal",
                      plan.popular ? "text-white/60" : "text-ink-faint",
                    )}
                  >
                    /month
                  </small>
                </div>
                <p
                  className={cn(
                    "mt-3.5 mb-[26px] text-[0.88rem] leading-[1.6] font-light",
                    plan.popular ? "text-white/72" : "text-ink-muted",
                  )}
                >
                  {plan.desc}
                </p>
                <ul className="mb-8 flex flex-col gap-3">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className={cn(
                        "flex items-start gap-[11px] text-[0.88rem] leading-[1.5]",
                        plan.popular ? "text-white/72" : "text-ink-muted",
                      )}
                    >
                      <Check gold={plan.popular} />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button
                  href="/signup"
                  variant={plan.popular ? "gold" : "navy"}
                  className="mt-auto w-full"
                >
                  Start free trial
                </Button>
              </div>
            </StaggerItem>
          ))}
        </Stagger>

        <Reveal>
          <p className="mt-[34px] text-center text-[length:var(--text-small)] text-ink-faint">
            Businesses on Diamond grow{" "}
            <b className="font-semibold text-ink-muted">
              40% on average in their first year
            </b>
            . Your trial starts the clock.
          </p>
        </Reveal>
      </Container>
    </section>
  );
}
