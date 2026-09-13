import "server-only";

import { createAdminClient } from "@/lib/supabase/server";
import { deleteGoogleCalendarEvent, fetchGoogleCalendars, upsertGoogleCalendarEvent } from "@/lib/integrations/google-calendar";
import type { Json } from "@/types/database";

async function listConnectionsForBooking(bookingId: string) {
  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("id, tenant_id, starts_at, ends_at, status, customers(full_name), services(name), employees(profile_id), tenants(name, timezone), google_calendar_connections(id, calendar_id, access_token, sync_enabled, synced_booking_events)")
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking) return null;

  const connections = Array.isArray(booking.google_calendar_connections)
    ? booking.google_calendar_connections
    : booking.google_calendar_connections
      ? [booking.google_calendar_connections]
      : [];

  return { admin, booking, connections };
}

export async function createCalendarEventForBooking(bookingId: string) {
  const context = await listConnectionsForBooking(bookingId);
  if (!context || context.booking.status === "cancelled") return;

  const { admin, booking, connections } = context;

  for (const connection of connections) {
    if (!connection.sync_enabled || !connection.access_token) continue;
    const synced = ((connection.synced_booking_events ?? {}) as Record<string, string>);
    const event = await upsertGoogleCalendarEvent({
      accessToken: connection.access_token,
      calendarId: connection.calendar_id || "primary",
      eventId: synced[booking.id],
      summary: `${Array.isArray(booking.services) ? booking.services[0]?.name : booking.services?.name ?? "Booking"} · ${Array.isArray(booking.customers) ? booking.customers[0]?.full_name : booking.customers?.full_name ?? "Customer"}`,
      description: `Booking synced from Diamond Booking for ${Array.isArray(booking.tenants) ? booking.tenants[0]?.name : booking.tenants?.name ?? "business"}.`,
      startsAt: booking.starts_at,
      endsAt: booking.ends_at,
      timeZone: (Array.isArray(booking.tenants) ? booking.tenants[0]?.timezone : booking.tenants?.timezone) || "America/New_York",
    });
    await admin
      .from("google_calendar_connections")
      .update({
        synced_booking_events: { ...synced, [booking.id]: event.id } as Json,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connection.id);
  }
}

export async function removeCalendarEventForBooking(bookingId: string) {
  const context = await listConnectionsForBooking(bookingId);
  if (!context) return;

  const { admin, connections } = context;

  for (const connection of connections ?? []) {
    const synced = ((connection.synced_booking_events ?? {}) as Record<string, string>);
    const eventId = synced[bookingId];
    if (!eventId || !connection.access_token) continue;
    await deleteGoogleCalendarEvent({
      accessToken: connection.access_token,
      calendarId: connection.calendar_id || "primary",
      eventId,
    });
    const nextSynced = { ...synced };
    delete nextSynced[bookingId];
    await admin
      .from("google_calendar_connections")
      .update({ synced_booking_events: nextSynced as Json, updated_at: new Date().toISOString() })
      .eq("id", connection.id);
  }
}

export async function resyncCalendarEventForBooking(bookingId: string) {
  await removeCalendarEventForBooking(bookingId);
  await createCalendarEventForBooking(bookingId);
}

export async function validateGoogleCalendarConnection(accessToken: string) {
  const calendars = await fetchGoogleCalendars(accessToken);
  const primary = calendars.items?.find((item) => item.primary) ?? calendars.items?.[0] ?? null;
  return primary;
}
