import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { Reveal } from "@/components/motion/Reveal";
import { cn } from "@/lib/cn";

export function ClosingCta() {
  return (
    <section
      className={cn(
        "relative overflow-hidden text-center text-white",
        "bg-[linear-gradient(160deg,var(--navy-900)_0%,var(--navy-950)_62%)]",
        "[clip-path:polygon(0_0,100%_clamp(28px,4.5vw,64px),100%_100%,0_100%)]",
        "pt-[clamp(120px,14vw,190px)] pb-[clamp(100px,12vw,160px)]",
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(820px_460px_at_50%_0%,rgb(46_134_193/0.28),transparent_62%)]"
      />
      {/* faint diamond motif */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-[52%] left-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[48px] border border-white/5"
      />
      <Container className="relative max-w-[820px]">
        <Reveal>
          <Logo variant="dark" className="mx-auto mb-[38px] h-[52px]" />
        </Reveal>
        <Reveal delay={0.08}>
          <h2 className="font-display mb-[22px] text-[clamp(2.4rem,5vw,4.2rem)] leading-[1.04] font-bold tracking-[-0.035em] text-white">
            Your next 500,000 bookings
            <br />
            <span className="em-gold em-italic">start with one.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.16}>
          <p className="mx-auto mb-10 max-w-[34em] text-[1.08rem] font-light text-white/70">
            Join 3,000+ home service companies running on Diamond Booking.
            Seven days free — long enough to watch the first jobs book
            themselves.
          </p>
        </Reveal>
        <Reveal delay={0.24}>
          <div className="flex flex-wrap justify-center gap-4">
            <Button href="/signup" variant="gold" arrow>
              Start your free trial
            </Button>
            <Button href="/contact" variant="ghost-dark">
              Book a demo
            </Button>
          </div>
          <p className="mt-[26px] text-[0.8rem] text-white/40">
            7-day free trial · No credit card · Cancel anytime
          </p>
        </Reveal>
      </Container>
    </section>
  );
}
