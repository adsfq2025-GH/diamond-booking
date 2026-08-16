"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { money, relativeDay, shortDate, timeRange } from "@/lib/format";
import type { EmployeePortal, EmpJob } from "@/lib/portal/data";
import { WEEKDAY_LABELS } from "@/lib/onboarding/types";
import { Icon } from "@/components/dashboard/icons";
import { BookingStatusBadge, Panel, PanelHeader, StatCard, EmptyState } from "@/components/dashboard/ui";
import { PreviewNotice } from "@/components/dashboard/sections/shared";

type Tab = "schedule" | "earnings" | "availability" | "requests";
const TABS: Array<{ key: Tab; label: string }> = [
  { key: "schedule", label: "My schedule" },
  { key: "earnings", label: "Earnings" },
  { key: "availability", label: "Availability" },
  { key: "requests", label: "Requests" },
];

export function EmployeePortalClient({
  data,
  preview,
}: {
  data: EmployeePortal;
  preview: boolean;
}) {
  const [tab, setTab] = useState<Tab>("schedule");

  return (
    <div>
      {preview && <PreviewNotice>You&rsquo;re viewing a demo employee account. Connect Supabase to see your real schedule.</PreviewNotice>}

      <div className="mb-6">
        <h1 className="font-display text-[clamp(1.4rem,3.5vw,1.9rem)] font-bold tracking-[-0.03em] text-ink">
          Hi, {data.name.split(" ")[0]}.
        </h1>
        <p className="mt-1 text-[0.88rem] text-ink-muted">
          {data.today.length > 0
            ? `You have ${data.today.length} ${data.today.length === 1 ? "job" : "jobs"} today.`
            : "No jobs scheduled today."}
        </p>
      </div>

      <div className="mb-5 flex gap-1.5 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "flex-none rounded-[var(--radius-pill)] border px-4 py-2 text-[0.82rem] font-semibold transition-colors",
              tab === t.key
                ? "border-transparent bg-navy-900 text-white"
                : "border-line-strong bg-card text-ink-muted hover:border-blue-600 hover:text-blue-600",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "schedule" && <ScheduleTab data={data} />}
      {tab === "earnings" && <EarningsTab data={data} />}
      {tab === "availability" && <AvailabilityTab data={data} />}
      {tab === "requests" && <RequestsTab data={data} preview={preview} />}
    </div>
  );
}

function JobRow({ job }: { job: EmpJob }) {
  return (
    <li className="flex items-center gap-4 px-5 py-3.5">
      <div className="flex-none text-center">
        <p className="text-[0.7rem] font-bold tracking-wide text-ink-faint uppercase">
          {new Date(job.startsAt).toLocaleDateString("en-US", { month: "short" })}
        </p>
        <p className="font-instrument text-[1.3rem] leading-none font-semibold text-ink">
          {new Date(job.startsAt).getDate()}
        </p>
      </div>
      <div className="min-w-0 flex-1 border-l border-line pl-4">
        <div className="flex items-center gap-2">
          <p className="truncate text-[0.9rem] font-semibold text-ink">{job.serviceName}</p>
          <BookingStatusBadge status={job.status} />
        </div>
        <p className="mt-0.5 text-[0.8rem] text-ink-muted">{job.customerName}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[0.75rem] text-ink-faint">
          <span className="inline-flex items-center gap-1">
            <Icon name="clock" className="h-3.5 w-3.5" />
            {timeRange(job.startsAt, job.endsAt)}
          </span>
          {job.addressLine && (
            <span className="inline-flex items-center gap-1">
              <Icon name="mapPin" className="h-3.5 w-3.5" />
              {job.addressLine}
            </span>
          )}
        </div>
        {job.notes && (
          <p className="mt-1.5 rounded-[8px] bg-surface-alt px-2.5 py-1.5 text-[0.75rem] text-ink-muted">
            {job.notes}
          </p>
        )}
      </div>
      <div className="flex-none text-right">
        <p className="text-[0.7rem] text-ink-faint">Your pay</p>
        <p className="font-instrument text-[0.95rem] font-semibold text-ink">{money(job.payCents)}</p>
      </div>
    </li>
  );
}

