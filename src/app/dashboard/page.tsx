import type { Metadata } from "next";
import Link from "next/link";
import { Em } from "@/components/ui/SectionHeading";
import { cn } from "@/lib/cn";
import { money, relativeDay, timeRange } from "@/lib/format";
import { getDashboardContext, getOverview } from "@/lib/dashboard/data";
import { RevenueBarChart, SegmentBar, type Segment } from "@/components/dashboard/charts";
import { Icon, type IconName } from "@/components/dashboard/icons";
import {
  Avatar,
  BookingStatusBadge,
  EmptyState,
  Meter,
  Panel,
  PanelHeader,
  PanelLink,
  StatCard,
} from "@/components/dashboard/ui";
import type { ActivityKind } from "@/lib/dashboard/types";
import type { BookingStatus } from "@/types/database";

export const metadata: Metadata = { title: "Overview" };

const STATUS_COLORS: Record<BookingStatus, string> = {
  confirmed: "var(--blue-500)",
  pending: "var(--gold-500)",
  completed: "var(--success-500)",
  cancelled: "var(--ink-faint)",
  rescheduled: "var(--navy-400)",
  no_show: "#c25450",
};

const STATUS_LABELS: Record<BookingStatus, string> = {
  confirmed: "Confirmed",
  pending: "Pending",
  completed: "Completed",
  cancelled: "Cancelled",
  rescheduled: "Rescheduled",
  no_show: "No-show",
};

const ACTIVITY_ICON: Record<ActivityKind, { icon: IconName; tone: string }> = {
  booking_created: { icon: "bookings", tone: "bg-blue-50 text-blue-600" },
  booking_confirmed: { icon: "check", tone: "bg-success-50 text-success-700" },
  payment: { icon: "payments", tone: "bg-success-50 text-success-700" },
  review: { icon: "sparkle", tone: "bg-gold-100 text-gold-700" },
  cancellation: { icon: "close", tone: "bg-[#fbeaea] text-[#a63d39]" },
  invoice: { icon: "invoices", tone: "bg-navy-50 text-navy-600" },
};

