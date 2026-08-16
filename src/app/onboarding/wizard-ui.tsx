"use client";

import { cn } from "@/lib/cn";
import { Spinner } from "../(auth)/auth-ui";

/**
 * Shared wizard primitives: buttons, toggle, step header, notices.
 * Token-driven to match the design system (gold = primary action,
 * quiet ghost = back, blue = interactive accents).
 */

export function PrimaryButton({
  children,
  disabled = false,
  busy = false,
  type = "submit",
  onClick,
  className,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  busy?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      className={cn(
        "group inline-flex cursor-pointer items-center justify-center gap-2.5 rounded-[10px] border border-transparent px-[26px] py-[12px] text-[0.9rem] font-semibold",
        "bg-[linear-gradient(180deg,var(--gold-400)_0%,var(--gold-500)_55%,var(--gold-600)_100%)] text-navy-950 shadow-[var(--shadow-gold)]",
        "transition-[transform,box-shadow,opacity] duration-[var(--duration-fast)] ease-[var(--ease-out-expo)]",
        "hover:-translate-y-0.5 hover:shadow-[var(--shadow-gold-hover)] active:translate-y-0 active:scale-[0.99]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600",
        "disabled:cursor-wait disabled:opacity-80 disabled:hover:translate-y-0 disabled:hover:shadow-[var(--shadow-gold)]",
        className,
      )}
    >
      {busy ? (
        <>
          <Spinner />
          Saving…
        </>
      ) : (
        <>
          {children}
          <span
            aria-hidden
            className="transition-transform duration-[var(--duration-fast)] ease-[var(--ease-out-expo)] group-hover:translate-x-[3px]"
          >
            →
          </span>
        </>
      )}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
  disabled = false,
  type = "button",
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-line-strong bg-transparent px-[20px] py-[11px] text-[0.875rem] font-semibold text-ink",
        "transition-[transform,box-shadow,border-color,color] duration-[var(--duration-fast)] ease-[var(--ease-out-expo)]",
        "hover:-translate-y-0.5 hover:border-blue-600 hover:text-blue-600 hover:shadow-lift",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:border-line-strong disabled:hover:text-ink disabled:hover:shadow-none",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Accessible switch, keyboard-operable (space/enter). */
export function Toggle({
  checked,
  onChange,
  label,
  description,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  id: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label
          htmlFor={id}
          className="cursor-pointer text-[0.88rem] font-semibold text-ink"
        >
          {label}
        </label>
        {description && (
          <p className="mt-0.5 text-[0.78rem] leading-[1.55] text-ink-faint">
            {description}
          </p>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-[26px] w-[46px] flex-none cursor-pointer rounded-full border",
          "transition-[background-color,border-color] duration-[var(--duration-fast)] ease-[var(--ease-out-expo)]",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600",
          checked
            ? "border-blue-600 bg-blue-600"
            : "border-line-strong bg-surface-alt",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_3px_rgb(12_36_64/0.25)]",
            "transition-[left] duration-[var(--duration-fast)] ease-[var(--ease-out-expo)]",
            checked ? "left-[24px]" : "left-[3px]",
          )}
        />
      </button>
    </div>
  );
}

/** Consistent step header inside the card. */
export function StepHeader({
  step,
  title,
  lede,
}: {
  step: number;
  title: React.ReactNode;
  lede: React.ReactNode;
}) {
  return (
    <div className="mb-7">
      <span className="eyebrow mb-3 inline-flex items-center gap-3 font-bold">
        <span aria-hidden className="h-[1.5px] w-6 bg-blue-600" />
        Step {step} of 6
      </span>
      <h1 className="font-display text-[clamp(1.45rem,3.4vw,1.9rem)] leading-[1.14] font-bold tracking-[-0.025em] text-ink">
        {title}
      </h1>
      <p className="mt-2 max-w-[46em] text-[0.88rem] leading-[1.65] font-light text-ink-muted">
        {lede}
      </p>
    </div>
  );
}

/** Inline error banner for failed saves. */
export function WizardError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <div
      role="alert"
      className="mb-5 flex items-start gap-3 rounded-[12px] border border-[#e4b7b5] bg-[#fdf6f5] px-4 py-3"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="mt-[2px] h-4 w-4 flex-none text-[#a63d39]"
        aria-hidden
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5M12 16.5v.5" strokeLinecap="round" />
      </svg>
      <p className="text-[0.82rem] leading-[1.6] font-medium text-[#8c3531]">
        {children}
      </p>
    </div>
  );
}

/** Quiet info note (invite status, holidays, Stripe pending, ...). */
export function InfoNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-[12px] border border-blue-200 bg-blue-50 px-4 py-3">
      <span
        aria-hidden
        className="mt-[2px] flex h-5 w-5 flex-none items-center justify-center rounded-full bg-blue-600 text-[0.6rem] font-bold text-white"
      >
        i
      </span>
      <p className="text-[0.8rem] leading-[1.6] text-navy-800">{children}</p>
    </div>
  );
}

/** Step form footer: back + continue. */
export function StepFooter({
  onBack,
  busy,
  continueLabel = "Save & continue",
  showBack = true,
}: {
  onBack?: () => void;
  busy: boolean;
  continueLabel?: string;
  showBack?: boolean;
}) {
  return (
    <div className="mt-8 flex flex-col-reverse gap-3 border-t border-line pt-6 min-[521px]:flex-row min-[521px]:items-center min-[521px]:justify-between">
      {showBack ? (
        <GhostButton onClick={onBack} disabled={busy}>
          ← Back
        </GhostButton>
      ) : (
        <span />
      )}
      <PrimaryButton busy={busy}>{continueLabel}</PrimaryButton>
    </div>
  );
}
