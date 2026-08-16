import { Container } from "@/components/ui/Container";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Em } from "@/components/ui/SectionHeading";
import { Reveal } from "@/components/motion/Reveal";

/**
 * Shared legal-document layout: display headline (one emphasized
 * phrase, per the headline system), a narrow reading measure, and a
 * sticky table of contents on desktop. Content is passed in as
 * structured sections so privacy + terms stay consistent.
 */

export type LegalSection = {
  id: string;
  heading: string;
  paragraphs: React.ReactNode[];
};

export function LegalPage({
  eyebrow,
  title,
  emphasis,
  docName,
  updated,
  intro,
  sections,
}: {
  eyebrow: string;
  /** Headline before the emphasized phrase. */
  title: string;
  /** The single emphasized phrase (rendered via <Em>). */
  emphasis: string;
  docName: string;
  updated: string;
  intro: React.ReactNode;
  sections: LegalSection[];
}) {
  return (
    <>
      {/* header band */}
      <section className="relative overflow-hidden bg-[radial-gradient(900px_420px_at_70%_-14%,rgb(46_134_193/0.09),transparent_62%),linear-gradient(178deg,var(--surface-card)_0%,var(--surface)_100%)] pt-[clamp(132px,15vh,176px)] pb-[clamp(44px,5vw,64px)]">
        <div aria-hidden className="hero-dots pointer-events-none absolute inset-0" />
        <Container className="relative">
          <Reveal>
            <div className="max-w-[720px]">
              <Eyebrow>{eyebrow}</Eyebrow>
              <h1 className="font-display mb-5 text-[length:var(--text-h1)] leading-[1.08] font-bold tracking-[-0.025em]">
                {title} <Em>{emphasis}</Em>
              </h1>
              <p className="max-w-[38em] text-[0.98rem] leading-[1.75] font-light text-ink-muted">
                {intro}
              </p>
              {/* Subtle doc meta — template status kept honest but quiet. */}
              <p className="mt-5 text-[0.78rem] tracking-[0.02em] text-ink-faint">
                {docName} · Last updated {updated} · Template pending legal review
              </p>
            </div>
          </Reveal>
        </Container>
      </section>

      {/* body: sticky TOC + article */}
      <section className="border-t border-line bg-surface pt-[clamp(40px,5vw,64px)] pb-[clamp(80px,10vw,130px)]">
        <Container className="grid items-start gap-[clamp(36px,4vw,72px)] min-[961px]:grid-cols-[240px_minmax(0,1fr)]">
          <nav
            aria-label="On this page"
            className="sticky top-[104px] hidden min-[961px]:block"
          >
            <div className="mb-4 text-[0.66rem] font-bold tracking-[0.18em] text-ink-faint uppercase">
              On this page
            </div>
            <ol className="flex flex-col gap-[3px] border-l border-line">
              {sections.map((s, i) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="-ml-px flex items-baseline gap-2.5 border-l-2 border-transparent py-[7px] pl-4 text-[0.82rem] leading-[1.4] text-ink-muted transition-[color,border-color] duration-[var(--duration-fast)] hover:border-blue-600 hover:text-blue-600"
                  >
                    <span className="font-instrument text-[0.68rem] font-semibold text-ink-faint/70">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {s.heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <article className="min-w-0 max-w-[68ch]">
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} className="scroll-mt-28">
                <h2 className="font-display mt-[clamp(36px,4vw,52px)] mb-4 flex items-baseline gap-3 text-[1.3rem] leading-[1.25] font-bold tracking-[-0.02em] first:mt-0">
                  <span className="font-instrument text-[0.85rem] font-semibold text-blue-600/60">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {s.heading}
                </h2>
                {s.paragraphs.map((para, j) => (
                  <p
                    key={j}
                    className="mb-4 text-[0.94rem] leading-[1.85] font-light text-ink-muted"
                  >
                    {para}
                  </p>
                ))}
              </section>
            ))}

            <div className="mt-[clamp(40px,5vw,56px)] rounded-[14px] border border-line bg-surface-alt px-6 py-5 text-[0.85rem] leading-[1.7] text-ink-muted">
              Questions about this document? Write to{" "}
              <a
                href="mailto:legal@diamondbooking.com"
                className="font-semibold text-blue-600 hover:underline"
              >
                legal@diamondbooking.com
              </a>{" "}
              — a person reads every message.
            </div>
          </article>
        </Container>
      </section>
    </>
  );
}
