import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { reminderSms, sendSms } from "@/lib/integrations/sms";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data: reminders } = await admin
    .from("booking_reminders")
    .select("id, booking_id, channel, scheduled_for, bookings(starts_at, services(name), customers(full_name, phone), tenants(name))")
    .eq("status", "pending")
    .lte("scheduled_for", now)
    .limit(50);

  for (const reminder of reminders ?? []) {
    if (reminder.channel !== "sms") continue;
    const booking = Array.isArray(reminder.bookings) ? reminder.bookings[0] : reminder.bookings;
    const customer = booking && Array.isArray(booking.customers) ? booking.customers[0] : booking?.customers;
    const service = booking && Array.isArray(booking.services) ? booking.services[0] : booking?.services;
    const tenant = booking && Array.isArray(booking.tenants) ? booking.tenants[0] : booking?.tenants;
    if (!customer?.phone || !service?.name || !tenant?.name || !booking?.starts_at) {
      await admin.from("booking_reminders").update({ status: "failed", error: "Missing reminder data", updated_at: new Date().toISOString() }).eq("id", reminder.id);
      continue;
    }
    const result = await sendSms(customer.phone, reminderSms(tenant.name, service.name, booking.starts_at));
    await admin
      .from("booking_reminders")
      .update({
        status: result.ok ? "sent" : "failed",
        sent_at: result.ok ? new Date().toISOString() : null,
        external_id: result.ok ? result.sid : null,
        error: result.ok ? null : result.error,
        updated_at: new Date().toISOString(),
      })
      .eq("id", reminder.id);
  }

  return NextResponse.json({ ok: true, processed: reminders?.length ?? 0 });
}