function ScheduleTab({ data }: { data: EmployeePortal }) {
  return (
    <div className="space-y-5">
      <Panel>
        <PanelHeader title="Today" caption={new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} />
        {data.today.length === 0 ? (
          <EmptyState icon="calendar" title="Nothing today" body="Enjoy the day off — your next jobs are below." />
        ) : (
          <ul className="divide-y divide-line">
            {data.today.map((j) => (
              <JobRow key={j.id} job={j} />
            ))}
          </ul>
        )}
      </Panel>
      <Panel>
        <PanelHeader title="Upcoming" caption="Your assigned jobs" />
        <ul className="divide-y divide-line">
          {data.upcoming.map((j) => (
            <JobRow key={j.id} job={j} />
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function EarningsTab({ data }: { data: EmployeePortal }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 min-[521px]:grid-cols-3">
        <StatCard label="This month" value={money(data.earnings.monthCents)} caption={`${data.earnings.jobsMonth} jobs`} />
        <StatCard label="Hours worked" value={String(data.earnings.hoursMonth)} caption="this month" />
        <StatCard label="Last month" value={money(data.earnings.lastMonthCents)} caption="paid out" />
      </div>
      <Panel>
        <PanelHeader title="Payroll history" caption="Your earnings by period" />
        <ul className="divide-y divide-line">
          {data.payHistory.map((p) => (
            <li key={p.period} className="flex items-center justify-between px-5 py-3.5">
              <div>
                <p className="text-[0.88rem] font-semibold text-ink">{p.period}</p>
                <p className="text-[0.76rem] text-ink-faint">{p.jobs} jobs · {p.hours} hours</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-instrument text-[1rem] font-semibold text-ink">{money(p.amountCents)}</span>
                <span
                  className={cn(
                    "rounded-[var(--radius-pill)] px-2.5 py-[3px] text-[0.7rem] font-semibold",
                    p.status === "paid" ? "bg-success-50 text-success-700" : "bg-gold-100 text-gold-700",
                  )}
                >
                  {p.status === "paid" ? "Paid" : "Pending"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function AvailabilityTab({ data }: { data: EmployeePortal }) {
  return (
    <div className="space-y-5">
      <Panel>
        <PanelHeader title="Weekly availability" caption="When you're available for jobs" />
        <ul className="divide-y divide-line">
          {data.availability.map((a) => (
            <li key={a.weekday} className="flex items-center justify-between px-5 py-3">
              <span className="text-[0.86rem] font-medium text-ink">{WEEKDAY_LABELS[a.weekday]}</span>
              {a.start && a.end ? (
                <span className="font-instrument text-[0.85rem] text-ink-muted">{a.start} – {a.end}</span>
              ) : (
                <span className="text-[0.8rem] text-ink-faint">Unavailable</span>
              )}
            </li>
          ))}
        </ul>
      </Panel>
      <Panel>
        <PanelHeader title="Time off" caption="Requests to be away" />
        {data.timeOff.length === 0 ? (
          <EmptyState icon="calendar" title="No time-off requests" />
        ) : (
          <ul className="divide-y divide-line">
            {data.timeOff.map((t) => (
              <li key={t.id} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <p className="text-[0.86rem] font-semibold text-ink">
                    {shortDate(t.from)} – {shortDate(t.to)}
                  </p>
                  <p className="text-[0.76rem] text-ink-faint">{t.reason}</p>
                </div>
                <span
                  className={cn(
                    "rounded-[var(--radius-pill)] px-2.5 py-[3px] text-[0.7rem] font-semibold",
                    t.status === "approved" ? "bg-success-50 text-success-700" : "bg-gold-100 text-gold-700",
                  )}
                >
                  {t.status === "approved" ? "Approved" : "Pending"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function RequestsTab({ data, preview }: { data: EmployeePortal; preview: boolean }) {
  return (
    <Panel>
      <PanelHeader
        title="Requests"
        caption="Messages to your manager"
        action={
          <button
            type="button"
            className="rounded-[9px] bg-navy-900 px-3.5 py-2 text-[0.8rem] font-semibold text-white transition-colors hover:bg-navy-800"
            title={preview ? "Preview mode" : undefined}
          >
            New request
          </button>
        }
      />
      <ul className="divide-y divide-line">
        {data.requests.map((r) => (
          <li key={r.id} className="px-5 py-3.5">
            <div className="flex items-center justify-between">
              <p className="text-[0.86rem] font-semibold text-ink">{r.kind}</p>
              <span className="text-[0.72rem] text-ink-faint">{relativeDay(r.at)}</span>
            </div>
            <p className="mt-1 text-[0.82rem] text-ink-muted">{r.body}</p>
            <span
              className={cn(
                "mt-2 inline-flex rounded-[var(--radius-pill)] px-2.5 py-[3px] text-[0.7rem] font-semibold",
                r.status === "approved"
                  ? "bg-success-50 text-success-700"
                  : r.status === "denied"
                    ? "bg-[#fbeaea] text-[#a63d39]"
                    : "bg-gold-100 text-gold-700",
              )}
            >
              {r.status[0].toUpperCase() + r.status.slice(1)}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
