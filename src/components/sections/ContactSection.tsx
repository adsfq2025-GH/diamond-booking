"use client";

import Link from "next/link";
import { useState } from "react";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Em } from "@/components/ui/SectionHeading";
import { Reveal } from "@/components/motion/Reveal";
import {
  Label,
  FieldError,
  SelectShell,
  inputBase,
  inputInvalid,
} from "@/components/ui/Field";
import { cn } from "@/lib/cn";

const businessTypes = [
  "Cleaning",
  "HVAC",
  "Plumbing",
  "Roofing",
  "Landscaping",
  "Electrical",
  "Pest Control",
  "Pool Care",
  "Window Washing",
  "Appliance Repair",
  "Other",
];

const faqLinks = [
  { label: "Billing & plan questions", href: "/pricing#billing-faq" },
  { label: "Product & switching questions", href: "/#faq" },
  { label: "The full feature tour", href: "/features" },
];

type Values = { name: string; email: string; business: string; message: string };
type Errors = Partial<Record<keyof Values, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validate(values: Values): Errors {
  const errors: Errors = {};
  if (!values.name.trim()) errors.name = "Tell us who to reply to.";
  if (!values.email.trim()) errors.email = "We need an email to write back.";
  else if (!EMAIL_RE.test(values.email.trim()))
    errors.email = "That email doesn't look complete — check for typos.";
  if (!values.business) errors.business = "Pick the closest match — it routes you to the right person.";
  if (!values.message.trim()) errors.message = "A sentence or two is plenty.";
  else if (values.message.trim().length < 12)
    errors.message = "A little more detail helps us give a real answer.";
  return errors;
}

function SuccessPanel({ email }: { email: string }) {
  return (
    <div
      role="status"
      className="flex h-full min-h-[420px] flex-col items-center justify-center px-8 py-12 text-center"
    >
      <span className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-success-50">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          className="h-7 w-7 text-success-700"
          aria-hidden
        >
          <path d="M4.5 12.5l5 5L20 6.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <h3 className="font-display mb-2.5 text-[1.4rem] font-bold tracking-[-0.02em]">
        Message on its way.
      </h3>
      <p className="max-w-[26em] text-[0.92rem] leading-[1.7] font-light text-ink-muted">
        Thanks — a real person will reply to{" "}
        <b className="font-semibold text-ink">{email}</b> within 4 business
        hours. If it&rsquo;s urgent, the fastest route is{" "}
        <a
          href="mailto:support@diamondbooking.com"
          className="font-semibold text-blue-600 hover:underline"
        >
          support@diamondbooking.com
        </a>
        .
      </p>
    </div>
  );
}

