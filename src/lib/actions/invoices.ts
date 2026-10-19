"use server";

/**
 * Invoice actions (A17).
 *
 * The invoices screen previously mutated React state and nothing else: "Mark
 * paid" set status/paidCents locally, "Refund" set status locally, and
 * "Download" was `onClick={() => {}}`. Nothing reached the invoices table and
 * no refund reached Stripe — so an owner who clicked Refund believed a
 * customer had been refunded when no money had moved.
 *
 * Every action here is tenant-scoped through the owner's RLS client, writes to
 * the database, and (for refunds) calls Stripe. Refund state is then
 * reconciled by the charge.refunded webhook, which stays the single source of
 * truth; this action records the request and reports what Stripe said.
 */

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { supabaseEnvConfigured } from "@/lib/env";
import { refundPayment, stripeConfigured } from "@/lib/integrations/stripe";
import type { InvoiceStatus } from "@/types/database";

export type InvoiceResult =
  | { ok: true; status: InvoiceStatus; paidCents: number; message?: string }
  | { ok: false; error: string };

async function scope() {
  const profile = await requireRole("business_owner");
  if (!profile.tenant_id) return null;
  const supabase = await createClient();
  return { supabase, tenantId: profile.tenant_id };
}

/**
 * Record an invoice as paid outside the platform (cash, cheque, bank transfer).
 * Deliberately NOT a Stripe charge: it is a bookkeeping entry, and the
 * returned message says so, so it is never mistaken for a card payment.
 */
export async function markInvoicePaid(invoiceId: string): Promise<InvoiceResult> {
  if (!supabaseEnvConfigured()) {
    return { ok: false, error: "Preview mode — connect Supabase to save." };
  }
  const s = await scope();
  if (!s) return { ok: false, error: "No business found." };

  const { data: invoice, error: readError } = await s.supabase
    .from("invoices")
    .select("id, total_cents, paid_cents, status, customer_id, booking_id")
    .eq("id", invoiceId)
    .eq("tenant_id", s.tenantId)
    .maybeSingle();
  if (readError) return { ok: false, error: readError.message };
  if (!invoice) return { ok: false, error: "Invoice not found." };
  if (invoice.status === "paid") {
    return { ok: true, status: "paid", paidCents: invoice.paid_cents, message: "Already marked paid." };
  }
  if (invoice.status === "refunded") {
    return { ok: false, error: "This invoice has been refunded and cannot be marked paid." };
  }

  const total = invoice.total_cents ?? 0;
  const { error: updateError } = await s.supabase
    .from("invoices")
    .update({ status: "paid" satisfies InvoiceStatus, paid_cents: total })
    .eq("id", invoiceId)
    .eq("tenant_id", s.tenantId);
  if (updateError) return { ok: false, error: updateError.message };

  // A ledger row so reporting can reconcile cash against card takings.
  const outstanding = total - (invoice.paid_cents ?? 0);
  if (outstanding > 0) {
    await s.supabase.from("payments").insert({
      tenant_id: s.tenantId,
      invoice_id: invoiceId,
      booking_id: invoice.booking_id,
      customer_id: invoice.customer_id,
      amount_cents: outstanding,
      status: "succeeded",
      kind: "payment",
    });
  }

  revalidatePath("/dashboard/invoices");
  revalidatePath("/dashboard/reports");
  return {
    ok: true,
    status: "paid",
    paidCents: total,
    message: "Recorded as paid outside Stripe. No card was charged.",
  };
}

/**
 * Refund an invoice through Stripe.
 *
 * Requires a captured payment intent on this invoice — there is nothing to
 * refund otherwise, and saying "refunded" without one would be the exact lie
 * the old button told.
 */
