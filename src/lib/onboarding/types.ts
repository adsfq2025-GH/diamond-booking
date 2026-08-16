/**
 * Shared shapes for the onboarding wizard: what the client edits, what the
 * server actions accept, and how tenants.settings / tenants.branding are
 * structured. Client-safe (no server imports).
 */

// ---------- tenants.settings ----------
export interface TenantSettings {
  auto_confirm?: boolean | string;
  cancellation_policy?: string;
  cancellation_window_hours?: number;
  deposit_required?: boolean;
  payments_enabled?: boolean;
  default_buffer_minutes?: number;
  onboarding_step?: number;
  onboarding_complete?: boolean;
}

// ---------- tenants.branding ----------
export interface TenantBranding {
  logo_url?: string | null;
  primary_color?: string;
  accent_color?: string;
  photos?: string[];
}

export const DEFAULT_PRIMARY_COLOR = "#0c2440"; // Diamond navy
export const DEFAULT_ACCENT_COLOR = "#f4b942"; // Diamond gold

// ---------- step payloads ----------
export interface BusinessInfoInput {
  name: string;
  industry: string;
  phone: string;
  email: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  timezone: string;
}

export interface ServiceInput {
  /** Client-side key, stable across saves. */
  localId: string;
  name: string;
  category: string;
  duration_minutes: number;
  price_cents: number;
  deposit_cents: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
}

export interface TeamMemberInput {
  localId: string;
  name: string;
  email: string;
  title: string;
  color: string;
}

export interface TeamInput {
  ownerBookable: boolean;
  ownerColor: string;
  members: TeamMemberInput[];
}

export interface DayHoursInput {
  weekday: number; // 0 = Sunday
  closed: boolean;
  open_time: string; // "08:00"
  close_time: string; // "18:00"
}

export interface HoursInput {
  days: DayHoursInput[];
  default_buffer_minutes: number;
}

export interface BrandingInput {
  logo_url: string | null;
  primary_color: string;
  accent_color: string;
  photos: string[];
}

export interface FinishInput {
  auto_confirm: boolean;
  cancellation_policy: string;
  cancellation_window_hours: number;
  deposit_required: boolean;
  payments_enabled: boolean;
}

/** Everything the wizard edits, hydrated server-side (or mocked). */
export interface WizardData {
  business: BusinessInfoInput;
  services: ServiceInput[];
  team: TeamInput;
  hours: HoursInput;
  branding: BrandingInput;
  finish: FinishInput;
}

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

// ---------- defaults ----------
export const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** Sensible default week: Mon–Fri 8:00–18:00, weekend closed. */
export function defaultHours(): DayHoursInput[] {
  return Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    closed: weekday === 0 || weekday === 6,
    open_time: "08:00",
    close_time: "18:00",
  }));
}

/** Calendar colors offered for team members. */
export const EMPLOYEE_COLORS = [
  "#2e86c1", // blue
  "#f4b942", // gold
  "#3fb68b", // green
  "#8e6bbf", // violet
  "#e07a5f", // terracotta
  "#5a88a8", // slate
] as const;

/** Common US timezones first; the detected zone is merged in by the UI. */
export const COMMON_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Vancouver",
  "Europe/London",
  "Europe/Berlin",
  "Australia/Sydney",
] as const;
