import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendBookingReminder } from "@/lib/integrations/email";
import { reminderSms, sendSms } from "@/lib/integrations/sms";
import { secretsMatch } from "@/lib/signed-state";

/**
 * Send the reminders that are due.
 *
 * Made recoverable after the review of 23 October 2026 (D01), which found the
 * five most recent runs failing and one reminder overdue since the 19th:
 *
 *  - Claiming is atomic. The worker used to SELECT pending rows and then send,
 *    with nothing between the two to stop a second caller reading the same
 *    rows: a retry after partial processing, or any caller besides the GitHub
 *    workflow whose concurrency group only covers itself, could send the same
 *    reminder twice. claim_due_reminders() flips the rows to 'processing' in
 *    one UPDATE ... RETURNING and counts the attempt.
 *
 *  - Failures retry. A failed send was marked 'failed' and never looked at
 *    again, so one bad SMTP response permanently lost the reminder.
 *    complete_reminder() returns it to 'pending' with backoff until the
 *    attempt ceiling, and only then gives up visibly.
 *
 *  - Terminal states are checked. Nothing asked whether the appointment had
 *    been cancelled or had already happened, so a cancelled booking could
 *    still be reminded about. Both the claim and the retirement pass exclude
 *    them, and overdue reminders for past appointments are retired rather than
 *    left pending forever.
 *
 * The response reports what happened per outcome, so a failing scheduled run
 * can be diagnosed from its own output instead of from the database.
 */

/** How many reminders one invocation will process. */
const BATCH_SIZE = 50;

export async function GET(req: NextRequest) {
  return run(req);
}
export async function POST(req: NextRequest) {
  return run(req);
}

async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !secretsMatch(req.headers.get("authorization"), `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Service role not configured" }, { status: 503 });
  }

  // Reminders for appointments that were cancelled or have already happened
  // can never be delivered meaningfully. Retire them first so they stop being
  // claimed, and so "pending and overdue" means something.
  const { data: retired, error: retireError } = await admin.rpc("retire_stale_reminders");
  if (retireError) {
    console.error("[reminders] could not retire stale rows", retireError);
  }

  const { data: claimed, error: claimError } = await admin.rpc("claim_due_reminders", {
    p_limit: BATCH_SIZE,
  });
  if (claimError) {
    // Fail loudly: a scheduled run that cannot claim has nothing to report but
    // "ok", which is how five failed runs went unnoticed.
    console.error("[reminders] claim failed", claimError);
    return NextResponse.json({ error: "Could not claim reminders", detail: claimError.message }, { status: 500 });
  }

  const reminders = (claimed ?? []) as Array<{
    id: string;
    booking_id: string;
    channel: string;
    attempts: number;
  }>;

  const outcome = { claimed: reminders.length, sent: 0, retrying: 0, failed: 0 };
  const problems: Array<{ id: string; error: string }> = [];

  for (const reminder of reminders) {
    const { data: bookingRows } = await admin
      .from("bookings")
      .select(
        "starts_at, address, price_cents, status, services(name), customers(full_name, email, phone), tenants(id, name, timezone)",
      )
      .eq("id", reminder.booking_id)
      .limit(1);

    const booking = bookingRows?.[0];
    const customer = booking && Array.isArray(booking.customers) ? booking.customers[0] : booking?.customers;
    const service = booking && Array.isArray(booking.services) ? booking.services[0] : booking?.services;
    const tenant = booking && Array.isArray(booking.tenants) ? booking.tenants[0] : booking?.tenants;

    const settle = async (
      result: { ok: true; externalId: string | null } | { ok: false; error: string },
    ) => {
      const { data: row, error: completeError } = await admin.rpc("complete_reminder", {
        p_reminder_id: reminder.id,
        p_ok: result.ok,
        p_external_id: result.ok ? result.externalId : null,
        p_error: result.ok ? null : result.error,
      });
      if (completeError) {
        console.error("[reminders] could not record outcome", reminder.id, completeError);
      }
      if (result.ok) {
        outcome.sent += 1;
        return;
      }
      problems.push({ id: reminder.id, error: result.error });
      const status = (row as { status?: string } | null)?.status;
      if (status === "failed") outcome.failed += 1;
      else outcome.retrying += 1;
    };

    if (!service?.name || !tenant?.name || !booking?.starts_at) {
      // A genuinely unsendable row. It still goes through complete_reminder so
      // the attempt is counted and it eventually stops being retried.
      await settle({ ok: false, error: "Missing reminder data" });
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

    if (reminder.channel === "sms") {
      if (!customer?.phone) {
        await settle({ ok: false, error: "Missing customer phone" });
        continue;
      }
      const smsResult = await sendSms(
        customer.phone,
        reminderSms(tenant.name, service.name, booking.starts_at),
      ).catch((err: unknown) => ({ ok: false as const, error: String(err) }));
      await settle(
        smsResult.ok
          ? { ok: true, externalId: smsResult.sid }
          : { ok: false, error: smsResult.error },
      );
      continue;
    }

    if (reminder.channel === "email") {
      if (!customer?.email || !tenant?.id) {
        await settle({ ok: false, error: "Missing customer email" });
        continue;
      }
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
      ).catch((err: unknown) => ({ ok: false as const, error: String(err) }));
      await settle(
        emailResult.ok
          ? { ok: true, externalId: emailResult.id }
          : { ok: false, error: emailResult.error },
      );
      continue;
    }

    await settle({ ok: false, error: `Unsupported reminder channel: ${reminder.channel}` });
  }

  // A run in which nothing could be delivered is not a successful run.
  const allFailed = outcome.claimed > 0 && outcome.sent === 0;
  return NextResponse.json(
    {
      ok: !allFailed,
      retired: typeof retired === "number" ? retired : 0,
      ...outcome,
      problems: problems.slice(0, 10),
    },
    { status: allFailed ? 500 : 200 },
  );
}