export function ContactSection() {
  const [values, setValues] = useState<Values>({
    name: "",
    email: "",
    business: "",
    message: "",
  });
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState<Partial<Record<keyof Values, boolean>>>({});
  const [sent, setSent] = useState(false);

  const set = (key: keyof Values) => (value: string) => {
    const next = { ...values, [key]: value };
    setValues(next);
    if (touched[key]) setErrors(validate(next));
  };

  const blur = (key: keyof Values) => () => {
    setTouched((t) => ({ ...t, [key]: true }));
    setErrors(validate(values));
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate(values);
    setErrors(errs);
    setTouched({ name: true, email: true, business: true, message: true });
    if (Object.keys(errs).length === 0) setSent(true);
  };

  const showError = (key: keyof Values) => touched[key] && errors[key];

  return (
    <section className="relative overflow-hidden bg-[radial-gradient(1000px_480px_at_80%_-10%,rgb(46_134_193/0.10),transparent_62%),linear-gradient(178deg,var(--surface-card)_0%,var(--surface)_62%,var(--surface-alt)_100%)] pt-[clamp(136px,16vh,184px)] pb-[clamp(80px,10vw,140px)]">
      <div aria-hidden className="hero-dots pointer-events-none absolute inset-0" />
      <Container className="relative grid items-start gap-[clamp(40px,5vw,80px)] min-[961px]:grid-cols-[1fr_1.1fr]">
        {/* ---- left: pitch + support info ---- */}
        <Reveal>
          <Eyebrow>Contact</Eyebrow>
          <h1 className="font-display mb-5 text-[length:var(--text-h1)] leading-[1.08] font-bold tracking-[-0.025em]">
            Talk to people who know{" "}
            <Em>the trade.</Em>
          </h1>
          <p className="mb-9 max-w-[32em] text-[1.02rem] leading-[1.75] font-light text-ink-muted">
            Sales questions, migration help, or a 20-minute demo — every
            message lands with someone who has set up a real service business
            on Diamond, not a ticket queue.
          </p>

          <div className="mb-9 flex flex-col gap-4">
            <div className="flex items-center gap-4 rounded-[14px] border border-line bg-card px-5 py-4 shadow-[0_1px_2px_rgb(12_36_64/0.04)]">
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[11px] bg-blue-50 text-blue-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden>
                  <path d="M4 6l8 6 8-6" strokeLinecap="round" strokeLinejoin="round" />
                  <rect x="4" y="5" width="16" height="14" rx="2.5" />
                </svg>
              </span>
              <div>
                <a
                  href="mailto:support@diamondbooking.com"
                  className="text-[0.95rem] font-bold text-ink transition-colors hover:text-blue-600"
                >
                  support@diamondbooking.com
                </a>
                <div className="text-[0.78rem] text-ink-faint">
                  Median first reply: under 4 business hours
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4 rounded-[14px] border border-line bg-card px-5 py-4 shadow-[0_1px_2px_rgb(12_36_64/0.04)]">
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[11px] bg-blue-50 text-blue-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3.5 2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <div>
                <div className="text-[0.95rem] font-bold text-ink">Mon–Fri, 8am–6pm CT</div>
                <div className="text-[0.78rem] text-ink-faint">
                  Existing customers on Elite get priority routing, 7 days a week
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-line pt-7">
            <div className="mb-3.5 text-[0.7rem] font-bold tracking-[0.16em] text-ink-faint uppercase">
              Answers you can grab right now
            </div>
            <ul className="flex flex-col gap-2.5">
              {faqLinks.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="inline-flex items-center gap-1.5 text-[0.9rem] font-semibold text-blue-600 transition-[gap] duration-[var(--duration-fast)] ease-[var(--ease-out-expo)] hover:gap-2.5"
                  >
                    {l.label} <span aria-hidden>→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>

        {/* ---- right: the form card ---- */}
        <Reveal delay={0.1}>
          <div className="overflow-hidden rounded-[20px] border border-navy-900/8 bg-card shadow-float">
            {sent ? (
              <SuccessPanel email={values.email.trim()} />
            ) : (
              <form noValidate onSubmit={onSubmit} className="p-[clamp(24px,3vw,36px)]">
                <div className="mb-6">
                  <h2 className="font-display text-[1.25rem] font-bold tracking-[-0.02em]">
                    Send us a message
                  </h2>
                  <p className="mt-1 text-[0.85rem] font-light text-ink-muted">
                    Every field helps us route you to the right human.
                  </p>
                </div>

                <div className="mb-5 grid gap-5 min-[521px]:grid-cols-2">
                  <div>
                    <Label htmlFor="contact-name">Your name</Label>
                    <input
                      id="contact-name"
                      name="name"
                      type="text"
                      autoComplete="name"
                      placeholder="Sarah Johnson"
                      value={values.name}
                      onChange={(e) => set("name")(e.target.value)}
                      onBlur={blur("name")}
                      aria-invalid={Boolean(showError("name"))}
                      aria-describedby={showError("name") ? "contact-name-error" : undefined}
                      className={cn(inputBase, showError("name") && inputInvalid)}
                    />
                    <FieldError id="contact-name-error">{showError("name")}</FieldError>
                  </div>
                  <div>
                    <Label htmlFor="contact-email">Work email</Label>
                    <input
                      id="contact-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      placeholder="sarah@cleansweep.com"
                      value={values.email}
                      onChange={(e) => set("email")(e.target.value)}
                      onBlur={blur("email")}
                      aria-invalid={Boolean(showError("email"))}
                      aria-describedby={showError("email") ? "contact-email-error" : undefined}
                      className={cn(inputBase, showError("email") && inputInvalid)}
                    />
                    <FieldError id="contact-email-error">{showError("email")}</FieldError>
                  </div>
                </div>

                <div className="mb-5">
                  <Label htmlFor="contact-business">Business type</Label>
                  <SelectShell>
                    <select
                      id="contact-business"
                      name="business"
                      value={values.business}
                      onChange={(e) => {
                        set("business")(e.target.value);
                        setTouched((t) => ({ ...t, business: true }));
                      }}
                      onBlur={blur("business")}
                      aria-invalid={Boolean(showError("business"))}
                      aria-describedby={showError("business") ? "contact-business-error" : undefined}
                      className={cn(
                        inputBase,
                        "cursor-pointer appearance-none pr-9",
                        !values.business && "text-ink-faint/80",
                        showError("business") && inputInvalid,
                      )}
                    >
                      <option value="" disabled>
                        Select your vertical…
                      </option>
                      {businessTypes.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </SelectShell>
                  <FieldError id="contact-business-error">{showError("business")}</FieldError>
                </div>

                <div className="mb-7">
                  <Label htmlFor="contact-message" hint="A sentence or two is plenty">
                    How can we help?
                  </Label>
                  <textarea
                    id="contact-message"
                    name="message"
                    rows={5}
                    placeholder="We're a 6-tech HVAC company on paper schedules and we'd like to see the dispatch board…"
                    value={values.message}
                    onChange={(e) => set("message")(e.target.value)}
                    onBlur={blur("message")}
                    aria-invalid={Boolean(showError("message"))}
                    aria-describedby={showError("message") ? "contact-message-error" : undefined}
                    className={cn(inputBase, "resize-y", showError("message") && inputInvalid)}
                  />
                  <FieldError id="contact-message-error">{showError("message")}</FieldError>
                </div>

                <Button type="submit" variant="gold" className="w-full" arrow>
                  Send message
                </Button>
                <p className="mt-4 text-center text-[0.75rem] text-ink-faint">
                  We reply to every message — usually within 4 business hours.
                </p>
              </form>
            )}
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
