"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { registerFromInvitation } from "@/lib/actions/team";
import { MIN_PASSWORD_SCORE, passwordScore } from "@/lib/password";

/**
 * Account creation for an invited teammate (O02).
 *
 * The invitation page used to offer "Create an account" as a link to the
 * BUSINESS signup form, which creates a business_owner, bootstraps a tenant
 * and redirects to onboarding — and because invitation acceptance refuses to
 * demote an owner, the invitee could then never accept at all. New staff now
 * register here instead, as staff, against the invitation itself.
 *
 * The email is not a field: it comes from the invitation server-side, so an
 * invitation cannot be redirected to a different address.
 */
export function StaffSignupForm({
  token,
  email,
}: {
  token: string;
  email: string;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const score = passwordScore(password);
  const canSubmit = fullName.trim().length > 0 && score >= MIN_PASSWORD_SCORE && !busy;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const result = await registerFromInvitation({ token, fullName, password });
    if (result.ok) {
      router.replace("/team");
      return;
    }
    setBusy(false);
    setError(result.error);
  }

  return (
    <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
      {error && (
        <p
          role="alert"
          className="rounded-[10px] border border-[#e8c0bd] bg-[#fdf6f5] px-4 py-3 text-[0.85rem] text-[#a63d39]"
        >
          {error}
        </p>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-[0.78rem] font-semibold text-ink-muted">Your name</span>
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          autoComplete="name"
          required
          className="rounded-[10px] border border-line-strong px-3.5 py-2.5 text-[0.9rem] text-ink outline-none focus:border-blue-600"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[0.78rem] font-semibold text-ink-muted">Email</span>
        <input
          type="email"
          value={email}
          readOnly
          disabled
          aria-describedby="invite-email-note"
          className="rounded-[10px] border border-line bg-surface-alt px-3.5 py-2.5 text-[0.9rem] text-ink-muted"
        />
        <span id="invite-email-note" className="text-[0.74rem] text-ink-faint">
          Set by the invitation — it cannot be changed here.
        </span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[0.78rem] font-semibold text-ink-muted">Choose a password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
          className="rounded-[10px] border border-line-strong px-3.5 py-2.5 text-[0.9rem] text-ink outline-none focus:border-blue-600"
        />
        <span className="text-[0.74rem] text-ink-faint">
          At least 8 characters. Adding a number helps.
        </span>
      </label>

      <button
        type="submit"
        disabled={!canSubmit}
        className="rounded-[10px] bg-navy-700 px-4 py-3 text-[0.88rem] font-semibold text-white transition-colors hover:bg-navy-600 disabled:opacity-60"
      >
        {busy ? "Creating your account…" : "Create account and join"}
      </button>

      <p className="text-center text-[0.8rem] text-ink-muted">
        Already have an account?{" "}
        <Link
          href={`/login?redirect=/invite/${encodeURIComponent(token)}`}
          className="font-semibold text-blue-600"
        >
          Sign in to accept
        </Link>
      </p>
    </form>
  );
}
