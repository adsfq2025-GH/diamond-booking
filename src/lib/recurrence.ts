/**
 * Recurring-booking rules. A rule + a start instant expands into a list of
 * occurrence start times. Each occurrence becomes a real bookings row so the
 * availability system (get_available_slots) and the no-double-booking
 * constraint treat the reserved times as taken. Client-safe (no server deps).
 *
 * Occurrences are generated in the BUSINESS's timezone (B05). The previous
 * version added weeks and months with the server runtime's own calendar: on a
 * UTC server, a weekly 09:00 America/Tijuana appointment became 08:00 the week
 * after the November daylight-saving change, because 7 x 24h is not "the same
 * wall-clock time next week" when the offset moves underneath it. "Every week
 * at nine" has to mean nine o'clock where the business is.
 */

export type RecurrenceRule =
  | "none"
  | "weekly"
  | "biweekly"
  | "every_3_weeks"
  | "monthly"
  | `every_${number}_weeks`;

export interface RecurrenceOption {
  value: RecurrenceRule;
  label: string;
  /** null for monthly (month-based) or none. */
  weeks: number | null;
}

export const RECURRENCE_OPTIONS: RecurrenceOption[] = [
  { value: "none", label: "One-time", weeks: 0 },
  { value: "weekly", label: "Every week", weeks: 1 },
  { value: "biweekly", label: "Every 2 weeks", weeks: 2 },
  { value: "every_3_weeks", label: "Every 3 weeks", weeks: 3 },
  { value: "monthly", label: "Every month", weeks: null },
];

/** How many occurrences to materialize up front for an open-ended series. */
export const DEFAULT_MAX_OCCURRENCES = 26;

/**
 * How far ahead a series may ever be reserved, enforced server-side as well as
 * here. An open-ended series is topped up by the renewal worker rather than
 * reserved indefinitely in one go, so an accidental rule cannot fill a
 * calendar for years.
 */
export const MAX_SERIES_HORIZON_DAYS = 400;

export function recurrenceLabel(rule: string | null | undefined): string {
  if (!rule || rule === "none") return "One-time";
  const known = RECURRENCE_OPTIONS.find((o) => o.value === rule);
  if (known) return known.label;
  const m = /^every_(\d+)_weeks$/.exec(rule);
  if (m) return `Every ${m[1]} weeks`;
  return "Recurring";
}

/** Week interval for a rule, or null for month-based / one-time. */
function weekInterval(rule: RecurrenceRule): number | null {
  const known = RECURRENCE_OPTIONS.find((o) => o.value === rule);
  if (known) return known.weeks;
  const m = /^every_(\d+)_weeks$/.exec(rule);
  return m ? Number(m[1]) : null;
}

interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = partsFormatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    partsFormatters.set(timeZone, fmt);
  }
  return fmt;
}

/** The wall-clock reading of an instant in `timeZone`. */
function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = partsFormatter(timeZone).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  // Intl renders midnight as hour 24 in some engines.
  const hour = get("hour") % 24;
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour,
    minute: get("minute"),
    second: get("second"),
  };
}

/** Zone offset, in ms, in effect at a given instant. */
function offsetAt(utcMs: number, timeZone: string): number {
  const p = zonedParts(new Date(utcMs), timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - utcMs;
}

/**
 * The instant at which `timeZone` reads the given wall-clock time. Resolved in
 * two passes so a date on the far side of a daylight-saving change uses the
 * offset that is actually in effect THEN, not the one in effect now.
 */
function zonedToInstant(p: ZonedParts, timeZone: string): Date {
  const naive = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  let ms = naive - offsetAt(naive, timeZone);
  ms = naive - offsetAt(ms, timeZone);
  return new Date(ms);
}

/** Days in a month, so a monthly series on the 31st clamps rather than skips. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addLocalWeeks(p: ZonedParts, weeks: number): ZonedParts {
  const shifted = new Date(
    Date.UTC(p.year, p.month - 1, p.day) + weeks * 7 * 24 * 60 * 60 * 1000,
  );
  return {
    ...p,
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function addLocalMonths(p: ZonedParts, months: number): ZonedParts {
  const total = (p.year * 12 + (p.month - 1)) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return { ...p, year, month, day: Math.min(p.day, daysInMonth(year, month)) };
}

/**
 * Occurrence start times AFTER the first one (the first is the original
 * booking). Stops at `until` (inclusive), once `maxCount` is reached, or at
 * MAX_SERIES_HORIZON_DAYS — whichever comes first.
 *
 * `timeZone` is the business's IANA zone. It defaults to UTC only so a caller
 * with no tenant context still behaves predictably; every real caller passes
 * the tenant's zone, and passing the wrong one is what B05 was.
 */
export function computeOccurrences(
  firstStart: Date,
  rule: RecurrenceRule,
  until: Date | null,
  maxCount: number = DEFAULT_MAX_OCCURRENCES,
  timeZone: string = "UTC",
): Date[] {
  if (rule === "none") return [];
  const monthly = rule === "monthly";
  const weeks = weekInterval(rule);
  if (!monthly && (!weeks || weeks < 1)) return [];

  const zone = timeZone || "UTC";
  const base = zonedParts(firstStart, zone);
  const horizon =
    firstStart.getTime() + MAX_SERIES_HORIZON_DAYS * 24 * 60 * 60 * 1000;

  const out: Date[] = [];
  for (let i = 1; i <= maxCount; i++) {
    const local = monthly
      ? addLocalMonths(base, i)
      : addLocalWeeks(base, (weeks as number) * i);
    const next = zonedToInstant(local, zone);
    if (until && next.getTime() > until.getTime()) break;
    if (next.getTime() > horizon) break;
    out.push(next);
  }
  return out;
}
