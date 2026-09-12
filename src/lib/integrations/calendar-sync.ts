import "server-only";

import { createAdminClient } from "@/lib/supabase/server";
import { fetchGoogleCalendars } from "@/lib/integrations/google-calendar";

export async function createCalendarEventForBooking(bookingId: string) {
  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("id, tenant_id, starts_at, ends_at, status, customers(full_name), services(name), employees(profile_id), tenants(name), google_calendar_connections!google_calendar_connections_tenant_idx(calendar_id, access_token, sync_enabled)")
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking || booking.status === "cancelled") return;
}

export async function validateGoogleCalendarConnection(accessToken: string) {
  const calendars = await fetchGoogleCalendars(accessToken);
  const primary = calendars.items?.find((item) => item.primary) ?? calendars.items?.[0] ?? null;
  return primary;
}
