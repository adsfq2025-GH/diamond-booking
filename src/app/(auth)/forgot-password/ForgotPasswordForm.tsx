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
import { requestPasswordReset, type AuthFormState } from "@/lib/actions/auth";
import { cn } from "@/lib/cn";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>();
  const { phase, begin } = useConnectPhase();
  const [state, formAction, isPending] = useActionState<AuthFormState, FormData>(
    requestPasswordReset,
    null,
  );

  const configured = supabaseConfigured();
  const busy = isPending || phase === "connecting";
  const sent = state?.success || phase === "done";

  const onSubmit = (e: React.FormEvent) => {
    if (!email.trim()) {
      e.preventDefault();
      return setError("Enter the email on your account.");
    }
    if (!EMAIL_RE.test(email.trim())) {
      e.preventDefault();
      return setError("That email doesn't look complete — check for typos.");
    }
    setError(undefined);
    if (!configured) {
      // Placeholder mode: keep the designed fake phase + notice.
      e.preventDefault();
      if (phase === "idle") begin();
    }
  };

  if (sent) {
    return (
      <AuthCard>
        <div role="status" className="flex flex-col items-center py-4 text-center">
          <span className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="h-7 w-7 text-blue-600"
              aria-hidden
            >
              <path d="M4 7l8 6 8-6" strokeLinecap="round" strokeLinejoin="round" />
              <rect x="4" y="5.5" width="16" height="13" rx="2.5" />
            </svg>
          </span>
          <h1 className="font-display mb-2.5 text-[1.5rem] leading-[1.15] font-bold tracking-[-0.02em]">
            Check your <Em>inbox.</Em>
          </h1>
          <p className="max-w-[24em] text-[0.88rem] leading-[1.7] font-light text-ink-muted">
            If an account exists for{" "}
            <b className="font-semibold text-ink">{email.trim()}</b>, a reset
            link is on its way. It expires in 60 minutes — check spam if it
            hasn&rsquo;t landed in a couple of minutes.
          </p>
          {!configured && (
            <div className="mt-6 w-full">
              <AuthNotice action="reset email delivery" />
            </div>
          )}
          <Link
            href="/login"
            className="mt-6 text-[0.85rem] font-semibold text-blue-600 transition-colors duration-[var(--duration-fast)] hover:text-blue-700"
          >
            ← Back to sign in
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <h1 className="font-display mb-1.5 text-[1.6rem] leading-[1.15] font-bold tracking-[-0.02em]">
        Let&rsquo;s get you <Em>back in.</Em>
      </h1>
      <p className="mb-7 text-[0.88rem] leading-[1.65] font-light text-ink-muted">
        Enter your account email and we&rsquo;ll send a secure link to reset
        your password.
      </p>

      <AuthError>{state?.error}</AuthError>

      <form noValidate action={formAction} onSubmit={onSubmit}>
        <div className="mb-6">
          <Label htmlFor="forgot-email">Email</Label>
          <input
            id="forgot-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@yourbusiness.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError(undefined);
            }}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "forgot-email-error" : undefined}
            className={cn(inputBase, error && inputInvalid)}
          />
          <FieldError id="forgot-email-error">{error}</FieldError>
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
              Sending…
            </>
          ) : (
            "Email me a reset link"
          )}
        </button>
      </form>

      <p className="mt-7 border-t border-line pt-5 text-center text-[0.85rem] text-ink-muted">
        Remembered it after all?{" "}
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
