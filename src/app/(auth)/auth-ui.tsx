"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { supabaseEnvConfigured } from "@/lib/env";

/**
 * Shared client-side bits for the auth screens: the card shell, the
 * placeholder-mode "connecting…" submit phase, the not-configured notice,
 * and the server-error banner.
 *
 * With real Supabase keys the forms submit to the server actions in
 * src/lib/actions/auth.ts; in placeholder mode they degrade to the
 * designed fake phase + notice.
 */

/** True when real Supabase keys are configured (not local placeholders). */
export function supabaseConfigured(): boolean {
  return supabaseEnvConfigured();
}

export type ConnectPhase = "idle" | "connecting" | "done";

/** Placeholder-mode submit lifecycle: idle → connecting (~1.1s) → done. */
export function useConnectPhase() {
  const [phase, setPhase] = useState<ConnectPhase>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const begin = () => {
    setPhase("connecting");
    timer.current = setTimeout(() => setPhase("done"), 1100);
  };

  return { phase, begin };
}

export function AuthCard({
  children,
  wide = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        "w-full rounded-[20px] border border-navy-900/8 bg-card shadow-float",
        "px-[clamp(24px,5vw,38px)] py-[clamp(28px,5vw,38px)]",
        wide ? "max-w-[560px]" : "max-w-[440px]",
      )}
    >
      {children}
    </div>
  );
}

export function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-navy-950/25 border-t-navy-950"
    />
  );
}

/**
 * Placeholder-mode notice: shown after a clean submit ONLY when the env
 * still points at local placeholders (real submits go to the server actions).
 */
export function AuthNotice({ action }: { action: string }) {
  return (
    <div
      role="status"
      className="mt-5 flex items-start gap-3 rounded-[12px] border border-blue-200 bg-blue-50 px-4 py-3.5"
    >
      <span className="mt-[2px] flex h-5 w-5 flex-none items-center justify-center rounded-full bg-blue-600 text-[0.6rem] font-bold text-white">
        i
      </span>
      <p className="text-[0.82rem] leading-[1.6] text-navy-800">
        <b className="font-semibold">Everything checks out.</b> {action}{" "}
        activates once real Supabase keys are configured —{" "}
        <code className="rounded bg-navy-900/6 px-1 py-[1px] font-mono text-[0.74rem]">
          NEXT_PUBLIC_SUPABASE_URL
        </code>{" "}
        currently points at a local placeholder.
      </p>
    </div>
  );
}

/** Server-action error banner (invalid credentials, taken email, ...). */
export function AuthError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <div
      role="alert"
      className="mb-5 flex items-start gap-3 rounded-[12px] border border-[#e4b7b5] bg-[#fdf6f5] px-4 py-3.5"
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
