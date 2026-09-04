"use client";

import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { timeRange, zonedHourFraction, zonedYmd } from "@/lib/format";
import { recurrenceLabel } from "@/lib/recurrence";
import type { CalendarData, CalendarEvent } from "@/lib/dashboard/types";
import { Icon } from "../icons";
import { Sheet } from "../Modal";
import { BookingStatusBadge } from "../ui";

type ViewMode = "day" | "week" | "month";

const START_HOUR = 7;
const END_HOUR = 20;
const HOUR_H = 54; // px per hour in the time grid
const SNAP_MIN = 15;
const DAY_MS = 86_400_000;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function startOfWeek(d: Date) {
  const s = startOfDay(d);
  s.setDate(s.getDate() - s.getDay());
  return s;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
/** 'YYYY-MM-DD' for a calendar-day Date (its local Y/M/D, used to label columns). */
function ymdLocal(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function CalendarClient({
  data,
  timezone,
}: {
  data: CalendarData;
  timezone: string;
}) {
  const [events, setEvents] = useState(data.events);
  const [view, setView] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<CalendarEvent | null>(null);

  const visibleEvents = useMemo(
    () => events.filter((e) => !hidden.has(e.employeeId)),
    [events, hidden],
  );

  function toggleEmployee(id: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function reschedule(id: string, newStart: Date) {
    setEvents((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e;
        const dur = new Date(e.endsAt).getTime() - new Date(e.startsAt).getTime();
        return {
          ...e,
          startsAt: newStart.toISOString(),
          endsAt: new Date(newStart.getTime() + dur).toISOString(),
        };
      }),
    );
  }

  function shift(dir: number) {
    if (view === "day") setAnchor((a) => addDays(a, dir));
    else if (view === "week") setAnchor((a) => addDays(a, dir * 7));
    else setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + dir, 1));
  }

  const rangeLabel = useMemo(() => {
    if (view === "day")
      return anchor.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    if (view === "month")
      return anchor.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    const ws = startOfWeek(anchor);
    const we = addDays(ws, 6);
    return `${ws.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${we.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  }, [view, anchor]);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAnchor(startOfDay(new Date()))}
            className="rounded-[10px] border border-line-strong bg-card px-3.5 py-2 text-[0.82rem] font-semibold text-ink transition-colors hover:border-blue-600 hover:text-blue-600"
          >
            Today
          </button>
          <div className="flex items-center rounded-[10px] border border-line-strong bg-card">
            <button
              type="button"
              aria-label="Previous"
              onClick={() => shift(-1)}
              className="flex h-9 w-9 items-center justify-center rounded-l-[9px] text-ink-muted hover:bg-surface-alt hover:text-ink"
            >
              <Icon name="chevronRight" className="h-4 w-4 rotate-180" />
            </button>
            <button
              type="button"
              aria-label="Next"
              onClick={() => shift(1)}
              className="flex h-9 w-9 items-center justify-center rounded-r-[9px] text-ink-muted hover:bg-surface-alt hover:text-ink"
            >
              <Icon name="chevronRight" className="h-4 w-4" />
            </button>
          </div>
          <h2 className="font-display text-[1.05rem] font-semibold tracking-[-0.02em] text-ink">
            {rangeLabel}
          </h2>
        </div>

        <div className="flex items-center gap-1 rounded-[10px] border border-line-strong bg-card p-1">
          {(["day", "week", "month"] as ViewMode[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                "rounded-[7px] px-3 py-1.5 text-[0.8rem] font-semibold capitalize transition-colors",
                view === v ? "bg-navy-900 text-white" : "text-ink-muted hover:text-ink",
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Employee legend */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {data.employees.map((emp) => {
          const off = hidden.has(emp.id);
          return (
            <button
              key={emp.id}
              type="button"
              onClick={() => toggleEmployee(emp.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-[var(--radius-pill)] border px-3 py-[5px] text-[0.78rem] font-medium transition-opacity",
                off ? "border-line-strong opacity-45" : "border-line-strong",
              )}
            >
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: emp.color }} />
              {emp.name}
            </button>
          );
        })}
      </div>

      {view === "month" ? (
        <MonthView
          anchor={anchor}
          events={visibleEvents}
          tz={timezone}
          onReschedule={reschedule}
          onOpen={setSelected}
        />
      ) : (
        <TimeGrid
          days={view === "day" ? [anchor] : Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i))}
          events={visibleEvents}
          tz={timezone}
          onReschedule={reschedule}
          onOpen={setSelected}
        />
      )}

      {selected && (
        <Sheet
          onClose={() => setSelected(null)}
          eyebrow="Appointment"
          title={selected.customerName}
        >
          <EventDetail e={selected} tz={timezone} />
        </Sheet>
      )}
    </div>
  );
}

// ---------- time grid (day / week) ----------

function TimeGrid({
  days,
  events,
  tz,
  onReschedule,
  onOpen,
}: {
  days: Date[];
  events: CalendarEvent[];
  tz: string;
  onReschedule: (id: string, start: Date) => void;
  onOpen: (e: CalendarEvent) => void;
}) {
  const todayYmd = zonedYmd(new Date(), tz);
  const gridRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{
    id: string;
    dx: number;
    dy: number;
    moved: boolean;
  } | null>(null);
  const dragStart = useRef<{ x: number; y: number; colW: number } | null>(null);

  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

  function onPointerDown(e: React.PointerEvent, ev: CalendarEvent) {
    const cols = gridRef.current?.querySelectorAll("[data-daycol]");
    const colW = cols && cols[0] ? (cols[0] as HTMLElement).offsetWidth : 0;
    dragStart.current = { x: e.clientX, y: e.clientY, colW };
    setDrag({ id: ev.id, dx: 0, dy: 0, moved: false });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag || !dragStart.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setDrag((d) => (d ? { ...d, dx, dy, moved: Math.abs(dx) + Math.abs(dy) > 4 } : d));
  }
  function onPointerUp(ev: CalendarEvent) {
    if (!drag || !dragStart.current) {
      setDrag(null);
      return;
    }
    const { dx, dy, colW } = { ...drag, colW: dragStart.current.colW };
    if (!drag.moved) {
      onOpen(ev);
    } else {
      const dayDelta = days.length > 1 && colW ? Math.round(dx / colW) : 0;
      const minutesDelta = Math.round(dy / HOUR_H * 60 / SNAP_MIN) * SNAP_MIN;
      const orig = new Date(ev.startsAt);
      let next = new Date(orig.getTime() + minutesDelta * 60000);
      if (dayDelta) next = new Date(next.getTime() + dayDelta * DAY_MS);
      // clamp within working hours
      const minStart = new Date(next);
      minStart.setHours(START_HOUR, 0, 0, 0);
      if (next < minStart) next = minStart;
      onReschedule(ev.id, next);
    }
    setDrag(null);
    dragStart.current = null;
  }

  return (
    <div className="overflow-hidden rounded-[16px] border border-navy-900/8 bg-card shadow-[var(--shadow-lift)]">
      {/* day headers */}
      <div
        className="grid border-b border-line"
        style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0,1fr))` }}
      >
        <div />
        {days.map((d) => {
          const today = ymdLocal(d) === todayYmd;
          return (
            <div key={d.toISOString()} className="border-l border-line px-2 py-2.5 text-center">
              <p className="text-[0.66rem] font-bold tracking-[0.08em] text-ink-faint uppercase">
                {WEEKDAYS[d.getDay()]}
              </p>
              <p
                className={cn(
                  "font-instrument mx-auto mt-1 flex h-7 w-7 items-center justify-center rounded-full text-[0.9rem] font-semibold",
                  today ? "bg-blue-600 text-white" : "text-ink",
                )}
              >
                {d.getDate()}
              </p>
            </div>
          );
        })}
      </div>

      {/* scrollable grid */}
      <div className="max-h-[620px] overflow-y-auto">
        <div
          ref={gridRef}
          className="relative grid"
          style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0,1fr))` }}
          onPointerMove={onPointerMove}
        >
          {/* hour gutter */}
          <div className="relative">
            {hours.map((h) => (
              <div key={h} style={{ height: HOUR_H }} className="relative">
                <span className="absolute -top-2 right-2 text-[0.66rem] text-ink-faint">
                  {h === 12 ? "12 PM" : h > 12 ? `${h - 12} PM` : `${h} AM`}
                </span>
              </div>
            ))}
          </div>

          {/* day columns */}
          {days.map((day) => {
            const dayKey = ymdLocal(day);
            const dayEvents = events.filter((e) => zonedYmd(e.startsAt, tz) === dayKey);
            return (
              <div
                key={day.toISOString()}
                data-daycol
                className="relative border-l border-line"
              >
                {hours.map((h) => (
                  <div key={h} style={{ height: HOUR_H }} className="border-b border-line/70" />
                ))}
                {dayEvents.map((ev) => (
                  <EventBlock
                    key={ev.id}
                    ev={ev}
                    tz={tz}
                    dragging={drag?.id === ev.id ? drag : null}
                    onPointerDown={(e) => onPointerDown(e, ev)}
                    onPointerUp={() => onPointerUp(ev)}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function EventBlock({
  ev,
  tz,
  dragging,
  onPointerDown,
  onPointerUp,
}: {
  ev: CalendarEvent;
  tz: string;
  dragging: { dx: number; dy: number } | null;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
}) {
  const start = new Date(ev.startsAt);
  const end = new Date(ev.endsAt);
  const top = (zonedHourFraction(start, tz) - START_HOUR) * HOUR_H;
  const height = Math.max(22, ((end.getTime() - start.getTime()) / 3_600_000) * HOUR_H - 2);
  const faded = ev.status === "completed" || ev.status === "no_show";

  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      className={cn(
        "absolute right-1 left-1 z-10 overflow-hidden rounded-[7px] border-l-[3px] px-2 py-1 text-left touch-none select-none",
        "shadow-[0_1px_3px_rgb(12_36_64/0.14)] transition-shadow",
        dragging ? "z-30 cursor-grabbing shadow-float" : "cursor-grab",
      )}
      style={{
        top,
        height,
        transform: dragging ? `translate(${dragging.dx}px, ${dragging.dy}px)` : undefined,
        backgroundColor: hexWithAlpha(ev.employeeColor, faded ? 0.1 : 0.16),
        borderLeftColor: ev.employeeColor,
        opacity: faded ? 0.75 : 1,
      }}
    >
      <p className="flex items-center gap-1 truncate text-[0.72rem] font-semibold text-ink">
        {ev.recurrenceRule && ev.recurrenceRule !== "none" && (
          <span aria-hidden title="Recurring" className="flex-none text-[0.7rem] leading-none">↻</span>
        )}
        <span className="truncate">{ev.customerName}</span>
      </p>
      {height > 34 && (
        <p className="truncate text-[0.66rem] text-ink-muted">{ev.serviceName}</p>
      )}
    </button>
  );
}

// ---------- month view ----------

function MonthView({
  anchor,
  events,
  tz,
  onReschedule,
  onOpen,
}: {
  anchor: Date;
  events: CalendarEvent[];
  tz: string;
  onReschedule: (id: string, start: Date) => void;
  onOpen: (e: CalendarEvent) => void;
}) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const [dragId, setDragId] = useState<string | null>(null);
  const todayYmd = zonedYmd(new Date(), tz);

  function drop(day: Date) {
    if (!dragId) return;
    const ev = events.find((e) => e.id === dragId);
    if (ev) {
      const orig = new Date(ev.startsAt);
      const next = new Date(day);
      next.setHours(orig.getHours(), orig.getMinutes(), 0, 0);
      onReschedule(dragId, next);
    }
    setDragId(null);
  }

  return (
    <div className="overflow-hidden rounded-[16px] border border-navy-900/8 bg-card shadow-[var(--shadow-lift)]">
      <div className="grid grid-cols-7 border-b border-line">
        {WEEKDAYS.map((w) => (
          <div key={w} className="px-2 py-2 text-center text-[0.66rem] font-bold tracking-[0.08em] text-ink-faint uppercase">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          const inMonth = day.getMonth() === anchor.getMonth();
          const today = ymdLocal(day) === todayYmd;
          const dayEvents = events.filter((e) => zonedYmd(e.startsAt, tz) === ymdLocal(day));
          return (
            <div
              key={i}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => drop(day)}
              className={cn(
                "min-h-[104px] border-b border-l border-line p-1.5 first:border-l-0 [&:nth-child(7n+1)]:border-l-0",
                !inMonth && "bg-surface-alt/40",
              )}
            >
              <span
                className={cn(
                  "font-instrument mb-1 flex h-6 w-6 items-center justify-center rounded-full text-[0.78rem] font-semibold",
                  today ? "bg-blue-600 text-white" : inMonth ? "text-ink" : "text-ink-faint",
                )}
              >
                {day.getDate()}
              </span>
              <div className="space-y-1">
                {dayEvents.slice(0, 3).map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    draggable
                    onDragStart={() => setDragId(ev.id)}
                    onClick={() => onOpen(ev)}
                    className="flex w-full items-center gap-1.5 rounded-[5px] px-1.5 py-1 text-left"
                    style={{ backgroundColor: hexWithAlpha(ev.employeeColor, 0.14) }}
                  >
                    <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ backgroundColor: ev.employeeColor }} />
                    <span className="truncate text-[0.66rem] font-medium text-ink">
                      {new Date(ev.startsAt).toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric" })} {ev.customerName}
                    </span>
                  </button>
                ))}
                {dayEvents.length > 3 && (
                  <p className="px-1.5 text-[0.64rem] font-medium text-ink-faint">
                    +{dayEvents.length - 3} more
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventDetail({ e, tz }: { e: CalendarEvent; tz: string }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <BookingStatusBadge status={e.status} />
        <span
          className="inline-flex items-center gap-1.5 text-[0.78rem] font-medium text-ink-muted"
        >
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: e.employeeColor }} />
          {e.employeeName}
        </span>
      </div>
      <div className="rounded-[14px] border border-line bg-surface-alt/40 p-4">
        <p className="font-display text-[1.05rem] font-semibold text-ink">{e.serviceName}</p>
        <p className="mt-1 text-[0.82rem] text-ink-muted">
          {new Date(e.startsAt).toLocaleDateString("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" })}
        </p>
        <p className="text-[0.82rem] text-ink-muted">{timeRange(e.startsAt, e.endsAt, tz)}</p>
        {e.recurrenceRule && e.recurrenceRule !== "none" && (
          <p className="mt-1.5 inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-blue-50 px-2 py-[2px] text-[0.68rem] font-semibold text-blue-700">
            ↻ Repeats {recurrenceLabel(e.recurrenceRule).toLowerCase()}
          </p>
        )}
      </div>
      <p className="text-[0.82rem] leading-[1.6] text-ink-faint">
        Drag the appointment on the calendar to reschedule, or open it from
        Bookings to change status, reassign, or view payment details.
      </p>
    </div>
  );
}

/** Turn a #rrggbb into an rgba() string at the given alpha. */
function hexWithAlpha(hex: string, alpha: number): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
