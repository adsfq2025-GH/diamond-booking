"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { acceptInvitation } from "@/lib/actions/team";

/**
 * Accept button for a signed-in invitee. Every rejection reason the
 * accept_employee_invitation function can report is shown as-is — above all
 * the email mismatch, which is the one a person can actually fix.
 */
export function AcceptInviteForm({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    const result = await acceptInvitation(token);
    if (result.ok) {
      // Their profile is now an employee of this tenant; /team is their home.
      router.replace("/team");
      return;
    }
    setBusy(false);
    setError(result.error);
  }

  return (
    <div className="mt-5">
      {error && (
        <p
          role="alert"
          className="mb-3 rounded-[10px] border border-[#e8c0bd] bg-[#fdf6f5] px-4 py-3 text-[0.85rem] text-[#a63d39]"
        >
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={() => void accept()}
        disabled={busy}
        className="w-full rounded-[10px] bg-navy-700 px-4 py-3 text-[0.88rem] font-semibold text-white transition-colors hover:bg-navy-600 disabled:opacity-60"
      >
        {busy ? "Accepting…" : "Accept invitation"}
      </button>
    </div>
  );
}
