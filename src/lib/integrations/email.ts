import "server-only";
import { Resend } from "resend";
import nodemailer from "nodemailer";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Transactional email. Two ways to connect, checked per booking in this order:
 *   1. The tenant's own SMTP settings (Settings → Integrations → Email) — lets
 *      each business send from their own Gmail / provider.
 *   2. A platform-wide Resend key (RESEND_API_KEY + RESEND_FROM_EMAIL).
 * If neither is set, sends are a graceful no-op (never throws). Templates are
 * inline and on-brand.
 */

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}

/** Platform-wide SMTP set via env (SMTP_HOST/USER/PASS...) — your own mail server. */
export function platformSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

/** Any platform-level sender configured (SMTP or Resend). */
export function platformEmailConfigured(): boolean {
  return platformSmtpConfigured() || emailConfigured();
}

function platformSmtpConfig(): TenantSmtp | null {
  if (!platformSmtpConfigured()) return null;
  // SMTP_FROM may be "Name <email>" or a bare address — nodemailer accepts either.
  const from = process.env.SMTP_FROM || (process.env.SMTP_USER as string);
  return {
    host: process.env.SMTP_HOST as string,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: /^(1|true|yes)$/i.test(process.env.SMTP_SECURE ?? "") || Number(process.env.SMTP_PORT) === 465,
    user: process.env.SMTP_USER as string,
    pass: process.env.SMTP_PASS as string,
    fromName: "",
    fromEmail: from,
  };
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

// ---------- per-tenant SMTP ----------

/** Stored in tenant.settings.email. The password is server-only, never sent to the client. */
export interface TenantSmtp {
  host: string;
  port: number;
  secure: boolean; // true for 465; false for 587/STARTTLS
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
}
export interface TenantEmailConfig {
  provider?: "smtp" | "resend" | "off";
  smtp?: Partial<TenantSmtp>;
}

function smtpComplete(s?: Partial<TenantSmtp>): s is TenantSmtp {
  return Boolean(s?.host && s?.port && s?.user && s?.pass && s?.fromEmail);
}

async function sendViaSmtp(
  s: TenantSmtp,
  to: string,
  subject: string,
  html: string,
): Promise<SendResult> {
  try {
    const transporter = nodemailer.createTransport({
      host: s.host,
      port: s.port,
      secure: s.secure,
      auth: { user: s.user, pass: s.pass },
    });
    const info = await transporter.sendMail({
      from: s.fromName ? `${s.fromName} <${s.fromEmail}>` : s.fromEmail,
      to,
      subject,
      html,
    });
    return { ok: true, id: info.messageId ?? null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "SMTP error" };
  }
}

/** Read a tenant's stored email config (server-only; uses the service role). */
async function readTenantEmailConfig(tenantId: string): Promise<TenantEmailConfig | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("tenants").select("settings").eq("id", tenantId).maybeSingle();
    const settings = (data?.settings ?? {}) as { email?: TenantEmailConfig };
    return settings.email ?? null;
  } catch {
    return null; // no service-role key configured
  }
}

/** Look up a tenant id from a widget public key (service role). */
async function tenantIdForKey(publicKey: string): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("widget_configs")
      .select("tenant_id")
      .eq("public_key", publicKey)
      .maybeSingle();
    return data?.tenant_id ?? null;
  } catch {
    return null;
  }
}

/** Core dispatch: tenant SMTP first, then platform Resend, else no-op. */
async function send(
  to: string,
  subject: string,
  html: string,
  tenantId?: string,
): Promise<SendResult> {
  if (tenantId) {
    const cfg = await readTenantEmailConfig(tenantId);
    if (cfg?.provider === "off") return { ok: false, skipped: true, error: "Email disabled" };
    if (cfg?.provider === "smtp" && smtpComplete(cfg.smtp)) {
      return sendViaSmtp(cfg.smtp, to, subject, html);
    }
  }
  // Platform-wide SMTP (your own mail server) takes priority over Resend.
  const platformSmtp = platformSmtpConfig();
  if (platformSmtp) return sendViaSmtp(platformSmtp, to, subject, html);

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

/** True if this tenant will actually deliver email (SMTP set, or platform Resend). */
export async function tenantEmailWillSend(tenantId: string | null): Promise<boolean> {
  if (tenantId) {
    const cfg = await readTenantEmailConfig(tenantId);
    if (cfg?.provider === "off") return false;
    if (cfg?.provider === "smtp" && smtpComplete(cfg.smtp)) return true;
  }
  return platformEmailConfigured();
}

/** Same, but resolves the tenant from a widget public key (for the booking page). */
export async function emailWillSendForKey(publicKey: string): Promise<boolean> {
  const tenantId = await tenantIdForKey(publicKey);
  return tenantEmailWillSend(tenantId);
}

/** Send a test email to verify SMTP settings (used by the settings UI). */
export async function sendTestEmail(tenantId: string, to: string): Promise<SendResult> {
  const html = shell(
    "Diamond Booking",
    "Test email",
    `<p style="margin:0;font-size:15px">Your email is connected. Booking confirmations and reminders will send from here.</p>`,
  );
  return send(to, "Diamond Booking — test email", html, tenantId);
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

export async function sendBookingConfirmation(
  d: BookingEmailData,
  tenantId?: string,
): Promise<SendResult> {
  const { subject, html } = bookingConfirmationEmail(d);
  return send(d.customerEmail, subject, html, tenantId);
}

export async function sendBookingReminder(
  d: BookingEmailData,
  tenantId?: string,
): Promise<SendResult> {
  const { subject, html } = bookingReminderEmail(d);
  return send(d.customerEmail, subject, html, tenantId);
}

/** Confirmation for a widget booking — resolves the tenant from the public key. */
export async function sendBookingConfirmationForKey(
  publicKey: string,
  d: BookingEmailData,
): Promise<SendResult> {
  const tenantId = await tenantIdForKey(publicKey);
  return sendBookingConfirmation(d, tenantId ?? undefined);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
