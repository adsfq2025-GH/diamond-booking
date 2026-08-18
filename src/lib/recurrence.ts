/**
 * Recurring-booking rules. A rule + a start instant expands into a list of
 * occurrence start times. Each occurrence becomes a real bookings row so the
 * availability system (get_available_slots) and the no-double-booking
 * constraint treat the reserved times as taken. Client-safe (no server deps).
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

function addWeeks(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n * 7);
  return x;
}

/** Add months, keeping the day-of-month (clamped for short months). */
function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  const day = x.getDate();
  x.setDate(1);
  x.setMonth(x.getMonth() + n);
  const lastDay = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
  x.setDate(Math.min(day, lastDay));
  return x;
}

/**
 * Occurrence start times AFTER the first one (the first is the original
 * booking). Stops at `until` (inclusive) or once `maxCount` is reached.
 */
export function computeOccurrences(
  firstStart: Date,
  rule: RecurrenceRule,
  until: Date | null,
  maxCount: number = DEFAULT_MAX_OCCURRENCES,
): Date[] {
  if (rule === "none") return [];
  const monthly = rule === "monthly";
  const weeks = weekInterval(rule);
  if (!monthly && (!weeks || weeks < 1)) return [];

  const out: Date[] = [];
  for (let i = 1; i <= maxCount; i++) {
    const next = monthly ? addMonths(firstStart, i) : addWeeks(firstStart, (weeks as number) * i);
    if (until && next.getTime() > until.getTime()) break;
    out.push(next);
  }
  return out;
}
