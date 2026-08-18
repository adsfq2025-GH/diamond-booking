"use client";

import { useMemo, useState } from "react";
import { money, shortDate, timeRange } from "@/lib/format";
import { cancelSeries, setBookingStatus } from "@/lib/actions/bookings";
import { recurrenceLabel } from "@/lib/recurrence";
import type { BookingView, BookingsData } from "@/lib/dashboard/types";
import type { BookingStatus } from "@/types/database";
import { Icon } from "../icons";
import { Avatar, BookingStatusBadge, Panel, EmptyState } from "../ui";
import { Sheet } from "../Modal";
import {
  ActionButton,
  FilterTabs,
  GhostBtn,
  PreviewNotice,
  TableWrap,
  Td,
  Th,
  Toolbar,
} from "./shared";

type Tab = BookingStatus | "all";

const TAB_ORDER: Tab[] = ["all", "pending", "confirmed", "completed", "cancelled", "no_show"];
const TAB_LABEL: Record<Tab, string> = {
  all: "All",
  pending: "Pending",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
  rescheduled: "Rescheduled",
};

export function BookingsClient({
  data,
  timezone,
  preview,
}: {
  data: BookingsData;
  timezone: string;
  preview: boolean;
}) {
  const [rows, setRows] = useState(data.bookings);
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<BookingView | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((b) => {
      if (tab !== "all" && b.status !== tab) return false;
      if (!q) return true;
      return (
        b.customerName.toLowerCase().includes(q) ||
        b.serviceName.toLowerCase().includes(q) ||
        b.reference.toLowerCase().includes(q)
      );
    });
  }, [rows, tab, query]);

  function setStatus(id: string, status: BookingStatus) {
    setRows((prev) => prev.map((b) => (b.id === id ? { ...b, status } : b)));
    setSelected((s) => (s && s.id === id ? { ...s, status } : s));
    if (!preview) void setBookingStatus(id, status);
  }

  function cancelWholeSeries(groupId: string) {
    const now = Date.now();
    setRows((prev) =>
      prev.map((b) =>
        b.recurrenceGroupId === groupId &&
        new Date(b.startsAt).getTime() >= now &&
        b.status !== "completed"
          ? { ...b, status: "cancelled" }
          : b,
      ),
    );
    setSelected(null);
    if (!preview) void cancelSeries(groupId);
  }

  return (
    <div>
      {preview && <PreviewNotice />}
      <Toolbar
        search={query}
        onSearch={setQuery}
        placeholder="Search by customer, service or ref…"
        action={<ActionButton>New booking</ActionButton>}
      />
      <div className="mb-4">
        <FilterTabs
          value={tab}
          onChange={setTab}
          tabs={TAB_ORDER.map((k) => ({ key: k, label: TAB_LABEL[k], count: counts[k] ?? 0 }))}
        />
      </div>

      <Panel>
        {filtered.length === 0 ? (
          <EmptyState icon="bookings" title="No bookings here" body="Nothing matches this filter yet." />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Booking</Th>
                <Th>Service</Th>
                <Th>Assigned</Th>
                <Th>When</Th>
                <Th className="text-right">Total</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => (
                <tr
                  key={b.id}
                  onClick={() => setSelected(b)}
                  className="cursor-pointer transition-colors hover:bg-surface-alt/60"
                >
                  <Td>
                    <div className="font-semibold text-ink">{b.customerName}</div>
                    <div className="text-[0.72rem] text-ink-faint">{b.reference}</div>
                  </Td>
                  <Td className="text-ink-muted">{b.serviceName}</Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <Avatar name={b.employeeName} color={b.employeeColor} size={26} />
                      <span className="text-[0.82rem] text-ink-muted">{b.employeeName}</span>
                    </div>
                  </Td>
                  <Td>
                    <div className="text-[0.82rem] text-ink">{shortDate(b.startsAt, timezone)}</div>
                    <div className="text-[0.72rem] text-ink-faint">
                      {timeRange(b.startsAt, b.endsAt, timezone)}
                    </div>
                  </Td>
                  <Td className="text-right font-instrument font-semibold">{money(b.priceCents)}</Td>
                  <Td>
                    <BookingStatusBadge status={b.status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Panel>

      {selected && (
        <Sheet
          onClose={() => setSelected(null)}
          eyebrow={selected.reference}
          title={selected.customerName}
          footer={
            <StatusActions
              booking={selected}
              onSet={setStatus}
              onCancelSeries={cancelWholeSeries}
            />
          }
        >
          <BookingDetail b={selected} timezone={timezone} />
        </Sheet>
      )}
    </div>
  );
}

function BookingDetail({ b, timezone }: { b: BookingView; timezone: string }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <BookingStatusBadge status={b.status} />
        <span className="text-[0.72rem] text-ink-faint capitalize">via {b.source}</span>
      </div>

      {b.recurrenceRule && b.recurrenceRule !== "none" && (
        <div className="flex items-center gap-2 rounded-[10px] border border-blue-200 bg-blue-50 px-3.5 py-2.5">
          <Icon name="calendar" className="h-4 w-4 flex-none text-blue-600" />
          <p className="text-[0.8rem] text-navy-800">
            Part of a recurring series — <span className="font-semibold">{recurrenceLabel(b.recurrenceRule).toLowerCase()}</span>.
          </p>
        </div>
      )}

      <div className="rounded-[14px] border border-line bg-surface-alt/40 p-4">
        <p className="font-display text-[1.05rem] font-semibold text-ink">{b.serviceName}</p>
        <p className="mt-1 text-[0.82rem] text-ink-muted">
          {shortDate(b.startsAt, timezone)} · {timeRange(b.startsAt, b.endsAt, timezone)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-[12px] border border-line px-4 py-3">
          <p className="text-[0.72rem] font-semibold text-ink-faint">Total</p>
          <p className="font-instrument mt-1 text-[1.25rem] font-semibold text-ink">{money(b.priceCents)}</p>
        </div>
        <div className="rounded-[12px] border border-line px-4 py-3">
          <p className="text-[0.72rem] font-semibold text-ink-faint">Deposit</p>
          <p className="font-instrument mt-1 text-[1.25rem] font-semibold text-ink">
            {b.depositCents > 0 ? money(b.depositCents) : "—"}
          </p>
        </div>
      </div>

      <DetailRows>
        <DR icon="employees" label="Assigned to">
          <span className="inline-flex items-center gap-2">
            <Avatar name={b.employeeName} color={b.employeeColor} size={22} />
            {b.employeeName}
          </span>
        </DR>
        <DR icon="mapPin" label="Address">{b.addressLine ?? "—"}</DR>
        {b.notes && <DR icon="bookings" label="Customer notes">{b.notes}</DR>}
      </DetailRows>
    </div>
  );
}

function DetailRows({ children }: { children: React.ReactNode }) {
  return <div className="space-y-3">{children}</div>;
}
function DR({
  icon,
  label,
  children,
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon name={icon} className="mt-0.5 h-4 w-4 flex-none text-ink-faint" />
      <div className="min-w-0">
        <p className="text-[0.7rem] text-ink-faint">{label}</p>
        <div className="text-[0.85rem] text-ink">{children}</div>
      </div>
    </div>
  );
}

function StatusActions({
  booking,
  onSet,
  onCancelSeries,
}: {
  booking: BookingView;
  onSet: (id: string, status: BookingStatus) => void;
  onCancelSeries: (groupId: string) => void;
}) {
  const actions: Array<{ label: string; status: BookingStatus; primary?: boolean }> = [];
  if (booking.status === "pending") actions.push({ label: "Confirm", status: "confirmed", primary: true });
  if (booking.status === "confirmed") actions.push({ label: "Mark complete", status: "completed", primary: true });
  const active = booking.status !== "cancelled" && booking.status !== "completed";
  if (active)
    actions.push({
      label: booking.recurrenceGroupId ? "Cancel this one" : "Cancel",
      status: "cancelled",
    });

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        {booking.status === "confirmed" ? (
          <GhostBtn onClick={() => onSet(booking.id, "no_show")}>No-show</GhostBtn>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          {actions.map((a) =>
            a.primary ? (
              <ActionButton key={a.status} icon="check" onClick={() => onSet(booking.id, a.status)}>
                {a.label}
              </ActionButton>
            ) : (
              <GhostBtn key={a.label} onClick={() => onSet(booking.id, a.status)}>
                {a.label}
              </GhostBtn>
            ),
          )}
        </div>
      </div>
      {active && booking.recurrenceGroupId && (
        <button
          type="button"
          onClick={() => onCancelSeries(booking.recurrenceGroupId as string)}
          className="self-end text-[0.78rem] font-semibold text-ink-faint transition-colors hover:text-[#a63d39]"
        >
          Cancel entire series →
        </button>
      )}
    </div>
  );
}
