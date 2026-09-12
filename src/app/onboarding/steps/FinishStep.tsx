"use client";

import { useState } from "react";
import { Em } from "@/components/ui/SectionHeading";
import { Label, SelectShell, inputBase } from "@/components/ui/Field";
import {
  StepHeader,
  StepFooter,
  Toggle,
  InfoNote,
  WizardError,
} from "../wizard-ui";
import type { FinishInput, LaunchReadiness } from "@/lib/onboarding/types";
import { cn } from "@/lib/cn";

const WINDOW_OPTIONS = [12, 24, 48, 72];

export function FinishStep({
  value,
  busy,
  readiness,
  onSubmit,
  onBack,
}: {
  value: FinishInput;
  busy: boolean;
  readiness: LaunchReadiness;
  onSubmit: (next: FinishInput) => void;
  onBack: () => void;
}) {
  const [finish, setFinish] = useState<FinishInput>(value);
  const [error] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(finish);
  };

  const modeCard = (
    autoConfirm: boolean,
    title: string,
    body: string,
    badge?: string,
  ) => {
    const selected = finish.auto_confirm === autoConfirm;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        onClick={() => setFinish((f) => ({ ...f, auto_confirm: autoConfirm }))}
        className={cn(
          "relative flex-1 cursor-pointer rounded-[14px] border-2 p-4 text-left",
          "transition-[border-color,background-color,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-out-expo)]",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600",
          selected
            ? "border-blue-600 bg-blue-50/60 shadow-[0_2px_8px_rgb(46_134_193/0.12)]"
            : "border-line bg-card hover:border-line-strong",
        )}
      >
        <span className="flex items-center gap-2.5">
          <span
            aria-hidden
            className={cn(
              "flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full border-2",
              selected ? "border-blue-600" : "border-line-strong",
            )}
          >
            {selected && (
              <span className="h-2 w-2 rounded-full bg-blue-600" />
            )}
          </span>
          <span className="text-[0.9rem] font-semibold text-ink">{title}</span>
          {badge && (
            <span className="rounded-[var(--radius-pill)] bg-gold-100 px-2 py-[3px] text-[0.6rem] font-bold tracking-[0.08em] text-gold-700 uppercase">
              {badge}
            </span>
          )}
        </span>
        <span className="mt-1.5 block pl-[28px] text-[0.78rem] leading-[1.6] text-ink-muted">
          {body}
        </span>
      </button>
    );
  };

  return (
    <form noValidate onSubmit={submit}>
      <StepHeader
        step={6}
        title={
          <>
            Set the rules, then <Em>go live.</Em>
          </>
        }
        lede="How bookings get confirmed, what happens on cancellations, and whether deposits are collected. Finish to generate your embeddable widget."
      />

      <WizardError>{error}</WizardError>

      <div className="mb-6">
        <p className="mb-2.5 text-[0.8rem] font-semibold text-ink">
          Confirmation mode
        </p>
        <div
          role="radiogroup"
          aria-label="Confirmation mode"
          className="flex flex-col gap-3 min-[641px]:flex-row"
        >
          {modeCard(
            true,
            "Auto-confirm",
            "Open slots are booked instantly — zero taps from you. Best once your calendar is trustworthy.",
            "Fastest",
          )}
          {modeCard(
            false,
            "Review & approve",
            "New requests wait in your dashboard until you confirm. Best while you're getting started.",
          )}
        </div>
      </div>

      <div className="mb-6 grid gap-5 min-[641px]:grid-cols-[1fr_220px]">
        <div>
          <Label htmlFor="finish-policy">Cancellation policy</Label>
          <textarea
            id="finish-policy"
            rows={3}
            value={finish.cancellation_policy}
            onChange={(e) =>
              setFinish((f) => ({ ...f, cancellation_policy: e.target.value }))
            }
            placeholder="Free cancellation up to 24 hours before your appointment…"
            className={cn(inputBase, "resize-y leading-[1.6]")}
          />
          <p className="mt-1.5 text-[0.75rem] text-ink-faint">
            Shown to customers before they confirm a booking.
          </p>
        </div>
        <div>
          <Label htmlFor="finish-window">Free cancellation window</Label>
          <SelectShell>
            <select
              id="finish-window"
              value={finish.cancellation_window_hours}
              onChange={(e) =>
                setFinish((f) => ({
                  ...f,
                  cancellation_window_hours:
                    Number.parseInt(e.target.value, 10) || 24,
                }))
              }
              className={cn(inputBase, "cursor-pointer appearance-none pr-9")}
            >
              {WINDOW_OPTIONS.map((h) => (
                <option key={h} value={h}>
                  {h} hours before
                </option>
              ))}
            </select>
          </SelectShell>
        </div>
      </div>

      <div className="flex flex-col gap-5 rounded-[14px] border border-navy-900/8 bg-card p-4 shadow-[0_1px_3px_rgb(12_36_64/0.05)] min-[521px]:p-5">
        <Toggle
          id="finish-deposits"
          checked={finish.deposit_required}
          onChange={(next) => setFinish((f) => ({ ...f, deposit_required: next }))}
          label="Collect deposits by default"
          description="Services with a deposit amount will require it at booking. Per-service amounts come from Step 2."
        />
        <div className="border-t border-line pt-5">
          <Toggle
            id="finish-recurring"
            checked={finish.recurring_enabled}
            onChange={(next) => setFinish((f) => ({ ...f, recurring_enabled: next }))}
            label="Allow recurring bookings"
            description="Let customers set a repeating schedule (weekly, every 2 weeks, monthly…). Each occurrence is reserved on your calendar so the time stays blocked."
          />
        </div>
        <div className="border-t border-line pt-5">
          <Toggle
            id="finish-payments"
            checked={finish.payments_enabled}
            onChange={(next) => setFinish((f) => ({ ...f, payments_enabled: next }))}
            label="Online payments"
            description="Card payments and deposit capture through Stripe."
          />
          <div className="mt-3">
            <InfoNote>
              <b className="font-semibold">Stripe keys pending.</b> Payments
              stay in test mode until Stripe is connected in the payments
              phase — your preference here is saved and applies the moment
              it&rsquo;s live.
            </InfoNote>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-[14px] border border-blue-200 bg-blue-50/70 p-4 min-[521px]:p-5">
        <p className="text-[0.82rem] font-semibold text-navy-900">Before you finish</p>
        <ul className="mt-3 space-y-2 text-[0.8rem] leading-[1.6] text-navy-800">
          <li>• Make sure at least one service has the right duration, price, and deposit.</li>
          <li>• Confirm your business hours match when customers can really book.</li>
          <li>• Add your logo and brand color so the booking page feels trustworthy.</li>
          <li>• If payments stay on, connect Stripe in the dashboard before going fully live.</li>
        </ul>
      </div>

      <div className="mt-5 rounded-[14px] border border-line bg-card p-4 min-[521px]:p-5">
        <p className="text-[0.82rem] font-semibold text-ink">Launch readiness</p>
        <p className="mt-1 text-[0.78rem] text-ink-muted">
          Current status: <span className="font-semibold text-ink">{readiness.status.replace("_", " ")}</span>
        </p>
        <ul className="mt-3 space-y-2 text-[0.8rem] leading-[1.6] text-ink-muted">
          {readiness.blockers.length === 0 ? (
            <li>• No blockers detected from current setup.</li>
          ) : (
            readiness.blockers.map((blocker) => <li key={blocker}>• {blocker}</li>)
          )}
        </ul>
      </div>

      <StepFooter
        busy={busy}
        onBack={onBack}
        continueLabel="Finish & create my widget"
      />
    </form>
  );
}
