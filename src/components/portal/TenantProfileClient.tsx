"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { money, relativeDay } from "@/lib/format";
import { cn } from "@/lib/cn";
import { saveAdminTenantNote, scheduleAdminTenantFollowUp } from "@/lib/actions/admin";
import type { AdminTenantMutationState } from "@/lib/actions/admin";
import type { AdminTenant } from "@/lib/portal/admin-data";
import { Meter, Panel, PanelHeader, StatCard } from "@/components/dashboard/ui";
import { ActionButton, GhostBtn } from "@/components/dashboard/sections/shared";
import { Modal } from "@/components/dashboard/Modal";

const PLAN_LABEL = { starter: "Starter", professional: "Professional", elite: "Elite" };

export function TenantProfileClient({
  tenant,
}: {
  tenant: AdminTenant;
}) {
  const [notes, setNotes] = useState(tenant.notes);
  const [draftNote, setDraftNote] = useState("");
  const [followUpDraft, setFollowUpDraft] = useState(tenant.nextFollowUpAt ?? "");
  const [followUpSaved, setFollowUpSaved] = useState(tenant.nextFollowUpAt ?? "");
  const [timeline, setTimeline] = useState(tenant.activityTimeline);
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [noteMessage, setNoteMessage] = useState<string | null>(null);
  const [followUpMessage, setFollowUpMessage] = useState<string | null>(null);
  const [, noteAction, notePending] = useActionState<AdminTenantMutationState, FormData>(saveAdminTenantNote, null);
  const [, followUpAction, followUpPending] = useActionState<AdminTenantMutationState, FormData>(scheduleAdminTenantFollowUp, null);
  function addNote(value: string) {
    if (!value) return;
    setNotes((prev) => [value, ...prev]);
    setTimeline((prev) => [
      {
        id: `note_${prev.length + 1}`,
        label: "Internal note added",
        detail: value,
        at: new Date().toISOString(),
      },
      ...prev,
    ]);
  }

  function saveFollowUp(value: string) {
    if (!value) return;
    setFollowUpSaved(value);
    setTimeline((prev) => [
      {
        id: `follow_up_${prev.length + 1}`,
        label: "Follow-up scheduled",
        detail: `Next admin follow-up scheduled for ${value}.`,
        at: new Date().toISOString(),
      },
      ...prev,
    ]);
    setShowFollowUpModal(false);
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href="/admin?tab=tenants" className="text-[0.78rem] font-semibold text-blue-600 transition-colors hover:text-blue-700">
              ← Back to tenants
            </Link>
            <h1 className="mt-2 font-display text-[clamp(1.6rem,3.8vw,2.1rem)] font-bold tracking-[-0.03em] text-ink">
              {tenant.name}
            </h1>
            <p className="mt-1 text-[0.9rem] text-ink-muted">
              {tenant.businessCategory} · {PLAN_LABEL[tenant.plan]} plan · {tenant.timezone}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <GhostBtn>Impersonate</GhostBtn>
            <GhostBtn onClick={() => setShowFollowUpModal(true)}>Schedule follow-up</GhostBtn>
            <ActionButton>Open support workflow</ActionButton>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 min-[521px]:grid-cols-2 xl:grid-cols-4">
          <StatCard label="MRR" value={money(tenant.mrrCents)} caption="current monthly revenue" />
          <StatCard label="Bookings 30d" value={String(tenant.bookings30d)} caption="latest activity window" />
          <StatCard label="Health score" value={`${tenant.healthScore}/100`} caption={tenant.healthTier.replace("_", " ")} />
          <StatCard label="Onboarding" value={`${Math.round(tenant.onboardingProgress * 100)}%`} caption="launch readiness" />
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.35fr_0.95fr]">
          <Panel>
            <PanelHeader title="Business profile" caption="Core tenant context" />
            <div className="grid gap-3 px-5 py-5 sm:grid-cols-2">
              <DetailRow label="Owner" value={tenant.ownerName} />
              <DetailRow label="Email" value={tenant.ownerEmail} />
              <DetailRow label="Tenant ID" value={tenant.id} />
              <DetailRow label="Plan" value={PLAN_LABEL[tenant.plan]} />
              <DetailRow label="Status" value={tenant.status.replace("_", " ")} />
              <DetailRow label="Lifecycle" value={tenant.lifecycle.replace("_", " ")} />
              <DetailRow label="Joined" value={relativeDay(tenant.joinedAt)} />
              <DetailRow label="Last active" value={relativeDay(tenant.lastActiveAt)} />
              <DetailRow label="Timezone" value={tenant.timezone} />
              <DetailRow label="Category" value={tenant.businessCategory} />
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Launch readiness" caption="Setup and booking state" />
            <div className="space-y-4 px-5 py-5">
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2 text-[0.78rem] text-ink-muted">
                  <span>Onboarding progress</span>
                  <span>{Math.round(tenant.onboardingProgress * 100)}%</span>
                </div>
                <Meter value={tenant.onboardingProgress} color="var(--gold-500)" />
              </div>
              <DetailRow label="Widget" value={tenant.widgetPublished ? "Published" : "Not published"} />
              <DetailRow label="First booking" value={tenant.firstBookingAt ? relativeDay(tenant.firstBookingAt) : "No bookings yet"} />
              <DetailRow label="Payment health" value={tenant.paymentStatus.replace("_", " ")} />
              <DetailRow label="Next follow-up" value={followUpSaved ? relativeDay(followUpSaved) : "Not scheduled"} />
            </div>
          </Panel>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <Panel>
            <PanelHeader title="Internal notes" caption="Operator-only context" />
            <div className="space-y-3 px-5 py-5">
              <form
                action={async (formData) => {
                  const noteValue = draftNote.trim();
                  if (!noteValue) return;
                  setNoteMessage(null);
                  addNote(noteValue);
                  setDraftNote("");
                  formData.set("tenantId", tenant.id);
                  formData.set("note", noteValue);
                  const result = ((await noteAction(formData)) ?? null) as unknown as AdminTenantMutationState;
                  if (result && result.error) {
                    setNoteMessage(result.error);
                    return;
                  }
                  setNoteMessage("Note saved.");
                }}
                className="space-y-2"
              >
                <input type="hidden" name="tenantId" value={tenant.id} />
                <textarea
                  name="note"
                  value={draftNote}
                  onChange={(event) => setDraftNote(event.target.value)}
                  rows={3}
                  placeholder="Add a private admin note for future follow-up."
                  className="w-full rounded-[12px] border border-line-strong bg-card px-3.5 py-2.5 text-[0.82rem] text-ink placeholder:text-ink-faint/80 focus:border-blue-600 focus:ring-[3px] focus:ring-blue-600/15 focus:outline-none"
                />
                <div className="flex justify-end">
                  <ActionButton type="submit" disabled={!draftNote.trim() || notePending}>
                    {notePending ? "Saving..." : "Add note"}
                  </ActionButton>
                </div>
                {noteMessage ? <p className={cn("text-[0.76rem]", noteMessage.toLowerCase().includes("couldn't") ? "text-rose-600" : "text-success-700")}>{noteMessage}</p> : null}
              </form>
              <ul className="space-y-2 text-[0.84rem] text-ink-muted">
                {notes.map((note) => (
                  <li key={note} className="rounded-[12px] bg-surface-alt px-3.5 py-3">
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Recommended next actions" caption="Suggested operator flow" />
            <div className="space-y-2 px-5 py-5 text-[0.84rem] text-ink-muted">
              <ActionCard>Review billing state and confirm recovery path if payment health is not okay.</ActionCard>
              <ActionCard>Check onboarding completion blockers before sending launch assistance.</ActionCard>
              <ActionCard>Use impersonation only after reviewing notes, activity, and support status.</ActionCard>
            </div>
          </Panel>
        </div>

        <Panel>
          <PanelHeader title="Activity timeline" caption="Recent tenant events" />
          <ul className="divide-y divide-line px-5">
            {timeline.map((event) => (
              <li key={event.id} className="flex items-start gap-3 py-4">
                <span className="mt-0.5 inline-flex h-8 w-8 flex-none items-center justify-center rounded-full bg-surface-alt text-ink-faint">
                  •
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[0.84rem] font-semibold text-ink">{event.label}</p>
                  <p className="mt-1 text-[0.8rem] leading-[1.55] text-ink-muted">{event.detail}</p>
                </div>
                <span className="flex-none text-[0.74rem] text-ink-faint">{relativeDay(event.at)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {showFollowUpModal && (
        <Modal
          open
          onClose={() => setShowFollowUpModal(false)}
          size="sm"
          title="Schedule follow-up"
          description="Set the next admin touchpoint for this tenant."
          footer={
            <>
              <GhostBtn onClick={() => setShowFollowUpModal(false)}>Cancel</GhostBtn>
              <ActionButton type="submit" disabled={!followUpDraft || followUpPending}>
                {followUpPending ? "Saving..." : "Save follow-up"}
              </ActionButton>
            </>
          }
        >
          <form
            id="follow-up-form"
            action={async (formData) => {
              const nextFollowUp = followUpDraft;
              if (!nextFollowUp) return;
              setFollowUpMessage(null);
              saveFollowUp(nextFollowUp);
              formData.set("tenantId", tenant.id);
              formData.set("followUpAt", nextFollowUp);
              const result = ((await followUpAction(formData)) ?? null) as unknown as AdminTenantMutationState;
              if (result && result.error) {
                setFollowUpMessage(result.error);
                return;
              }
              setFollowUpMessage("Follow-up saved.");
            }}
            className="space-y-3 text-[0.82rem] text-ink-muted"
          >
            <input type="hidden" name="tenantId" value={tenant.id} />
            <p>Save the next follow-up date to keep this tenant on the admin radar.</p>
            <input
              type="datetime-local"
              name="followUpAt"
              value={toDateTimeLocalValue(followUpDraft)}
              onChange={(event) => setFollowUpDraft(fromDateTimeLocalValue(event.target.value))}
              className="w-full rounded-[12px] border border-line-strong bg-card px-3.5 py-2.5 text-[0.82rem] text-ink focus:border-blue-600 focus:ring-[3px] focus:ring-blue-600/15 focus:outline-none"
            />
            {followUpMessage ? <p className={cn("text-[0.76rem]", followUpMessage.toLowerCase().includes("couldn't") ? "text-rose-600" : "text-success-700")}>{followUpMessage}</p> : null}
          </form>
        </Modal>
      )}
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-line bg-surface-alt/55 px-3.5 py-3">
      <p className="text-[0.68rem] font-bold tracking-[0.08em] text-ink-faint uppercase">{label}</p>
      <p className={cn("mt-1 text-[0.88rem] font-medium text-ink", label === "Email" && "break-all")}>{value}</p>
    </div>
  );
}

function ActionCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[12px] bg-surface-alt px-3.5 py-3">{children}</div>;
}

function toDateTimeLocalValue(value: string) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 16);
}

function fromDateTimeLocalValue(value: string) {
  if (!value) return "";
  return new Date(value).toISOString();
}
