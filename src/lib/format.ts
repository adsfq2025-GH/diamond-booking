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

/** "Aug 15", or "Aug 15, 2026" when the year differs from `ref`. */
export function shortDate(iso: string | Date, ref = new Date()): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const sameYear = d.getFullYear() === ref.getFullYear();
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
}

/** "9:00 AM". */
export function timeOfDay(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d
    .toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    })
    .replace(":00", ":00");
}

/** "9:00 – 11:00 AM" for a start/end pair on the same day. */
export function timeRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const startMeridiem = start.getHours() >= 12 ? "PM" : "AM";
  const endMeridiem = end.getHours() >= 12 ? "PM" : "AM";
  const fmt = (d: Date, withMeridiem: boolean) => {
    const s = d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
    return withMeridiem ? s : s.replace(/\s?[AP]M$/, "");
  };
  return `${fmt(start, startMeridiem !== endMeridiem)} – ${fmt(end, true)}`;
}

/** Human relative label: "Today", "Tomorrow", "In 3 days", "5 days ago". */
export function relativeDay(iso: string | Date, ref = new Date()): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const startOf = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(d) - startOf(ref)) / DAY_MS);
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
