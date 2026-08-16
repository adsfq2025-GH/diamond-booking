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
import { signIn, type AuthFormState } from "@/lib/actions/auth";
import { cn } from "@/lib/cn";

const roles = [
  { key: "business", label: "Business", caption: "Sign in to run your business." },
  { key: "team", label: "Team", caption: "Sign in to see your day sheet." },
  { key: "customer", label: "Customer", caption: "Sign in to manage your bookings." },
  { key: "admin", label: "Admin", caption: "Platform administration sign-in." },
] as const;

type RoleKey = (typeof roles)[number]["key"];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const [role, setRole] = useState<RoleKey>("business");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const { phase, begin } = useConnectPhase();
  const [state, formAction, isPending] = useActionState<AuthFormState, FormData>(
    signIn,
    null,
  );

  const active = roles.find((r) => r.key === role)!;
  const configured = supabaseConfigured();
  const busy = isPending || phase === "connecting";

  const onSubmit = (e: React.FormEvent) => {
    const next: typeof errors = {};
    if (!email.trim()) next.email = "Enter the email on your account.";
    else if (!EMAIL_RE.test(email.trim()))
      next.email = "That email doesn't look complete — check for typos.";
    if (!password) next.password = "Enter your password.";
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
      {/* role segmented control (visual only — routing is role-derived server-side) */}
      <div
        role="group"
        aria-label="Account type"
        className="mb-7 grid grid-cols-4 gap-1 rounded-[12px] border border-line bg-surface-alt p-1"
      >
        {roles.map((r) => (
          <button
            key={r.key}
            type="button"
            aria-pressed={role === r.key}
            onClick={() => setRole(r.key)}
            className={cn(
              "cursor-pointer rounded-[9px] px-1 py-[7px] text-[0.74rem] font-semibold",
              "transition-[background-color,color,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-out-expo)]",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600",
              role === r.key
                ? "bg-card text-ink shadow-[0_1px_3px_rgb(12_36_64/0.12)]"
                : "text-ink-faint hover:text-ink-muted",
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      <h1 className="font-display mb-1.5 text-[1.6rem] leading-[1.15] font-bold tracking-[-0.02em]">
        Welcome <Em>back.</Em>
      </h1>
      <p className="mb-7 text-[0.88rem] font-light text-ink-muted">{active.caption}</p>

      <AuthError>{state?.error}</AuthError>

      <form noValidate action={formAction} onSubmit={onSubmit}>
        {redirectTo && <input type="hidden" name="redirect" value={redirectTo} />}
        <div className="mb-5">
          <Label htmlFor="login-email">Email</Label>
          <input
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@yourbusiness.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (errors.email) setErrors((er) => ({ ...er, email: undefined }));
            }}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "login-email-error" : undefined}
            className={cn(inputBase, errors.email && inputInvalid)}
          />
          <FieldError id="login-email-error">{errors.email}</FieldError>
        </div>

        <div className="mb-5">
          <Label
            htmlFor="login-password"
            hint={
              <Link
                href="/forgot-password"
                className="font-semibold text-blue-600 transition-colors duration-[var(--duration-fast)] hover:text-blue-700"
              >
                Forgot password?
              </Link>
            }
          >
            Password
          </Label>
          <input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••••"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (errors.password) setErrors((er) => ({ ...er, password: undefined }));
            }}
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? "login-password-error" : undefined}
            className={cn(inputBase, errors.password && inputInvalid)}
          />
          <FieldError id="login-password-error">{errors.password}</FieldError>
        </div>

        <label className="mb-6 flex cursor-pointer items-center gap-2.5 text-[0.85rem] text-ink-muted select-none">
          <input
            type="checkbox"
            name="remember"
            defaultChecked
            className="h-4 w-4 cursor-pointer accent-[var(--blue-600)]"
          />
          Keep me signed in on this device
        </label>

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
              Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </button>
      </form>

      {phase === "done" && !configured && <AuthNotice action="sign-in" />}

      <p className="mt-7 border-t border-line pt-5 text-center text-[0.85rem] text-ink-muted">
        New to Diamond?{" "}
        <Link
          href="/signup"
          className="font-semibold text-blue-600 transition-colors duration-[var(--duration-fast)] hover:text-blue-700"
        >
          Start your 7-day free trial
        </Link>
      </p>
    </AuthCard>
  );
}