export default async function OverviewPage() {
  const [context, data] = await Promise.all([
    getDashboardContext(),
    getOverview(),
  ]);
  const firstName = context.ownerName.split(" ")[0] || "there";

  const segments: Segment[] = data.statusCounts.map((s) => ({
    label: STATUS_LABELS[s.status],
    value: s.count,
    color: STATUS_COLORS[s.status],
  }));

  return (
    <div className="space-y-7">
      {/* Header */}
      <div className="flex flex-col gap-4 min-[721px]:flex-row min-[721px]:items-end min-[721px]:justify-between">
        <div>
          <p className="text-[0.82rem] font-medium text-ink-faint">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
          <h2 className="mt-1 font-display text-[clamp(1.5rem,3.5vw,2rem)] leading-tight font-bold tracking-[-0.03em] text-ink">
            Welcome back, <Em>{firstName}.</Em>
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/dashboard/calendar"
            className="inline-flex items-center gap-2 rounded-[10px] border border-line-strong bg-card px-4 py-2.5 text-[0.84rem] font-semibold text-ink transition-[transform,border-color,color] duration-[var(--duration-fast)] hover:-translate-y-0.5 hover:border-blue-600 hover:text-blue-600"
          >
            <Icon name="calendar" className="h-4 w-4" />
            Calendar
          </Link>
          <Link
            href="/dashboard/bookings?new=1"
            className={cn(
              "group inline-flex items-center gap-2 rounded-[10px] border border-transparent px-4 py-2.5 text-[0.84rem] font-semibold",
              "bg-[linear-gradient(180deg,var(--gold-400)_0%,var(--gold-500)_55%,var(--gold-600)_100%)] text-navy-950 shadow-[var(--shadow-gold)]",
              "transition-[transform,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-out-expo)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-gold-hover)]",
            )}
          >
            <Icon name="plus" className="h-4 w-4" />
            New booking
          </Link>
        </div>
      </div>

      {/* Onboarding resume banner */}
      {!context.onboardingComplete && (
        <div className="flex flex-col gap-3 rounded-[16px] border border-gold-300 bg-gold-50 px-5 py-4 min-[561px]:flex-row min-[561px]:items-center min-[561px]:justify-between">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full bg-gold-500 text-navy-950">
              <Icon name="sparkle" className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[0.9rem] font-semibold text-ink">
                Finish setting up your booking widget
              </p>
              <p className="mt-0.5 text-[0.8rem] text-ink-muted">
                A few steps left before you can take bookings online.
              </p>
            </div>
          </div>
          <Link
            href="/onboarding"
            className="inline-flex flex-none items-center justify-center gap-2 rounded-[10px] bg-navy-900 px-4 py-2.5 text-[0.82rem] font-semibold text-white transition-colors hover:bg-navy-800"
          >
            Resume setup
            <Icon name="arrowRight" className="h-4 w-4" />
          </Link>
        </div>
      )}

      {/* KPI grid */}
      <div className="grid grid-cols-1 gap-4 min-[521px]:grid-cols-2 xl:grid-cols-4">
        {data.stats.map((s) => (
          <StatCard
            key={s.label}
            label={s.label}
            value={s.value}
            delta={s.delta}
            invertDelta={s.invertDelta}
            caption={s.caption}
          />
        ))}
      </div>

      {/* Main two-column area */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Left column */}
        <div className="space-y-5 lg:col-span-2">
          <Panel>
            <PanelHeader
              title="Revenue"
              caption="Collected payments, last 8 months"
              action={
                <span className="font-instrument text-[1.15rem] font-semibold text-ink">
                  {money(data.revenueTotalCents)}
                </span>
              }
            />
            <div className="px-5 py-5">
              <RevenueBarChart bars={data.revenueBars} height={188} />
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              title="Upcoming jobs"
              caption="Next confirmed & pending appointments"
              action={<PanelLink href="/dashboard/bookings">All bookings</PanelLink>}
            />
            {data.upcoming.length === 0 ? (
              <EmptyState
                icon="calendar"
                title="No upcoming jobs"
                body="New bookings from your widget and portal will appear here."
              />
            ) : (
              <ul className="divide-y divide-line">
                {data.upcoming.map((job) => (
                  <li
                    key={job.id}
                    className="flex items-center gap-3.5 px-5 py-3.5 transition-colors duration-[var(--duration-fast)] hover:bg-surface-alt/60"
                  >
                    <Avatar name={job.employeeName} color={job.employeeColor} size={38} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[0.88rem] font-semibold text-ink">
                          {job.customerName}
                        </p>
                        <BookingStatusBadge status={job.status} />
                      </div>
                      <p className="mt-0.5 truncate text-[0.78rem] text-ink-muted">
                        {job.serviceName}
                        {job.addressLine && (
                          <span className="text-ink-faint"> · {job.addressLine}</span>
                        )}
                      </p>
                    </div>
                    <div className="flex-none text-right">
                      <p className="text-[0.8rem] font-semibold text-ink">
                        {relativeDay(job.startsAt)}
                      </p>
                      <p className="mt-0.5 text-[0.73rem] text-ink-faint">
                        {timeRange(job.startsAt, job.endsAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        {/* Right column */}
        <div className="space-y-5">
          <Panel>
            <PanelHeader title="Bookings by status" caption="Current pipeline" />
            <div className="px-5 py-5">
              {segments.length === 0 ? (
                <p className="py-4 text-center text-[0.82rem] text-ink-faint">
                  No bookings yet.
                </p>
              ) : (
                <SegmentBar segments={segments} />
              )}
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              title="Team utilization"
              caption="Booked hours this week"
              action={<PanelLink href="/dashboard/employees">Team</PanelLink>}
            />
            <ul className="space-y-4 px-5 py-5">
              {data.utilization.map((row) => (
                <li key={row.employeeId}>
                  <div className="mb-1.5 flex items-center gap-2.5">
                    <Avatar name={row.name} color={row.color} size={26} />
                    <span className="flex-1 truncate text-[0.82rem] font-medium text-ink">
                      {row.name}
                    </span>
                    <span className="font-instrument text-[0.8rem] font-semibold text-ink-muted">
                      {Math.round(row.utilization * 100)}%
                    </span>
                  </div>
                  <Meter value={row.utilization} color={row.color} />
                </li>
              ))}
            </ul>
          </Panel>

          <Panel>
            <PanelHeader title="Recent activity" />
            <ul className="divide-y divide-line">
              {data.activity.map((item) => {
                const cfg = ACTIVITY_ICON[item.kind];
                return (
                  <li key={item.id} className="flex items-start gap-3 px-5 py-3">
                    <span
                      className={cn(
                        "mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full",
                        cfg.tone,
                      )}
                    >
                      <Icon name={cfg.icon} className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.82rem] font-medium text-ink">
                        {item.title}
                      </p>
                      <p className="truncate text-[0.76rem] text-ink-faint">
                        {item.detail}
                      </p>
                    </div>
                    <span className="flex-none text-[0.72rem] text-ink-faint">
                      {relativeDay(item.at)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
