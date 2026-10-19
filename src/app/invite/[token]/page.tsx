import type { Metadata } from "next";
import Link from "next/link";
import { getProfile } from "@/lib/auth";
import { invitationPreview } from "@/lib/actions/team";
import { AcceptInviteForm } from "./AcceptInviteForm";

export const metadata: Metadata = { title: "Accept your invitation" };

/**
 * Teammate invitation acceptance (A22).
 *
 * There was no such route: invitations were never created, never emailed and
 * never acceptable, so staff could not reach their own schedule at all.
 *
 * The page is public — the invitee may not have an account yet — but accepting
 * requires being signed in as the invited address, which the
 * accept_employee_invitation function enforces, not this page.
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [preview, profile] = await Promise.all([invitationPreview(token), getProfile()]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[520px] flex-col justify-center px-6 py-16">
      <div className="rounded-[18px] border border-line bg-card p-8 shadow-[0_1px_2px_rgb(12_36_64/0.04)]">
        {!preview ? (
          <>
            <h1 className="font-display text-[1.4rem] font-semibold text-ink">
              This invitation link isn&rsquo;t valid
            </h1>
            <p className="mt-2 text-[0.9rem] leading-[1.6] text-ink-muted">
              It may have been mistyped. Ask the business to send you a new one.
            </p>
          </>
        ) : preview.expired ? (
          <>
            <h1 className="font-display text-[1.4rem] font-semibold text-ink">
              This invitation is no longer active
            </h1>
            <p className="mt-2 text-[0.9rem] leading-[1.6] text-ink-muted">
              It has already been used, was withdrawn, or has expired. Ask{" "}
              {preview.businessName} to send a new invitation.
            </p>
          </>
        ) : (
          <>
            <p className="text-[0.72rem] font-bold tracking-[0.16em] text-ink-faint uppercase">
              Team invitation
            </p>
            <h1 className="mt-2 font-display text-[1.4rem] leading-[1.25] font-semibold text-ink">
              {preview.businessName} added you to their team
            </h1>
            <p className="mt-3 text-[0.9rem] leading-[1.6] text-ink-muted">
              Accepting links this invitation to your account so you can set your
              working hours and see the jobs assigned to you.
            </p>
            <p className="mt-3 rounded-[10px] bg-surface-alt px-4 py-3 text-[0.82rem] text-ink-muted">
              This invitation is for{" "}
              <span className="font-semibold text-ink">{preview.email}</span>. You
              must be signed in with that address to accept it.
            </p>

            {profile ? (
              <AcceptInviteForm token={token} />
            ) : (
              <div className="mt-5 flex flex-col gap-2">
                <Link
                  href={`/login?redirect=/invite/${encodeURIComponent(token)}`}
                  className="rounded-[10px] bg-navy-700 px-4 py-3 text-center text-[0.88rem] font-semibold text-white transition-colors hover:bg-navy-600"
                >
                  Sign in to accept
                </Link>
                <Link
                  href={`/signup?redirect=/invite/${encodeURIComponent(token)}`}
                  className="rounded-[10px] border border-line-strong px-4 py-3 text-center text-[0.88rem] font-semibold text-ink transition-colors hover:border-blue-600 hover:text-blue-600"
                >
                  Create an account
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
