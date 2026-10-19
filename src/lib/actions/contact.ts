"use server";

/**
 * Marketing contact form (A15).
 *
 * The form previously validated locally and called setSent(true). There was no
 * fetch, no server action and no endpoint anywhere in the app, so every sales
 * enquiry was discarded while the visitor was told it had been received.
 *
 * This persists the submission (service role → contact_submissions, which has
 * RLS on and no policies) and notifies the platform's own inbox. The visitor is
 * only told it was sent if the write succeeded.
 */

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { supabaseEnvConfigured } from "@/lib/env";
import { sendContactNotification } from "@/lib/integrations/email";

export interface ContactInput {
  name: string;
  email: string;
  business: string;
  message: string;
  /** Hidden field: real people leave it empty, many bots do not. */
  honeypot?: string;
}

export type ContactResult = { ok: true } | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Submissions per email per hour before we stop accepting them. */
const RATE_LIMIT_PER_HOUR = 5;

export async function submitContactForm(input: ContactInput): Promise<ContactResult> {
  const name = input.name?.trim() ?? "";
  const email = input.email?.trim().toLowerCase() ?? "";
  const business = input.business?.trim() ?? "";
  const message = input.message?.trim() ?? "";

  // Server-side validation: the client validates too, but a server action is a
  // public POST endpoint and cannot trust any of it.
  if (!name) return { ok: false, error: "Please tell us your name." };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Please enter a valid email address." };
  if (message.length < 10) {
    return { ok: false, error: "Please tell us a little more about what you need." };
  }
  if (message.length > 5000 || name.length > 200 || business.length > 200) {
    return { ok: false, error: "That message is too long — please shorten it." };
  }

  // Silently accept and drop obvious bots: telling them why would help them.
  if (input.honeypot && input.honeypot.trim().length > 0) {
    return { ok: true };
  }

  if (!supabaseEnvConfigured()) {
    return {
      ok: false,
      error: "Messages can't be delivered right now. Please email us directly.",
    };
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    console.error("submitContactForm: no service-role key configured");
    return {
      ok: false,
      error: "Messages can't be delivered right now. Please email us directly.",
    };
  }

  const { count } = await admin
    .from("contact_submissions")
    .select("id", { count: "exact", head: true })
    .eq("email", email)
    .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());
  if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) {
    return {
      ok: false,
      error: "We've already received several messages from you — we'll be in touch shortly.",
    };
  }

  let userAgent: string | null = null;
  try {
    userAgent = (await headers()).get("user-agent");
  } catch {
    // Not available in every context; not important enough to fail over.
  }

  const { error } = await admin.from("contact_submissions").insert({
    name,
    email,
    business: business || null,
    message,
    user_agent: userAgent,
  });
  if (error) {
    console.error("submitContactForm: insert failed", error);
    return {
      ok: false,
      error: "Something went wrong saving your message. Please try again, or email us directly.",
    };
  }

  // Durable first, notification second: a failed email must not lose the lead.
  void sendContactNotification({ name, email, business, message }).catch((err) => {
    console.error("submitContactForm: notification failed (submission is saved)", err);
  });

  return { ok: true };
}
