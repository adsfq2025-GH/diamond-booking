import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendBookingReminder } from "@/lib/integrations/email";
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
    .select("id, booking_id, channel, scheduled_for, bookings(starts_at, address, price_cents, services(name), customers(full_name, email, phone), tenants(id, name, timezone))")
    .eq("status", "pending")
    .lte("scheduled_for", now)
    .limit(50);

  for (const reminder of reminders ?? []) {
    const booking = Array.isArray(reminder.bookings) ? reminder.bookings[0] : reminder.bookings;
    const customer = booking && Array.isArray(booking.customers) ? booking.customers[0] : booking?.customers;
    const service = booking && Array.isArray(booking.services) ? booking.services[0] : booking?.services;
    const tenant = booking && Array.isArray(booking.tenants) ? booking.tenants[0] : booking?.tenants;
    if (!service?.name || !tenant?.name || !booking?.starts_at) {
      await admin.from("booking_reminders").update({ status: "failed", error: "Missing reminder data", updated_at: new Date().toISOString() }).eq("id", reminder.id);
      continue;
    }

    const startsAt = new Date(booking.starts_at);
    const whenText = `${startsAt.toLocaleDateString("en-US", {
      timeZone: tenant.timezone || undefined,
      weekday: "long",
      month: "long",
      day: "numeric",
    })} at ${startsAt.toLocaleTimeString("en-US", {
      timeZone: tenant.timezone || undefined,
      hour: "numeric",
      minute: "2-digit",
    })}`;
    const addressText =
      booking.address && typeof booking.address === "object" && "line1" in booking.address
        ? String(booking.address.line1)
        : undefined;

    let result:
      | { ok: true; externalId: string | null }
      | { ok: false; error: string };

    if (reminder.channel === "sms") {
      if (!customer?.phone) {
        result = { ok: false, error: "Missing customer phone" };
      } else {
        const smsResult = await sendSms(customer.phone, reminderSms(tenant.name, service.name, booking.starts_at));
        result = smsResult.ok
          ? { ok: true, externalId: smsResult.sid }
          : { ok: false, error: smsResult.error };
      }
    } else if (reminder.channel === "email") {
      if (!customer?.email || !tenant?.id) {
        result = { ok: false, error: "Missing customer email" };
      } else {
        const emailResult = await sendBookingReminder(
          {
            businessName: tenant.name,
            customerName: customer.full_name || "Customer",
            customerEmail: customer.email,
            serviceName: service.name,
            whenText,
            priceText: `$${(((booking.price_cents as number | null) ?? 0) / 100).toFixed(2)}`,
            addressText,
          },
          tenant.id,
        );
        result = emailResult.ok
          ? { ok: true, externalId: emailResult.id }
          : { ok: false, error: emailResult.error };
      }
    } else {
      result = { ok: false, error: `Unsupported reminder channel: ${reminder.channel}` };
    }

    await admin
      .from("booking_reminders")
      .update({
        status: result.ok ? "sent" : "failed",
        sent_at: result.ok ? new Date().toISOString() : null,
        external_id: result.ok ? result.externalId : null,
        error: result.ok ? null : result.error,
        updated_at: new Date().toISOString(),
      })
      .eq("id", reminder.id);
  }

  return NextResponse.json({ ok: true, processed: reminders?.length ?? 0 });
}