export async function refundInvoice(invoiceId: string): Promise<InvoiceResult> {
  if (!supabaseEnvConfigured()) {
    return { ok: false, error: "Preview mode — connect Supabase to save." };
  }
  if (!stripeConfigured()) {
    return {
      ok: false,
      error: "Stripe is not configured, so no refund can be issued. Refund the customer directly and record it in your books.",
    };
  }
  const s = await scope();
  if (!s) return { ok: false, error: "No business found." };

  const { data: invoice } = await s.supabase
    .from("invoices")
    .select("id, total_cents, paid_cents, status")
    .eq("id", invoiceId)
    .eq("tenant_id", s.tenantId)
    .maybeSingle();
  if (!invoice) return { ok: false, error: "Invoice not found." };
  if (invoice.status === "refunded") {
    return { ok: true, status: "refunded", paidCents: invoice.paid_cents, message: "Already refunded." };
  }

  // The successful card payment behind this invoice, newest first.
  const { data: payments } = await s.supabase
    .from("payments")
    .select("id, stripe_payment_intent_id, amount_cents, kind, status")
    .eq("tenant_id", s.tenantId)
    .eq("invoice_id", invoiceId)
    .eq("status", "succeeded")
    .order("created_at", { ascending: false });

  const refundable = (payments ?? []).find(
    (p) => p.stripe_payment_intent_id && p.kind !== "refund" && p.amount_cents > 0,
  );
  if (!refundable?.stripe_payment_intent_id) {
    return {
      ok: false,
      error:
        "No card payment is recorded against this invoice, so there is nothing for Stripe to refund. If it was paid in cash, refund the customer directly.",
    };
  }

  const result = await refundPayment({
    paymentIntentId: refundable.stripe_payment_intent_id,
    amountCents: refundable.amount_cents,
  });
  if (!result.ok) return { ok: false, error: result.error };

  // Reflect it immediately; the charge.refunded webhook reconciles the ledger
  // and is authoritative if the two ever disagree.
  await s.supabase
    .from("invoices")
    .update({ status: "refunded" satisfies InvoiceStatus })
    .eq("id", invoiceId)
    .eq("tenant_id", s.tenantId);

  revalidatePath("/dashboard/invoices");
  revalidatePath("/dashboard/reports");
  return {
    ok: true,
    status: "refunded",
    paidCents: invoice.paid_cents,
    message: `Refunded $${(result.amountCents / 100).toFixed(2)} through Stripe.`,
  };
}

/** Move a draft invoice to sent. */
export async function sendInvoice(invoiceId: string): Promise<InvoiceResult> {
  if (!supabaseEnvConfigured()) {
    return { ok: false, error: "Preview mode — connect Supabase to save." };
  }
  const s = await scope();
  if (!s) return { ok: false, error: "No business found." };

  const { data: invoice } = await s.supabase
    .from("invoices")
    .select("id, status, paid_cents")
    .eq("id", invoiceId)
    .eq("tenant_id", s.tenantId)
    .maybeSingle();
  if (!invoice) return { ok: false, error: "Invoice not found." };
  if (invoice.status !== "draft") {
    return { ok: false, error: "Only a draft invoice can be sent." };
  }

  const { error } = await s.supabase
    .from("invoices")
    .update({ status: "sent" satisfies InvoiceStatus })
    .eq("id", invoiceId)
    .eq("tenant_id", s.tenantId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard/invoices");
  return { ok: true, status: "sent", paidCents: invoice.paid_cents };
}

/**
 * A short-lived download URL for an invoice PDF, when one has been stored.
 *
 * Returns a clear reason when there is no PDF rather than a dead button: PDF
 * generation is not implemented, and pretending otherwise is what the empty
 * onClick handler did.
 */
export async function invoiceDownloadUrl(
  invoiceId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!supabaseEnvConfigured()) {
    return { ok: false, error: "Preview mode — connect Supabase first." };
  }
  const s = await scope();
  if (!s) return { ok: false, error: "No business found." };

  const { data: invoice } = await s.supabase
    .from("invoices")
    .select("pdf_path")
    .eq("id", invoiceId)
    .eq("tenant_id", s.tenantId)
    .maybeSingle();
  if (!invoice?.pdf_path) {
    return {
      ok: false,
      error: "No PDF has been generated for this invoice yet.",
    };
  }

  const { data, error } = await s.supabase.storage
    .from("invoices")
    .createSignedUrl(invoice.pdf_path, 60 * 5);
  if (error || !data?.signedUrl) {
    return { ok: false, error: error?.message ?? "Could not create a download link." };
  }
  return { ok: true, url: data.signedUrl };
}
