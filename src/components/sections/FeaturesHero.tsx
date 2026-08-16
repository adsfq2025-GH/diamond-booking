import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Em } from "@/components/ui/SectionHeading";
import { Reveal } from "@/components/motion/Reveal";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";

const clusters = [
  { label: "Booking engine", href: "#booking-engine" },
  { label: "Dispatch & calendar", href: "#dispatch" },
  { label: "Payments & invoices", href: "#payments" },
  { label: "Customers & CRM", href: "#crm" },
  { label: "Team management", href: "#team" },
  { label: "Analytics & reports", href: "#analytics" },
  { label: "Marketing tools", href: "#marketing" },
  { label: "Booking widget", href: "#widget" },
];

export function FeaturesHero() {
  return (
    <section
      className="relative overflow-hidden bg-[radial-gradient(1000px_480px_at_78%_-12%,rgb(46_134_193/0.11),transparent_62%),linear-gradient(178deg,var(--surface-card)_0%,var(--surface)_70%,var(--surface-alt)_100%)] pt-[clamp(136px,16vh,184px)] pb-[clamp(64px,8vw,104px)]"
    >
      <div aria-hidden className="hero-dots pointer-events-none absolute inset-0" />
      <Container className="relative">
        <Reveal>
          <div className="max-w-[760px]">
            <Eyebrow>Features</Eyebrow>
            <h1 className="font-display mb-6 text-[length:var(--text-display-tight)] leading-[1.05] font-bold tracking-[-0.025em]">
              Eight systems, one login —{" "}
              <Em>nothing falls through.</Em>
            </h1>
            <p className="mb-9 max-w-[36em] text-[clamp(1.02rem,1.3vw,1.18rem)] leading-[1.7] font-light text-ink-muted">
              From the moment a customer finds an open slot to the moment the
              invoice settles, every step below is one connected system — built
              for crews in the field, not just the office.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Button href="/signup" variant="gold" arrow>
                Start your 7-day free trial
              </Button>
              <Button href="/pricing" variant="ghost">
                Compare plans
              </Button>
            </div>
          </div>
        </Reveal>

        <Stagger className="mt-[clamp(44px,5vw,60px)] flex flex-wrap gap-2.5 border-t border-line pt-8">
          {clusters.map((c) => (
            <StaggerItem key={c.href}>
              <Link
                href={c.href}
                className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-line-strong bg-card px-4 py-2 text-[0.8rem] font-semibold text-ink-muted transition-[border-color,color,transform] duration-[var(--duration-fast)] ease-[var(--ease-out-expo)] hover:-translate-y-0.5 hover:border-blue-600 hover:text-blue-600"
              >
                <span aria-hidden className="h-1.5 w-1.5 rotate-45 bg-blue-600/60" />
                {c.label}
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      </Container>
    </section>
  );
}
