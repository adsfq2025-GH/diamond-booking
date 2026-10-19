"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import type { EmployeeView } from "@/lib/dashboard/types";
import { Icon } from "../icons";
import { Avatar, Meter, Panel, EmptyState } from "../ui";
import { Sheet } from "../Modal";
import { ActionButton, GhostBtn, Toolbar } from "./shared";
import { Modal } from "../Modal";
import { inviteTeammate, revokeInvitation } from "@/lib/actions/team";
import { Label, inputBase } from "@/components/ui/Field";

export function TeamClient({
  initial,
  pending,
  readiness,
}: {
  initial: EmployeeView[];
  /** Live invitations keyed by employee id, so "Invited" means something. */
  pending: Record<string, { email: string; expiresAt: string }>;
  /** Server-computed capacity gaps, or null when they could not be read. */
  readiness: { bookingReady: boolean; blockers: string[] } | null;
}) {
  const [selected, setSelected] = useState<EmployeeView | null>(null);
  const [inviting, setInviting] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const active = initial.filter((e) => e.active).length;
  const router = useRouter();

  return (
    <div>
      {/*
        This button had no onClick at all, and nothing in the app sent an
        invitation: no token, no email, no acceptance route — so a teammate
        could never reach their own schedule (A22).
      */}
      <Toolbar
        action={
          <ActionButton icon="plus" onClick={() => setInviting(true)}>
            Invite teammate
          </ActionButton>
        }
      >
        <span className="text-[0.8rem] text-ink-faint">
          {active} active · {initial.length} total
        </span>
      </Toolbar>

      {/*
        Capacity diagnostics (A35). Availability lives on employee rows the
        owner cannot edit, and before invitations worked no teammate could sign
        in to set their own — so an owner whose widget stopped offering slots
        had no way to find out why. These are the concrete gaps, named.
      */}
      {readiness && readiness.blockers.length > 0 && (
        <div className="mb-4 rounded-[12px] border border-gold-300 bg-gold-50 px-4 py-4">
          <p className="text-[0.85rem] font-semibold text-ink">
            {readiness.bookingReady
              ? "Your booking page is live, but there are gaps"
              : "Your booking page cannot offer any times yet"}
          </p>
          <ul className="mt-2 space-y-1 text-[0.82rem] text-ink-muted">
            {readiness.blockers.map((blocker) => (
              <li key={blocker} className="flex gap-2">
                <span aria-hidden className="text-gold-700">
                  •
                </span>
                <span>{blocker}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {notice && (
        <div
          role="status"
          className={cn(
            "mb-4 rounded-[10px] border px-4 py-3 text-[0.82rem] break-words",
            notice.tone === "error"
              ? "border-[#e8c0bd] bg-[#fdf6f5] text-[#a63d39]"
              : "border-success-500/40 bg-success-50 text-success-700",
          )}
        >
          {notice.text}
        </div>
      )}

      {initial.length === 0 ? (
        <Panel>
          <EmptyState icon="employees" title="No team members" body="Invite your first teammate to start assigning jobs." />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-4 min-[641px]:grid-cols-2 xl:grid-cols-3">
          {initial.map((e) => (
            <Panel key={e.id} className={cn("p-5", !e.active && "opacity-75")}>
              <div className="flex items-start gap-3">
                <Avatar name={e.name} color={e.color} size={46} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-display text-[1rem] font-semibold text-ink">
                      {e.name}
                    </h3>
                    {pending[e.id] ? (
                      <span
                        title={`Invitation sent to ${pending[e.id].email}`}
                        className="rounded-[var(--radius-pill)] bg-gold-100 px-2 py-[1px] text-[0.62rem] font-bold tracking-wide text-gold-700 uppercase"
                      >
                        Invited
                      </span>
                    ) : e.invited ? (
                      // An email on the record but no live invitation: the
                      // badge used to claim "Invited" for exactly this state.
                      <span className="rounded-[var(--radius-pill)] bg-surface-alt px-2 py-[1px] text-[0.62rem] font-bold tracking-wide text-ink-faint uppercase">
                        Not invited
                      </span>
                    ) : null}
                  </div>
                  <p className="text-[0.8rem] text-ink-faint">{e.title ?? "Team member"}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(e)}
                  aria-label={`Open ${e.name}`}
                  className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] text-ink-faint transition-colors hover:bg-surface-alt hover:text-ink"
                >
                  <Icon name="chevronRight" className="h-4 w-4" />
                </button>
              </div>

              {e.active ? (
                <>
                  <div className="mt-4">
                    <div className="mb-1.5 flex items-center justify-between text-[0.75rem]">
                      <span className="text-ink-faint">Utilization</span>
                      <span className="font-instrument font-semibold text-ink-muted">
                        {Math.round(e.utilization * 100)}%
                      </span>
                    </div>
                    <Meter value={e.utilization} color={e.color} />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4">
                    <Mini label="Jobs (mo)" value={String(e.jobsThisMonth)} />
                    <Mini
                      label="Earnings (mo)"
                      value={e.earningsMonthCents > 0 ? money(e.earningsMonthCents) : "—"}
                    />
                  </div>
                </>
              ) : (
                <p className="mt-4 rounded-[10px] border border-dashed border-line-strong px-3 py-2.5 text-[0.78rem] text-ink-faint">
                  Invitation sent to {e.email}. They&rsquo;ll appear here once they accept.
                </p>
              )}
            </Panel>
          ))}
        </div>
      )}

      {selected && (
        <Sheet onClose={() => setSelected(null)} eyebrow={selected.title ?? "Team"} title={selected.name}>
          <TeamDetail
            e={selected}
            pendingInvite={pending[selected.id]}
            onInvite={async () => {
              const result = await inviteTeammate({
                name: selected.name,
                email: pending[selected.id]?.email ?? selected.email ?? "",
                title: selected.title ?? undefined,
                color: selected.color ?? undefined,
              });
              setNotice(
                result.ok
                  ? { tone: "ok", text: result.message }
                  : { tone: "error", text: result.error },
              );
              setSelected(null);
              router.refresh();
            }}
            onRevoke={async () => {
              const result = await revokeInvitation(selected.id);
              setNotice(
                result.ok
                  ? { tone: "ok", text: result.message }
                  : { tone: "error", text: result.error },
              );
              setSelected(null);
              router.refresh();
            }}
          />
        </Sheet>
      )}

      {inviting && (
        <InviteModal
          onClose={() => setInviting(false)}
          onSent={(message, tone) => {
            setNotice({ tone, text: message });
            setInviting(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/** Collects a name and email, then sends a real, expiring invitation. */
function InviteModal({
  onClose,
  onSent,
}: {
  onClose: () => void;
  onSent: (message: string, tone: "ok" | "error") => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    const result = await inviteTeammate({ name, email, title });
    setBusy(false);
    if (result.ok) {
      onSent(result.message, "ok");
      return;
    }
    // Stay open so the owner can correct the address.
    setError(result.error);
  }

  return (
    <Modal
      onClose={onClose}
      title="Invite a teammate"
      description="They'll get a single-use link that expires in 14 days"
      footer={
        <>
          <GhostBtn onClick={onClose}>Cancel</GhostBtn>
          <ActionButton icon="check" onClick={() => void send()}>
            {busy ? "Sending…" : "Send invitation"}
          </ActionButton>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <div
            role="alert"
            className="rounded-[10px] border border-[#e8c0bd] bg-[#fdf6f5] px-4 py-3 text-[0.82rem] text-[#a63d39]"
          >
            {error}
          </div>
        )}
        <div>
          <Label htmlFor="inv-name">Name</Label>
          <input
            id="inv-name"
            className={inputBase}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jordan Reyes"
          />
        </div>
        <div>
          <Label htmlFor="inv-email">Email</Label>
          <input
            id="inv-email"
            type="email"
            className={inputBase}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jordan@example.com"
          />
          <p className="mt-1 text-[0.72rem] text-ink-faint">
            The invitation is tied to this address — they must sign in with it.
          </p>
        </div>
        <div>
          <Label htmlFor="inv-title" hint="Optional">
            Role
          </Label>
          <input
            id="inv-title"
            className={inputBase}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Cleaner"
          />
        </div>
      </div>
    </Modal>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[0.7rem] text-ink-faint">{label}</p>
      <p className="font-instrument mt-0.5 text-[1.05rem] font-semibold text-ink">{value}</p>
    </div>
  );
}

function TeamDetail({
  e,
  pendingInvite,
  onInvite,
  onRevoke,
}: {
  e: EmployeeView;
  pendingInvite?: { email: string; expiresAt: string };
  onInvite: () => Promise<void>;
  onRevoke: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Avatar name={e.name} color={e.color} size={54} />
        <div>
          <p className="text-[0.85rem] text-ink-muted">{e.email ?? "—"}</p>
          <span
            className={cn(
              "mt-1 inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] px-2.5 py-[3px] text-[0.7rem] font-semibold",
              e.active ? "bg-success-50 text-success-700" : "bg-surface-alt text-ink-faint",
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", e.active ? "bg-success-500" : "bg-ink-faint")} />
            {pendingInvite
              ? "Invitation pending"
              : e.active
                ? "Active"
                : "Inactive"}
          </span>
        </div>
      </div>

      {/*
        Invitation state, with the controls that make it real. The panel used
        to say availability "is managed from the teammate's own schedule" while
        no teammate could ever sign in to reach it.
      */}
      <Block title="Account access">
        {pendingInvite ? (
          <div className="space-y-3">
            <p className="text-[0.82rem] leading-[1.6] text-ink-muted">
              An invitation is waiting at{" "}
              <span className="font-semibold text-ink">{pendingInvite.email}</span>. It
              expires on{" "}
              {new Date(pendingInvite.expiresAt).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
              . They can set their working hours once they accept.
            </p>
            <div className="flex gap-2">
              <GhostBtn
                onClick={() => {
                  setBusy(true);
                  void onInvite().finally(() => setBusy(false));
                }}
              >
                {busy ? "Working…" : "Resend"}
              </GhostBtn>
              <GhostBtn
                onClick={() => {
                  setBusy(true);
                  void onRevoke().finally(() => setBusy(false));
                }}
              >
                Revoke
              </GhostBtn>
            </div>
          </div>
        ) : e.profileLinked ? (
          <p className="text-[0.82rem] leading-[1.6] text-ink-muted">
            This teammate has an account and can sign in to manage their own
            working hours and time off.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-[0.82rem] leading-[1.6] text-ink-muted">
              This teammate has no account yet, so they cannot sign in or set
              their working hours. Until they accept an invitation, you can
              still assign them jobs.
            </p>
            <GhostBtn
              onClick={() => {
                setBusy(true);
                void onInvite().finally(() => setBusy(false));
              }}
            >
              {busy ? "Sending…" : e.email ? "Send invitation" : "Add an email first"}
            </GhostBtn>
          </div>
        )}
      </Block>

      <Block title="This month">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Jobs" value={String(e.jobsThisMonth)} />
          <Stat label="Utilization" value={`${Math.round(e.utilization * 100)}%`} />
        </div>
      </Block>

      <Block title="Payroll">
        <KV label="Hourly rate" value={e.hourlyRateCents ? money(e.hourlyRateCents) + "/hr" : "—"} />
        <KV label="Commission" value={e.commissionPct != null ? `${e.commissionPct}%` : "—"} />
        <KV label="Earnings (this month)" value={e.earningsMonthCents > 0 ? money(e.earningsMonthCents) : "—"} />
        <KV label="Services qualified" value={`${e.serviceCount} services`} />
      </Block>

      <Block title="Availability">
        <p className="text-[0.82rem] leading-[1.6] text-ink-muted">
          Weekly availability and time-off requests are managed from the
          teammate&rsquo;s own schedule. Requests appear in your notifications
          for approval.
        </p>
      </Block>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2.5 text-[0.68rem] font-bold tracking-[0.14em] text-ink-faint uppercase">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-line bg-surface-alt/40 px-4 py-3">
      <p className="text-[0.72rem] font-semibold text-ink-faint">{label}</p>
      <p className="font-instrument mt-1 text-[1.3rem] font-semibold text-ink">{value}</p>
    </div>
  );
}
function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-line py-2 last:border-0">
      <span className="text-[0.82rem] text-ink-muted">{label}</span>
      <span className="text-[0.85rem] font-semibold text-ink">{value}</span>
    </div>
  );
}
