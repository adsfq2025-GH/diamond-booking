/**
 * Presentational primitives for the dashboard app surface. Token-driven and
 * server-safe (no client hooks). The app surface is a lighter, denser cousin
 * of the marketing Card: 16px radius, hairline navy border, quiet lift.
 */
import Link from "next/link";
import { cn } from "@/lib/cn";
import { initials, signedPercent } from "@/lib/format";
import type { BookingStatus, InvoiceStatus, PaymentStatus } from "@/types/database";
import { Icon, type IconName } from "./icons";

/** Base app panel. */
export function Panel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-[16px] border border-navy-900/8 bg-card shadow-[var(--shadow-lift)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Panel header row with title, optional caption and trailing slot. */
export function PanelHeader({
  title,
  caption,
  action,
  className,
}: {
  title: React.ReactNode;
  caption?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 border-b border-line px-5 py-4",
        className,
      )}
    >
      <div>
        <h2 className="font-display text-[1.02rem] leading-tight font-semibold tracking-[-0.02em] text-ink">
          {title}
        </h2>
        {caption && (
          <p className="mt-0.5 text-[0.78rem] text-ink-faint">{caption}</p>
        )}
      </div>
      {action && <div className="flex-none">{action}</div>}
    </div>
  );
}

/** Page-level section heading used above grids of panels. */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-[0.7rem] font-bold tracking-[0.16em] text-ink-faint uppercase">
      {children}
    </p>
  );
}

/** Signed trend chip. Up = green, down = red, unless `invert`. */
export function DeltaChip({
  delta,
  invert = false,
}: {
  delta: number | null;
  invert?: boolean;
}) {
  if (delta === null || Number.isNaN(delta)) return null;
  const good = invert ? delta <= 0 : delta >= 0;
  const up = delta >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[var(--radius-pill)] px-2 py-[3px] text-[0.7rem] font-semibold",
        good ? "bg-success-50 text-success-700" : "bg-[#fbeaea] text-[#a63d39]",
      )}
    >
      <Icon
        name={up ? "arrowUp" : "arrowDown"}
        className="h-3 w-3"
      />
      {signedPercent(Math.abs(delta))}
    </span>
  );
}

/** KPI tile. */
export function StatCard({
  label,
  value,
  delta,
  invertDelta,
  caption,
}: {
  label: string;
  value: string;
  delta?: number | null;
  invertDelta?: boolean;
  caption?: string;
}) {
  return (
    <Panel className="p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[0.78rem] font-semibold tracking-[-0.005em] text-ink-muted">
          {label}
        </p>
        {delta !== undefined && <DeltaChip delta={delta ?? null} invert={invertDelta} />}
      </div>
      <p className="font-instrument mt-2.5 text-[1.9rem] leading-none font-semibold tracking-[-0.02em] text-ink">
        {value}
      </p>
      {caption && (
        <p className="mt-2 text-[0.76rem] text-ink-faint">{caption}</p>
      )}
    </Panel>
  );
}

// ---------- status badges ----------

const BOOKING_BADGE: Record<BookingStatus, { label: string; cls: string; dot: string }> = {
  pending: { label: "Pending", cls: "bg-gold-100 text-gold-700", dot: "bg-gold-500" },
  confirmed: { label: "Confirmed", cls: "bg-blue-50 text-blue-700", dot: "bg-blue-500" },
  completed: { label: "Completed", cls: "bg-success-50 text-success-700", dot: "bg-success-500" },
  cancelled: { label: "Cancelled", cls: "bg-[#f2eef0] text-ink-faint", dot: "bg-ink-faint" },
  rescheduled: { label: "Rescheduled", cls: "bg-navy-50 text-navy-600", dot: "bg-navy-400" },
  no_show: { label: "No-show", cls: "bg-[#fbeaea] text-[#a63d39]", dot: "bg-[#c25450]" },
};

