"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/cn";
import type {
  ActionResult,
  BrandingInput,
  BusinessInfoInput,
  FinishInput,
  HoursInput,
  ServiceInput,
  TeamInput,
  WizardData,
} from "@/lib/onboarding/types";
import {
  finishOnboarding,
  saveBranding,
  saveBusinessInfo,
  saveHours,
  saveServices,
  saveTeam,
  setOnboardingStep,
} from "@/lib/actions/onboarding";
import { BusinessStep } from "./steps/BusinessStep";
import { ServicesStep } from "./steps/ServicesStep";
import { TeamStep } from "./steps/TeamStep";
import { HoursStep } from "./steps/HoursStep";
import { BrandingStep } from "./steps/BrandingStep";
import { FinishStep } from "./steps/FinishStep";
import { WidgetReveal } from "./steps/WidgetReveal";
import { WizardError } from "./wizard-ui";

const STEPS = [
  { n: 1, title: "Business info", sub: "The basics" },
  { n: 2, title: "Services", sub: "What you offer" },
  { n: 3, title: "Team", sub: "Who does the work" },
  { n: 4, title: "Hours", sub: "When you're open" },
  { n: 5, title: "Branding", sub: "Make it yours" },
  { n: 6, title: "Booking & widget", sub: "Go live" },
] as const;

