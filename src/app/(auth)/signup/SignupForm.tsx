"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Em } from "@/components/ui/SectionHeading";
import {
  Label,
  FieldError,
  SelectShell,
  inputBase,
  inputInvalid,
} from "@/components/ui/Field";
import {
  AuthCard,
  AuthError,
  AuthNotice,
  Spinner,
  supabaseConfigured,
  useConnectPhase,
} from "../auth-ui";
import { signUp, type AuthFormState } from "@/lib/actions/auth";
import { passwordScore } from "@/lib/password";
import { cn } from "@/lib/cn";

const industries = [
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
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Values = {
  business: string;
  name: string;
  email: string;
  password: string;
  industry: string;
  terms: boolean;
};

type Errors = Partial<Record<keyof Values, string>>;

const strength: Record<number, { label: string; cls: string; hint: string }> = {
  0: { label: "", cls: "", hint: "8+ characters. Adding a number gets you to Good." },
  1: { label: "Too short", cls: "bg-[#c9903a]", hint: "Keep going — 8+ characters with a number is Good." },
  2: { label: "Okay", cls: "bg-gold-500", hint: "Add a number or make it longer for a stronger password." },
  3: { label: "Good", cls: "bg-blue-500", hint: "Solid. Mixed case or a symbol makes it Strong." },
  4: { label: "Strong", cls: "bg-success-500", hint: "Great password — hard to guess, easy to keep." },
};

function validate(v: Values): Errors {
  const errors: Errors = {};
  if (!v.business.trim()) errors.business = "What's the business called?";
  if (!v.name.trim()) errors.name = "Tell us your name.";
  if (!v.email.trim()) errors.email = "You'll sign in with this email.";
  else if (!EMAIL_RE.test(v.email.trim()))
    errors.email = "That email doesn't look complete — check for typos.";
  if (!v.password) errors.password = "Choose a password.";
  else if (passwordScore(v.password) < 2)
    errors.password = "Use at least 8 characters — a number helps too.";
  if (!v.industry) errors.industry = "Pick the closest vertical — it tailors your setup.";
  if (!v.terms) errors.terms = "Please accept the terms to create your account.";
  return errors;
}

export function SignupForm() {
  const [values, setValues] = useState<Values>({
    business: "",
    name: "",
    email: "",
    password: "",
    industry: "",
    terms: false,
  });
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState<Partial<Record<keyof Values, boolean>>>({});
  const { phase, begin } = useConnectPhase();
  const [state, formAction, isPending] = useActionState<AuthFormState, FormData>(
    signUp,
    null,
  );
  const configured = supabaseConfigured();
  const busy = isPending || phase === "connecting";

  const score = passwordScore(values.password);
  const meter = strength[score];

  const set = <K extends keyof Values>(key: K, value: Values[K]) => {
    const next = { ...values, [key]: value };
    setValues(next);
    if (touched[key]) setErrors(validate(next));
  };

  const blur = (key: keyof Values) => () => {
    setTouched((t) => ({ ...t, [key]: true }));
    setErrors(validate(values));
  };

  const showError = (key: keyof Values) => (touched[key] ? errors[key] : undefined);

  const onSubmit = (e: React.FormEvent) => {
    const errs = validate(values);
    setErrors(errs);
    setTouched({
      business: true,
      name: true,
      email: true,
      password: true,
      industry: true,
      terms: true,
    });
    if (Object.keys(errs).length > 0) {
      e.preventDefault();
      return;
    }
    if (!configured) {
      // Placeholder mode: keep the designed fake phase + notice.
      e.preventDefault();
      if (phase === "idle") begin();
    }
  };

  return (
    <AuthCard wide>
      <div className="mb-7">
        <span className="mb-3.5 inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-gold-100 px-3 py-[5px] text-[0.64rem] font-bold tracking-[0.1em] text-gold-700 uppercase">
          <span aria-hidden className="h-1.5 w-1.5 rotate-45 bg-gold-500" />
          7-day free trial · No credit card
        </span>
        <h1 className="font-display mb-1.5 text-[1.6rem] leading-[1.15] font-bold tracking-[-0.02em]">
          Seven free days, <Em>starting now.</Em>
        </h1>
        <p className="text-[0.88rem] font-light text-ink-muted">
          Most businesses take their first online booking before the trial is
          half over. Nothing is charged when it ends.
        </p>
      </div>

      <AuthError>{state?.error}</AuthError>

      <form noValidate action={formAction} onSubmit={onSubmit}>
        <div className="mb-5 grid gap-5 min-[521px]:grid-cols-2">
          <div>
            <Label htmlFor="signup-business">Business name</Label>
            <input
              id="signup-business"
              name="organization"
              type="text"
              autoComplete="organization"
              placeholder="Clean Sweep Services"
              value={values.business}
              onChange={(e) => set("business", e.target.value)}
              onBlur={blur("business")}
              aria-invalid={Boolean(showError("business"))}
              aria-describedby={showError("business") ? "signup-business-error" : undefined}
              className={cn(inputBase, showError("business") && inputInvalid)}
            />
            <FieldError id="signup-business-error">{showError("business")}</FieldError>
          </div>
          <div>
            <Label htmlFor="signup-name">Your name</Label>
            <input
              id="signup-name"
              name="name"
              type="text"
              autoComplete="name"
              placeholder="Sarah Johnson"
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
              onBlur={blur("name")}
              aria-invalid={Boolean(showError("name"))}
              aria-describedby={showError("name") ? "signup-name-error" : undefined}
              className={cn(inputBase, showError("name") && inputInvalid)}
            />
            <FieldError id="signup-name-error">{showError("name")}</FieldError>
          </div>
        </div>

        <div className="mb-5">
          <Label htmlFor="signup-email">Work email</Label>
          <input
            id="signup-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="sarah@cleansweep.com"
            value={values.email}
            onChange={(e) => set("email", e.target.value)}
            onBlur={blur("email")}
            aria-invalid={Boolean(showError("email"))}
            aria-describedby={showError("email") ? "signup-email-error" : undefined}
            className={cn(inputBase, showError("email") && inputInvalid)}
          />
          <FieldError id="signup-email-error">{showError("email")}</FieldError>
        </div>

        <div className="mb-5">
          <Label htmlFor="signup-password">Password</Label>
          <input
            id="signup-password"
            name="new-password"
            type="password"
            autoComplete="new-password"
            placeholder="10+ characters is a great habit"
            value={values.password}
            onChange={(e) => set("password", e.target.value)}
            onBlur={blur("password")}
            aria-invalid={Boolean(showError("password"))}
            aria-describedby={
              showError("password") ? "signup-password-error" : "signup-password-hint"
            }
            className={cn(inputBase, showError("password") && inputInvalid)}
          />
          {/* strength meter */}
          <div className="mt-2.5 flex items-center gap-2.5">
            <div className="flex flex-1 gap-1.5" aria-hidden>
              {[1, 2, 3, 4].map((step) => (
                <span
                  key={step}
                  className={cn(
                    "h-[5px] flex-1 rounded-full transition-colors duration-[var(--duration-fast)]",
                    score >= step ? meter.cls : "bg-line",
                  )}
                />
              ))}
            </div>
            {meter.label && (
              <span
                className={cn(
                  "text-[0.7rem] font-bold tracking-[0.04em] uppercase",
                  score <= 1
                    ? "text-[#a6712e]"
                    : score === 2
                      ? "text-gold-700"
                      : score === 3
                        ? "text-blue-700"
                        : "text-success-700",
                )}
              >
                {meter.label}
              </span>
            )}
          </div>
          {showError("password") ? (
            <FieldError id="signup-password-error">{showError("password")}</FieldError>
          ) : (
            <p id="signup-password-hint" className="mt-1.5 text-[0.75rem] text-ink-faint">
              {meter.hint}
            </p>
          )}
        </div>

        <div className="mb-6">
          <Label htmlFor="signup-industry">Industry</Label>
          <SelectShell>
            <select
              id="signup-industry"
              name="industry"
              value={values.industry}
              onChange={(e) => {
                set("industry", e.target.value);
                setTouched((t) => ({ ...t, industry: true }));
              }}
              onBlur={blur("industry")}
              aria-invalid={Boolean(showError("industry"))}
              aria-describedby={showError("industry") ? "signup-industry-error" : undefined}
              className={cn(
                inputBase,
                "cursor-pointer appearance-none pr-9",
                !values.industry && "text-ink-faint/80",
                showError("industry") && inputInvalid,
              )}
            >
              <option value="" disabled>
                Select your vertical…
              </option>
              {industries.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </SelectShell>
          <FieldError id="signup-industry-error">{showError("industry")}</FieldError>
        </div>

        <div className="mb-7">
          <label className="flex cursor-pointer items-start gap-2.5 text-[0.82rem] leading-[1.6] text-ink-muted select-none">
            <input
              type="checkbox"
              name="terms"
              checked={values.terms}
              onChange={(e) => {
                set("terms", e.target.checked);
                setTouched((t) => ({ ...t, terms: true }));
              }}
              aria-invalid={Boolean(showError("terms"))}
              aria-describedby={showError("terms") ? "signup-terms-error" : undefined}
              className="mt-[3px] h-4 w-4 cursor-pointer accent-[var(--blue-600)]"
            />
            <span>
              I agree to the{" "}
              <Link href="/terms" className="font-semibold text-blue-600 hover:text-blue-700">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="font-semibold text-blue-600 hover:text-blue-700">
                Privacy Policy
              </Link>
              .
            </span>
          </label>
          <FieldError id="signup-terms-error">{showError("terms")}</FieldError>
        </div>

        <button
          type="submit"
          disabled={busy}
          className={cn(
            "group flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-[10px] border border-transparent px-[30px] py-[13px] text-[0.9375rem] font-semibold",
            "bg-[linear-gradient(180deg,var(--gold-400)_0%,var(--gold-500)_55%,var(--gold-600)_100%)] text-navy-950 shadow-[var(--shadow-gold)]",
            "transition-[transform,box-shadow,opacity] duration-[var(--duration-fast)] ease-[var(--ease-out-expo)]",
            "hover:-translate-y-0.5 hover:shadow-[var(--shadow-gold-hover)] active:translate-y-0 active:scale-[0.99]",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600",
            "disabled:cursor-wait disabled:opacity-80 disabled:hover:translate-y-0 disabled:hover:shadow-[var(--shadow-gold)]",
          )}
        >
          {busy ? (
            <>
              <Spinner />
              Creating your workspace…
            </>
          ) : (
            <>
              Create my account
              <span
                aria-hidden
                className="transition-transform duration-[var(--duration-fast)] ease-[var(--ease-out-expo)] group-hover:translate-x-[3px]"
              >
                →
              </span>
            </>
          )}
        </button>
        <p className="mt-3.5 text-center text-[0.75rem] text-ink-faint">
          Free for 7 days · No credit card required · Cancel anytime
        </p>
      </form>

      {phase === "done" && !configured && <AuthNotice action="account creation" />}

      <p className="mt-6 border-t border-line pt-5 text-center text-[0.85rem] text-ink-muted">
        Already using Diamond?{" "}
        <Link
          href="/login"
          className="font-semibold text-blue-600 transition-colors duration-[var(--duration-fast)] hover:text-blue-700"
        >
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}
