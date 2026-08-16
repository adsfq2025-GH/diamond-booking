import { Container } from "@/components/ui/Container";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Reveal } from "@/components/motion/Reveal";
import { cn } from "@/lib/cn";

const sideQuotes = [
  {
    quote:
      "“The reminder sequences alone changed my practice. No-shows went from a weekly tax to a rare event — my calendar finally reflects reality.”",
    initials: "MC",
    name: "Michael Chase",
    role: "Licensed Massage Therapist",
    avatar: "bg-[linear-gradient(140deg,var(--gold-500),var(--gold-600))]",
  },
  {
    quote:
      "“Emergency calls used to blow up our whole day. Now urgent jobs drop into live routes with automatic ETAs, and customers stop calling to ask where we are.”",
    initials: "DM",
    name: "David Martinez",
    role: "Operations Lead, NorthStar Plumbing",
    avatar: "bg-[linear-gradient(140deg,var(--navy-600),var(--navy-900))]",
  },
];

export function Testimonials() {
  return (
    <section className="border-t border-line bg-card py-[clamp(88px,11vw,150px)]">
      <Container>
        <Reveal>
          <Eyebrow>From the field</Eyebrow>
        </Reveal>
        <div className="grid gap-[clamp(32px,4vw,56px)] min-[901px]:grid-cols-[1.2fr_1fr]">
          <Reveal>
            <blockquote className="font-instrument text-[clamp(1.5rem,2.6vw,2.15rem)] leading-[1.32] font-medium tracking-[-0.025em] text-navy-700">
              “We stopped losing jobs to voicemail. Bookings come in overnight,
              deposits are already paid, and my crews start the day{" "}
              <span className="em-blue em-italic">
                with a full, routed schedule.
              </span>{" "}
              Diamond runs the office so I can run the business.”
            </blockquote>
            <div className="mt-[34px] flex items-center gap-4">
              <span className="flex h-13 w-13 flex-none items-center justify-center rounded-full bg-[linear-gradient(140deg,var(--blue-600),var(--navy-600))] text-base font-bold text-white">
                SJ
              </span>
              <div>
                <b className="block text-[0.95rem] tracking-[-0.01em]">
                  Sarah Johnson
                </b>
                <span className="text-[0.8rem] text-ink-faint">
                  Owner, Clean Sweep Services
                </span>
              </div>
            </div>
          </Reveal>
          <div className="flex flex-col justify-center gap-[18px]">
            {sideQuotes.map((t, i) => (
              <Reveal key={t.initials} delay={i * 0.1}>
                <div
                  className={cn(
                    "rounded-2xl border border-line bg-surface px-7 py-[26px]",
                    "transition-[transform,box-shadow] duration-[var(--duration-base)] ease-[var(--ease-out-expo)]",
                    "hover:-translate-y-1 hover:shadow-lift",
                  )}
                >
                  <p className="mb-4 text-[0.95rem] leading-[1.65] text-ink-muted">
                    {t.quote}
                  </p>
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "flex h-[38px] w-[38px] flex-none items-center justify-center rounded-full text-[0.75rem] font-bold text-white",
                        t.avatar,
                      )}
                    >
                      {t.initials}
                    </span>
                    <div>
                      <b className="block text-[0.85rem]">{t.name}</b>
                      <span className="text-[0.74rem] text-ink-faint">
                        {t.role}
                      </span>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
