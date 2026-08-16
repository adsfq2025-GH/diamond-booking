/**
 * Small, dependency-light formatters shared across the dashboard and portals.
 * Money is stored in integer cents everywhere; render through `money()`.
 */

/** "$1,240" (whole dollars) or "$1,240.50" when cents are non-zero. */
export function money(cents: number, opts?: { cents?: boolean }): string {
  const dollars = cents / 100;
  const forceCents = opts?.cents ?? cents % 100 !== 0;
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: forceCents ? 2 : 0,
    maximumFractionDigits: forceCents ? 2 : 0,
  });
}

/** Compact money for tight stat tiles: "$12.4k", "$1.2M". */
export function moneyCompact(cents: number): string {
  const dollars = cents / 100;
  if (Math.abs(dollars) >= 1000) {
    return (
      "$" +
      dollars.toLocaleString("en-US", {
        notation: "compact",
        maximumFractionDigits: 1,
      })
    );
  }
  return money(cents);
}

/** 0.732 -> "73%". */
export function percent(fraction: number, digits = 0): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

/** Signed delta for trend chips: 0.128 -> "+12.8%". */
export function signedPercent(fraction: number, digits = 1): string {
  const sign = fraction > 0 ? "+" : "";
  return `${sign}${(fraction * 100).toFixed(digits)}%`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Timezone handling — IMPORTANT.
 *
 * Bookings are stored as absolute instants (timestamptz). The *displayed* wall
 * clock must always be the business's timezone, not the server's (UTC on
 * Vercel) or the viewer's browser. Every formatter below takes an optional
 * `tz` (an IANA name like "America/Los_Angeles"); pass the tenant timezone so
 * server-rendered and client-rendered views agree. Omitting `tz` falls back to
 * the ambient zone (fine for demo/mock data).
 */

/** Wall-clock parts of an instant in a given timezone. */
export function zonedParts(
  iso: string | Date,
  tz?: string,
): { year: number; month: number; day: number; hour: number; minute: number } {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  const hour = get("hour");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: hour === 24 ? 0 : hour,
    minute: get("minute"),
  };
}

/** 'YYYY-MM-DD' for the instant in `tz` (for grouping events by calendar day). */
export function zonedYmd(iso: string | Date, tz?: string): string {
  const p = zonedParts(iso, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Hours-since-midnight (e.g. 9.5 for 9:30) in `tz` — for calendar positioning. */
export function zonedHourFraction(iso: string | Date, tz?: string): number {
  const p = zonedParts(iso, tz);
  return p.hour + p.minute / 60;
}

/** Integer day index in `tz`, for day-difference math. */
function zonedDayIndex(iso: string | Date, tz?: string): number {
  const p = zonedParts(iso, tz);
  return Math.round(Date.UTC(p.year, p.month - 1, p.day) / DAY_MS);
}

/** "Aug 15", or "Aug 15, 2026" when the year differs from `ref`. */
export function shortDate(iso: string | Date, tz?: string, ref = new Date()): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const sameYear = zonedParts(d, tz).year === zonedParts(ref, tz).year;
  return d.toLocaleDateString("en-US", {
    timeZone: tz,
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
}

/** "9:00 AM". */
export function timeOfDay(iso: string | Date, tz?: string): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleTimeString("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "9:00 – 11:00 AM" for a start/end pair on the same day. */
export function timeRange(startIso: string, endIso: string, tz?: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const startPm = zonedParts(start, tz).hour >= 12;
  const endPm = zonedParts(end, tz).hour >= 12;
  const fmt = (d: Date, withMeridiem: boolean) => {
    const s = d.toLocaleTimeString("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
    });
    return withMeridiem ? s : s.replace(/\s?[AP]M$/, "");
  };
  return `${fmt(start, startPm !== endPm)} – ${fmt(end, true)}`;
}

/** Human relative label: "Today", "Tomorrow", "In 3 days", "5 days ago". */
export function relativeDay(iso: string | Date, tz?: string, ref = new Date()): string {
  const diffDays = zonedDayIndex(iso, tz) - zonedDayIndex(ref, tz);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  if (diffDays > 1) return `In ${diffDays} days`;
  return `${Math.abs(diffDays)} days ago`;
}

/** Initials for avatars: "Olivia Diaz" -> "OD". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