const INVOICE_BADGE: Record<InvoiceStatus, { label: string; cls: string; dot: string }> = {
  draft: { label: "Draft", cls: "bg-[#f2eef0] text-ink-faint", dot: "bg-ink-faint" },
  sent: { label: "Sent", cls: "bg-blue-50 text-blue-700", dot: "bg-blue-500" },
  paid: { label: "Paid", cls: "bg-success-50 text-success-700", dot: "bg-success-500" },
  partially_paid: { label: "Partial", cls: "bg-gold-100 text-gold-700", dot: "bg-gold-500" },
  overdue: { label: "Overdue", cls: "bg-[#fbeaea] text-[#a63d39]", dot: "bg-[#c25450]" },
  refunded: { label: "Refunded", cls: "bg-navy-50 text-navy-600", dot: "bg-navy-400" },
  void: { label: "Void", cls: "bg-[#f2eef0] text-ink-faint", dot: "bg-ink-faint" },
};

const PAYMENT_BADGE: Record<PaymentStatus, { label: string; cls: string; dot: string }> = {
  requires_payment: { label: "Pending", cls: "bg-gold-100 text-gold-700", dot: "bg-gold-500" },
  processing: { label: "Processing", cls: "bg-blue-50 text-blue-700", dot: "bg-blue-500" },
  succeeded: { label: "Succeeded", cls: "bg-success-50 text-success-700", dot: "bg-success-500" },
  failed: { label: "Failed", cls: "bg-[#fbeaea] text-[#a63d39]", dot: "bg-[#c25450]" },
  refunded: { label: "Refunded", cls: "bg-navy-50 text-navy-600", dot: "bg-navy-400" },
};

function Pill({
  cfg,
}: {
  cfg: { label: string; cls: string; dot: string };
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] px-2.5 py-[3px] text-[0.72rem] font-semibold whitespace-nowrap",
        cfg.cls,
      )}
    >
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
      {cfg.label}
    </span>
  );
}

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  return <Pill cfg={BOOKING_BADGE[status]} />;
}
export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return <Pill cfg={INVOICE_BADGE[status]} />;
}
export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return <Pill cfg={PAYMENT_BADGE[status]} />;
}

/** Colored initials avatar (employee color or neutral). */
export function Avatar({
  name,
  color,
  size = 34,
  className,
}: {
  name: string;
  color?: string | null;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex flex-none items-center justify-center rounded-full font-semibold text-white select-none",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        backgroundColor: color ?? "var(--navy-500)",
      }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

/** Thin utilization / progress meter. */
export function Meter({
  value,
  color,
  className,
}: {
  value: number;
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "block h-1.5 w-full overflow-hidden rounded-full bg-surface-alt",
        className,
      )}
    >
      <span
        className="block h-full rounded-full"
        style={{
          width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`,
          backgroundColor: color ?? "var(--blue-500)",
        }}
      />
    </span>
  );
}

/** Empty-state block for sections with no rows yet. */
export function EmptyState({
  icon = "sparkle",
  title,
  body,
  action,
}: {
  icon?: IconName;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-alt text-ink-faint">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <p className="text-[0.92rem] font-semibold text-ink">{title}</p>
      {body && (
        <p className="mt-1.5 max-w-[34ch] text-[0.82rem] leading-[1.6] text-ink-faint">
          {body}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Quiet link with trailing arrow — panel "view all" affordance. */
export function PanelLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-1 text-[0.78rem] font-semibold text-blue-600 transition-colors duration-[var(--duration-fast)] hover:text-blue-700"
    >
      {children}
      <Icon
        name="arrowRight"
        className="h-3.5 w-3.5 transition-transform duration-[var(--duration-fast)] group-hover:translate-x-0.5"
      />
    </Link>
  );
}

/** Plan-locked pill for feature-gated affordances. */
export function LockedPill({ children = "Upgrade" }: { children?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] border border-gold-300 bg-gold-50 px-2 py-[2px] text-[0.66rem] font-bold tracking-[0.04em] text-gold-700 uppercase">
      {children}
    </span>
  );
}
