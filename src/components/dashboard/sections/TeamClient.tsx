"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import type { EmployeeView } from "@/lib/dashboard/types";
import { Icon } from "../icons";
import { Avatar, Meter, Panel, EmptyState } from "../ui";
import { Sheet } from "../Modal";
import { ActionButton, Toolbar } from "./shared";

export function TeamClient({
  initial,
}: {
  initial: EmployeeView[];
}) {
  const [selected, setSelected] = useState<EmployeeView | null>(null);
  const active = initial.filter((e) => e.active).length;

  return (
    <div>
      <Toolbar action={<ActionButton icon="plus">Invite teammate</ActionButton>}>
        <span className="text-[0.8rem] text-ink-faint">
          {active} active · {initial.length} total
        </span>
      </Toolbar>

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
                    {e.invited && (
                      <span className="rounded-[var(--radius-pill)] bg-gold-100 px-2 py-[1px] text-[0.62rem] font-bold tracking-wide text-gold-700 uppercase">
                        Invited
                      </span>
                    )}
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
          <TeamDetail e={selected} />
        </Sheet>
      )}
    </div>
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

function TeamDetail({ e }: { e: EmployeeView }) {
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
            {e.active ? "Active" : e.invited ? "Invitation pending" : "Inactive"}
          </span>
        </div>
      </div>

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