export function OnboardingWizard({
  initialStep,
  initialData,
  tenantId,
  publicKey,
  appUrl,
  ownerName,
}: {
  initialStep: number;
  initialData: WizardData;
  tenantId: string;
  publicKey: string;
  appUrl: string;
  ownerName: string;
}) {
  const [data, setData] = useState<WizardData>(initialData);
  const [done, setDone] = useState(initialStep > 6);
  const [step, setStep] = useState(Math.min(Math.max(initialStep, 1), 6));
  const [maxReached, setMaxReached] = useState(Math.min(Math.max(initialStep, 1), 6));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reduce = useReducedMotion();

  const advance = (next: number | "done") => {
    if (next === "done") {
      setDone(true);
    } else {
      setStep(next);
      setMaxReached((m) => Math.max(m, next));
    }
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  };

  const runSave = async (
    persist: () => Promise<ActionResult>,
    apply: () => void,
    next: number | "done",
  ) => {
    setSaving(true);
    setError(null);
    try {
      const result = await persist();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      apply();
      advance(next);
    } catch {
      setError("Couldn't save — please try again.");
    } finally {
      setSaving(false);
    }
  };

  const goBack = (to: number) => {
    if (saving || to < 1) return;
    setError(null);
    setStep(to);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
    void setOnboardingStep(to);
  };

  const jumpTo = (n: number) => {
    if (saving || done || n === step || n > maxReached) return;
    goBack(n);
  };

  // ---- per-step submit handlers ----
  const submitBusiness = (next: BusinessInfoInput) =>
    runSave(
      () => saveBusinessInfo(next),
      () => setData((d) => ({ ...d, business: next })),
      2,
    );

  const submitServices = (next: ServiceInput[]) =>
    runSave(
      () => saveServices(next),
      () => setData((d) => ({ ...d, services: next })),
      3,
    );

  const submitTeam = (next: TeamInput) =>
    runSave(
      () => saveTeam(next),
      () => setData((d) => ({ ...d, team: next })),
      4,
    );

  const submitHours = (next: HoursInput) =>
    runSave(
      () => saveHours(next),
      () => setData((d) => ({ ...d, hours: next })),
      5,
    );

  const submitBranding = (next: BrandingInput) =>
    runSave(
      () => saveBranding(next),
      () => setData((d) => ({ ...d, branding: next })),
      6,
    );

  const submitFinish = (next: FinishInput) =>
    runSave(
      () => finishOnboarding(next),
      () => setData((d) => ({ ...d, finish: next })),
      "done",
    );

  const progressPct = done ? 100 : Math.round(((step - 1) / 6) * 100);

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-surface-alt">
      {/* feathered dot grid backdrop (matches the auth shell) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgb(12_36_64/0.06)_1px,transparent_1px)] [background-size:26px_26px] [mask-image:radial-gradient(900px_620px_at_50%_0%,black_0%,transparent_74%)] [-webkit-mask-image:radial-gradient(900px_620px_at_50%_0%,black_0%,transparent_74%)]"
      />

      {/* header */}
      <header className="relative border-b border-line/70 bg-surface/60 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-[1120px] items-center justify-between px-[var(--container-pad)] py-4">
          <Link
            href="/"
            aria-label="Diamond Booking home"
            className="transition-opacity duration-[var(--duration-fast)] hover:opacity-80"
          >
            <Logo variant="light" className="h-8" priority />
          </Link>
          <span className="text-[0.78rem] font-medium text-ink-faint">
            {done ? "Setup complete" : `Setup · Step ${step} of 6`}
          </span>
        </div>
      </header>

      {/* mobile progress bar */}
      <div className="relative border-b border-line/70 bg-surface/60 lg:hidden">
        <div className="mx-auto w-full max-w-[1120px] px-[var(--container-pad)] py-3">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-[0.8rem] font-semibold text-ink">
              {done ? "You're live" : STEPS[step - 1].title}
            </span>
            <span className="text-[0.7rem] font-medium text-ink-faint">
              {progressPct}%
            </span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Onboarding progress"
            className="h-1.5 overflow-hidden rounded-full bg-line"
          >
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,var(--blue-600),var(--blue-400))] transition-[width] duration-[var(--duration-base)] ease-[var(--ease-out-expo)]"
              style={{ width: `${Math.max(progressPct, 4)}%` }}
            />
          </div>
        </div>
      </div>

      <main className="relative mx-auto grid w-full max-w-[1120px] flex-1 gap-8 px-[var(--container-pad)] py-[clamp(24px,4vw,48px)] lg:grid-cols-[264px_1fr] lg:gap-12">
        {/* progress rail (desktop) */}
        <nav aria-label="Onboarding steps" className="hidden lg:block">
          <ol className="sticky top-10 flex flex-col gap-1">
            {STEPS.map((s) => {
              const complete = done || s.n < step;
              const current = !done && s.n === step;
              const reachable = !done && s.n <= maxReached && s.n !== step;
              return (
                <li key={s.n}>
                  <button
                    type="button"
                    onClick={() => jumpTo(s.n)}
                    disabled={!reachable}
                    aria-current={current ? "step" : undefined}
                    className={cn(
                      "flex w-full items-center gap-3.5 rounded-[12px] px-3.5 py-3 text-left",
                      "transition-[background-color] duration-[var(--duration-fast)]",
                      "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600",
                      current && "bg-card shadow-[0_1px_4px_rgb(12_36_64/0.08)]",
                      reachable && "cursor-pointer hover:bg-card/70",
                      !reachable && !current && "cursor-default",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "flex h-7 w-7 flex-none items-center justify-center rounded-full border text-[0.72rem] font-bold",
                        "transition-[background-color,border-color,color] duration-[var(--duration-fast)]",
                        complete
                          ? "border-success-500 bg-success-50 text-success-700"
                          : current
                            ? "border-blue-600 bg-blue-600 text-white"
                            : "border-line-strong bg-card text-ink-faint",
                      )}
                    >
                      {complete ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" className="h-3.5 w-3.5">
                          <path d="M4.5 12.5l5 5L19.5 7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : (
                        s.n
                      )}
                    </span>
                    <span className="min-w-0">
                      <span
                        className={cn(
                          "block truncate text-[0.85rem] font-semibold",
                          current ? "text-ink" : complete ? "text-ink-muted" : "text-ink-faint",
                        )}
                      >
                        {s.title}
                      </span>
                      <span className="block truncate text-[0.7rem] text-ink-faint">
                        {s.sub}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        {/* step card */}
        <div className="min-w-0">
          <WizardError>{error}</WizardError>
          <div className="rounded-[20px] border border-navy-900/8 bg-card px-[clamp(20px,4vw,38px)] py-[clamp(24px,4vw,38px)] shadow-float">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={done ? "done" : step}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -14 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              >
                {done ? (
                  <WidgetReveal
                    publicKey={publicKey}
                    appUrl={appUrl}
                    businessName={data.business.name}
                  />
                ) : step === 1 ? (
                  <BusinessStep
                    value={data.business}
                    busy={saving}
                    onSubmit={submitBusiness}
                  />
                ) : step === 2 ? (
                  <ServicesStep
                    value={data.services}
                    industry={data.business.industry}
                    busy={saving}
                    onSubmit={submitServices}
                    onBack={() => goBack(1)}
                  />
                ) : step === 3 ? (
                  <TeamStep
                    value={data.team}
                    ownerName={ownerName}
                    busy={saving}
                    onSubmit={submitTeam}
                    onBack={() => goBack(2)}
                  />
                ) : step === 4 ? (
                  <HoursStep
                    value={data.hours}
                    busy={saving}
                    onSubmit={submitHours}
                    onBack={() => goBack(3)}
                  />
                ) : step === 5 ? (
                  <BrandingStep
                    value={data.branding}
                    tenantId={tenantId}
                    busy={saving}
                    onSubmit={submitBranding}
                    onBack={() => goBack(4)}
                  />
                ) : (
                  <FinishStep
                    value={data.finish}
                    busy={saving}
                    onSubmit={submitFinish}
                    onBack={() => goBack(5)}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
  );
}
