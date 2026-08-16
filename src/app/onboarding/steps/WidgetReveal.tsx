"use client";

import Link from "next/link";
import { useState } from "react";
import { Em } from "@/components/ui/SectionHeading";
import { InfoNote } from "../wizard-ui";
import { cn } from "@/lib/cn";

/**
 * The onboarding payoff: embed snippet + copy button + live preview frame,
 * and the gold "Go to dashboard" CTA. Shown once onboarding is complete.
 */
export function WidgetReveal({
  publicKey,
  appUrl,
  businessName,
}: {
  publicKey: string;
  appUrl: string;
  businessName: string;
}) {
  const [copied, setCopied] = useState(false);

  const snippet = `<script src="${appUrl}/embed.js" data-key="${publicKey}" async></script>`;
  const bookingUrl = `${appUrl}/book/${publicKey}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Clipboard unavailable (permissions/iframe) — user can select manually.
    }
  };

  return (
    <div>
      <div className="mb-7 text-center">
        <span
          aria-hidden
          className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[18px] bg-[linear-gradient(180deg,var(--gold-400)_0%,var(--gold-500)_55%,var(--gold-600)_100%)] shadow-[var(--shadow-gold)]"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8" aria-hidden>
            <path
              d="M12 3l7 6-7 12L5 9l7-6z"
              stroke="var(--navy-950)"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <path d="M5 9h14M12 3L9 9l3 12 3-12-3-6z" stroke="var(--navy-950)" strokeWidth="1" strokeLinejoin="round" />
          </svg>
        </span>
        <h1 className="font-display text-[clamp(1.6rem,4vw,2.2rem)] leading-[1.12] font-bold tracking-[-0.025em] text-ink">
          {businessName} is <Em tone="gold">ready to book.</Em>
        </h1>
        <p className="mx-auto mt-2.5 max-w-[36em] text-[0.9rem] leading-[1.65] font-light text-ink-muted">
          Paste this one line into your website — the booking widget appears
          instantly, styled with your brand, no double bookings possible.
        </p>
      </div>

      {/* Embed snippet */}
      <div className="mb-5 overflow-hidden rounded-[14px] border border-navy-900/20 bg-navy-950 shadow-lift">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5">
          <span className="text-[0.68rem] font-bold tracking-[0.14em] text-white/50 uppercase">
            Your embed code
          </span>
          <button
            type="button"
            onClick={copy}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1.5 rounded-[8px] border px-3 py-1.5 text-[0.72rem] font-semibold",
              "transition-[background-color,border-color,color] duration-[var(--duration-fast)]",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300",
              copied
                ? "border-success-500/50 bg-success-500/15 text-success-500"
                : "border-white/25 bg-white/5 text-white hover:border-white/50 hover:bg-white/10",
            )}
          >
            {copied ? (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="h-3 w-3" aria-hidden>
                  <path d="M4 12.5l5 5L20 6.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Copied
              </>
            ) : (
              "Copy snippet"
            )}
          </button>
        </div>
        <pre className="overflow-x-auto px-4 py-4 font-mono text-[0.78rem] leading-[1.7] whitespace-pre text-blue-200">
          <code>{snippet}</code>
        </pre>
      </div>

      {/* Live preview frame */}
      <div className="mb-5 overflow-hidden rounded-[14px] border border-navy-900/8 bg-card shadow-[0_1px_3px_rgb(12_36_64/0.05)]">
        <div className="flex items-center gap-2 border-b border-line bg-surface-alt px-4 py-2.5">
          <span aria-hidden className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#e0655f]" />
            <span className="h-2.5 w-2.5 rounded-full bg-gold-500" />
            <span className="h-2.5 w-2.5 rounded-full bg-success-500" />
          </span>
          <span className="ml-2 flex-1 truncate rounded-[6px] border border-line bg-card px-2.5 py-1 font-mono text-[0.68rem] text-ink-faint">
            {bookingUrl}
          </span>
        </div>
        <iframe
          src={bookingUrl}
          title="Booking page preview"
          className="h-[300px] w-full bg-surface"
        />
      </div>

      <div className="mb-7">
        <InfoNote>
          <b className="font-semibold">Preview note:</b> the hosted booking
          page at <code className="rounded bg-navy-900/6 px-1 py-[1px] font-mono text-[0.72rem]">/book/…</code>{" "}
          ships in the widget phase — until then the frame above may show a
          404. Your embed key is live and permanent either way.
        </InfoNote>
      </div>

      <div className="flex justify-center">
        <Link
          href="/dashboard"
          className={cn(
            "group inline-flex cursor-pointer items-center justify-center gap-2.5 rounded-[10px] border border-transparent px-[34px] py-[15px] text-[0.9375rem] font-semibold",
            "bg-[linear-gradient(180deg,var(--gold-400)_0%,var(--gold-500)_55%,var(--gold-600)_100%)] text-navy-950 shadow-[var(--shadow-gold)]",
            "transition-[transform,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-out-expo)]",
            "hover:-translate-y-0.5 hover:shadow-[var(--shadow-gold-hover)] active:translate-y-0 active:scale-[0.99]",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600",
          )}
        >
          Go to dashboard
          <span
            aria-hidden
            className="transition-transform duration-[var(--duration-fast)] ease-[var(--ease-out-expo)] group-hover:translate-x-[3px]"
          >
            →
          </span>
        </Link>
      </div>
    </div>
  );
}
