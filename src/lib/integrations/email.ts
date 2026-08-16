import "server-only";
import { Resend } from "resend";

/**
 * Transactional email via Resend. Behind RESEND_API_KEY + RESEND_FROM_EMAIL:
 * when unset, send() is a no-op that returns { ok:false, skipped:true } so
 * calling code never crashes in environments without email configured.
 * Templates are inline, on-brand (navy + gold), and plain enough to render
 * everywhere.
 */

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}

let client: Resend | null = null;
function getResend(): Resend | null {
  if (!emailConfigured()) return null;
  if (!client) client = new Resend(process.env.RESEND_API_KEY as string);
  return client;
}

type SendResult =
  | { ok: true; id: string | null }
  | { ok: false; skipped?: boolean; error: string };

async function send(to: string, subject: string, html: string): Promise<SendResult> {
  const resend = getResend();
  if (!resend) return { ok: false, skipped: true, error: "Email not configured" };
  try {
    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL as string,
      to,
      subject,
      html,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data?.id ?? null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Email error" };
  }
}

// ---------- templates ----------

function shell(businessName: string, heading: string, bodyHtml: string): string {
  return `
  <div style="background:#f4f7fa;padding:32px 0;font-family:Inter,Arial,sans-serif;color:#0c2440">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e3eaf1">
      <div style="background:#0c2440;padding:20px 28px;color:#fff">
        <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;opacity:.7">${escapeHtml(businessName)}</div>
        <div style="font-size:20px;font-weight:700;margin-top:2px">${escapeHtml(heading)}</div>
      </div>
      <div style="padding:28px">${bodyHtml}</div>
      <div style="padding:16px 28px;border-top:1px solid #e3eaf1;font-size:12px;color:#7c8fa3">
        Powered by Diamond Booking
      </div>
    </div>
  </div>`;
}

function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 0;color:#7c8fa3;font-size:13px">${escapeHtml(label)}</td>
    <td style="padding:6px 0;text-align:right;font-weight:600;font-size:13px">${escapeHtml(value)}</td>
  </tr>`;
}

export interface BookingEmailData {
  businessName: string;
  customerName: string;
  customerEmail: string;
  serviceName: string;
  whenText: string; // e.g. "Monday, Aug 17 at 10:00 AM"
  priceText: string;
  addressText?: string;
}

export function bookingConfirmationEmail(d: BookingEmailData): { subject: string; html: string } {
  const body = `
    <p style="margin:0 0 16px;font-size:15px">Hi ${escapeHtml(d.customerName.split(" ")[0])}, your booking is confirmed. We look forward to seeing you!</p>
    <table style="width:100%;border-collapse:collapse;background:#f4f7fa;border-radius:12px;padding:8px">
      <tbody style="display:block;padding:12px 16px">
        ${detailRow("Service", d.serviceName)}
        ${detailRow("When", d.whenText)}
        ${d.addressText ? detailRow("Address", d.addressText) : ""}
        ${detailRow("Total", d.priceText)}
      </tbody>
    </table>
    <p style="margin:18px 0 0;font-size:13px;color:#7c8fa3">Need to make a change? Reply to this email and we'll help.</p>`;
  return {
    subject: `Booking confirmed — ${d.serviceName}`,
    html: shell(d.businessName, "You're booked!", body),
  };
}

export function bookingReminderEmail(d: BookingEmailData): { subject: string; html: string } {
  const body = `
    <p style="margin:0 0 16px;font-size:15px">Hi ${escapeHtml(d.customerName.split(" ")[0])}, a quick reminder about your upcoming appointment.</p>
    <table style="width:100%;border-collapse:collapse">
      <tbody>
        ${detailRow("Service", d.serviceName)}
        ${detailRow("When", d.whenText)}
        ${d.addressText ? detailRow("Address", d.addressText) : ""}
      </tbody>
    </table>`;
  return {
    subject: `Reminder — ${d.serviceName} ${d.whenText}`,
    html: shell(d.businessName, "See you soon", body),
  };
}

export async function sendBookingConfirmation(d: BookingEmailData): Promise<SendResult> {
  const { subject, html } = bookingConfirmationEmail(d);
  return send(d.customerEmail, subject, html);
}

export async function sendBookingReminder(d: BookingEmailData): Promise<SendResult> {
  const { subject, html } = bookingReminderEmail(d);
  return send(d.customerEmail, subject, html);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
