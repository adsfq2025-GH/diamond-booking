import "server-only";

/**
 * Google Calendar sync — SCAFFOLD (Elite plan). Two-way sync is planned; this
 * module defines the shape and reports "coming soon" so the settings UI can
 * render the integration without a live implementation yet.
 *
 * When implemented: OAuth per employee (calendar.events scope), push bookings
 * as events, and poll/webhook for external changes. Env: GOOGLE_CLIENT_ID /
 * GOOGLE_CLIENT_SECRET / redirect at /api/integrations/google/callback.
 */

export function googleCalendarConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export interface CalendarSyncStatus {
  available: boolean;
  reason: "coming_soon" | "not_configured" | "ready";
}

export function calendarSyncStatus(): CalendarSyncStatus {
  return { available: false, reason: "coming_soon" };
}
