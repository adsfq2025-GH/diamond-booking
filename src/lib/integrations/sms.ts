import "server-only";

/**
 * SMS reminders via Twilio's REST API (no SDK dependency — a single fetch).
 * Behind TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER; when
 * unset, send() is a no-op. SMS is plan-gated (professional/elite) at the
 * call site via hasFeature(plan, "sms_reminders").
 */

export function smsConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM_NUMBER,
  );
}

type SmsResult =
  | { ok: true; sid: string }
  | { ok: false; skipped?: boolean; error: string };

export async function sendSms(to: string, body: string): Promise<SmsResult> {
  if (!smsConfigured()) return { ok: false, skipped: true, error: "SMS not configured" };

  const sid = process.env.TWILIO_ACCOUNT_SID as string;
  const token = process.env.TWILIO_AUTH_TOKEN as string;
  const from = process.env.TWILIO_FROM_NUMBER as string;
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");

  const params = new URLSearchParams({ To: to, From: from, Body: body });
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      },
    );
    const data = (await res.json()) as { sid?: string; message?: string };
    if (!res.ok) return { ok: false, error: data.message ?? `Twilio error ${res.status}` };
    return { ok: true, sid: data.sid ?? "" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "SMS error" };
  }
}

/** Standard reminder copy. */
export function reminderSms(businessName: string, serviceName: string, whenText: string): string {
  return `${businessName}: reminder for your ${serviceName} on ${whenText}. Reply STOP to opt out.`;
}
