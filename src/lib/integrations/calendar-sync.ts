import "server-only";

import { createAdminClient } from "@/lib/supabase/server";
import { deleteGoogleCalendarEvent, fetchGoogleCalendars, upsertGoogleCalendarEvent } from "@/lib/integrations/google-calendar";
import type { Json } from "@/types/database";

async function listConnectionsForBooking(bookingId: string) {
  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("id, tenant_id, starts_at, ends_at, status, service_id, customer_id")
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking) return null;

  const [{ data: services }, { data: customers }, { data: tenants }, { data: connections }] = await Promise.all([
    admin.from("services").select("id, name").eq("tenant_id", booking.tenant_id).eq("id", booking.service_id),
    admin.from("customers").select("id, full_name").eq("tenant_id", booking.tenant_id).eq("id", booking.customer_id),
    admin.from("tenants").select("id, name, timezone").eq("id", booking.tenant_id).maybeSingle(),
    admin.from("google_calendar_connections").select("id, calendar_id, access_token, sync_enabled, synced_booking_events").eq("tenant_id", booking.tenant_id),
  ]);

  return {
    admin,
    booking,
    serviceName: services?.[0]?.name ?? "Booking",
    customerName: customers?.[0]?.full_name ?? "Customer",
    tenantName: tenants?.name ?? "business",
    tenantTimeZone: tenants?.timezone || "America/New_York",
    connections: connections ?? [],
  };
}

export async function createCalendarEventForBooking(bookingId: string) {
  const context = await listConnectionsForBooking(bookingId);
  if (!context || context.booking.status === "cancelled") return;

  const { admin, booking, connections, serviceName, customerName, tenantName, tenantTimeZone } = context;

  for (const connection of connections) {
    if (!connection.sync_enabled || !connection.access_token) continue;
    const synced = ((connection.synced_booking_events ?? {}) as Record<string, string>);
    const event = await upsertGoogleCalendarEvent({
      accessToken: connection.access_token,
      calendarId: connection.calendar_id || "primary",
      eventId: synced[booking.id],
      summary: `${serviceName} · ${customerName}`,
      description: `Booking synced from Diamond Booking for ${tenantName}.`,
      startsAt: booking.starts_at,
      endsAt: booking.ends_at,
      timeZone: tenantTimeZone,
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
