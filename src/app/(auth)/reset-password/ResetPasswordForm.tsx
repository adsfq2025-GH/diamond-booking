"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Em } from "@/components/ui/SectionHeading";
import {
  Label,
  FieldError,
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
import { updatePassword, type AuthFormState } from "@/lib/actions/auth";
import { passwordScore } from "@/lib/password";
import { cn } from "@/lib/cn";

const strength: Record<number, { label: string; cls: string }> = {
  0: { label: "", cls: "" },
  1: { label: "Too short", cls: "bg-[#c9903a]" },
  2: { label: "Okay", cls: "bg-gold-500" },
  3: { label: "Good", cls: "bg-blue-500" },
  4: { label: "Strong", cls: "bg-success-500" },
};

/**
 * Sets the new password after the user lands here from the recovery email
 * (/auth/confirm verifies the link and starts a session first).
 */
export function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const { phase, begin } = useConnectPhase();
  const [state, formAction, isPending] = useActionState<AuthFormState, FormData>(
    updatePassword,
    null,
  );

  const configured = supabaseConfigured();
  const busy = isPending || phase === "connecting";
  const score = passwordScore(password);
  const meter = strength[score];

  const onSubmit = (e: React.FormEvent) => {
    const next: typeof errors = {};
    if (!password) next.password = "Choose a new password.";
    else if (score < 2)
      next.password = "Use at least 8 characters — a number helps too.";
    if (confirm !== password) next.confirm = "Those passwords don't match.";
    setErrors(next);
    if (Object.keys(next).length > 0) {
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
    <AuthCard>
      <h1 className="font-display mb-1.5 text-[1.6rem] leading-[1.15] font-bold tracking-[-0.02em]">
        Choose a <Em>new password.</Em>
      </h1>
      <p className="mb-7 text-[0.88rem] leading-[1.65] font-light text-ink-muted">
        Make it long, make it memorable — you&rsquo;ll be signed straight in
        once it&rsquo;s saved.
      </p>

      <AuthError>{state?.error}</AuthError>

      <form noValidate action={formAction} onSubmit={onSubmit}>
        <div className="mb-5">
          <Label htmlFor="reset-password">New password</Label>
          <input
            id="reset-password"
            name="new-password"
            type="password"
            autoComplete="new-password"
            placeholder="10+ characters is a great habit"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (errors.password)
                setErrors((er) => ({ ...er, password: undefined }));
            }}
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? "reset-password-error" : undefined}
            className={cn(inputBase, errors.password && inputInvalid)}
          />
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
          <FieldError id="reset-password-error">{errors.password}</FieldError>
        </div>

        <div className="mb-6">
          <Label htmlFor="reset-confirm">Confirm new password</Label>
          <input
            id="reset-confirm"
            name="confirm-password"
            type="password"
            autoComplete="new-password"
            placeholder="Type it once more"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              if (errors.confirm) setErrors((er) => ({ ...er, confirm: undefined }));
            }}
            aria-invalid={Boolean(errors.confirm)}
            aria-describedby={errors.confirm ? "reset-confirm-error" : undefined}
            className={cn(inputBase, errors.confirm && inputInvalid)}
          />
          <FieldError id="reset-confirm-error">{errors.confirm}</FieldError>
        </div>

        <button
          type="submit"
          disabled={busy}
          className={cn(
            "flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-[10px] border border-transparent px-[30px] py-[13px] text-[0.9375rem] font-semibold",
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
              Saving…
            </>
          ) : (
            "Save new password"
          )}
        </button>
      </form>

      {phase === "done" && !configured && <AuthNotice action="password update" />}

      <p className="mt-7 border-t border-line pt-5 text-center text-[0.85rem] text-ink-muted">
        Link not working?{" "}
        <Link
          href="/forgot-password"
          className="font-semibold text-blue-600 transition-colors duration-[var(--duration-fast)] hover:text-blue-700"
        >
          Request a new one
        </Link>
      </p>
    </AuthCard>
  );
}
