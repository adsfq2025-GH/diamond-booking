/**
 * Public booking-widget data access. Powers /book/[public_key] and the
 * embed. Anonymous — no auth. Uses the anon Supabase client to call the
 * SECURITY DEFINER RPCs (get_widget_config, get_available_slots,
 * create_widget_booking). In placeholder mode it returns a demo config and
 * generates slots locally so the flow is fully testable without a backend.
 */
import "server-only";
import { supabaseEnvConfigured } from "@/lib/env";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { sendBookingConfirmationForKey } from "@/lib/integrations/email";
import { createCalendarEventForBooking } from "@/lib/integrations/calendar-sync";
import { createDepositIntent } from "@/lib/integrations/stripe";
import {
  computeOccurrences,
  DEFAULT_MAX_OCCURRENCES,
  type RecurrenceRule,
} from "@/lib/recurrence";
import { materializeSeries } from "@/lib/recurrence-series";
import { bookingErrorMessage } from "@/lib/booking-errors";
import { smsRemindersAllowed } from "@/lib/entitlements";
import type { PlanTier } from "@/types/database";
import type {
  AvailableSlot,
  WidgetConfigPayload,
  WidgetBookingResult,
} from "@/types/domain";

/** Business hours mirroring the seed (0 = Sunday). */
const MOCK_HOURS = [
  { weekday: 0, open_time: null, close_time: null, closed: true },
  { weekday: 1, open_time: "08:00", close_time: "18:00", closed: false },
  { weekday: 2, open_time: "08:00", close_time: "18:00", closed: false },
  { weekday: 3, open_time: "08:00", close_time: "18:00", closed: false },
  { weekday: 4, open_time: "08:00", close_time: "18:00", closed: false },
  { weekday: 5, open_time: "08:00", close_time: "18:00", closed: false },
  { weekday: 6, open_time: "09:00", close_time: "15:00", closed: false },
];

const PREVIEW_SERVICES: WidgetConfigPayload["services"] = [
  {
    id: "preview-service-standard-home-cleaning",
    name: "Standard Home Cleaning",
    description: "Routine home cleaning for kitchens, bathrooms, and common areas.",
    category: "Cleaning",
    duration_minutes: 120,
    price_cents: 12000,
    deposit_cents: 0,
    addons: [
      {
        id: "preview-addon-fridge",
        name: "Inside fridge",
        price_cents: 2500,
        duration_minutes: 20,
      },
      {
        id: "preview-addon-oven",
        name: "Inside oven",
        price_cents: 2500,
        duration_minutes: 20,
      },
    ],
  },
  {
    id: "preview-service-deep-cleaning",
    name: "Deep Cleaning",
    description: "A top-to-bottom reset with extra detail work for the whole home.",
    category: "Cleaning",
    duration_minutes: 240,
    price_cents: 24000,
    deposit_cents: 5000,
    addons: [],
  },
  {
    id: "preview-service-office-cleaning",
    name: "Office Cleaning",
    description: "Recurring office upkeep for desks, floors, and shared spaces.",
    category: "Commercial",
    duration_minutes: 90,
    price_cents: 15000,
    deposit_cents: 0,
    addons: [],
  },
];

function mockConfig(): WidgetConfigPayload {
  return {
    tenant: {
      slug: "clean-sweep",
      name: "Clean Sweep Services",
      industry: "cleaning",
      timezone: "America/New_York",
      branding: { primary_color: "#2e86c1" },
    },
    theme: { primary_color: "#2e86c1", radius: "12px", layout: "vertical" },
    custom_fields: [
      { key: "pets", label: "Any pets we should know about?", type: "text", required: false },
    ],
    business_hours: MOCK_HOURS,
    services: PREVIEW_SERVICES,
  };
}

/** Load the public widget config, or null when the key is unknown. */
export async function getWidgetConfig(
  publicKey: string,
): Promise<WidgetConfigPayload | null> {
  if (!supabaseEnvConfigured()) {
    // Any key resolves to the demo business in preview mode.
    return mockConfig();
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_widget_config", {
    p_public_key: publicKey,
  });
  if (error || !data) return null;
  return data as unknown as WidgetConfigPayload;
}

/**
 * Available slots for a service on a date ('YYYY-MM-DD'), for the service plus
 * the selected add-ons. In preview mode we synthesize slots from the mock
 * business hours + the same duration calculation.
 *
 * The RPC returns one row per (slot, employee) because capacity is per
 * employee. Customers must see each time ONCE — showing it per employee was
 * the duplicate-times defect (A11) — so we collapse by slot_start here and
 * deliberately drop the employee id: the booking RPC re-picks a free qualified
 * employee at insert time, which keeps the full capacity of the slot instead
 * of pinning it to whichever employee happened to be listed first.
 */
export async function getAvailableSlots(
  publicKey: string,
  serviceId: string,
  date: string,
  addonIds: string[] = [],
): Promise<AvailableSlot[]> {
  if (!supabaseEnvConfigured()) {
    return dedupeSlots(mockSlots(serviceId, date, addonIds));
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_available_slots", {
    p_public_key: publicKey,
    p_service_id: serviceId,
    p_date: date,
    p_addon_ids: addonIds,
  });
  if (error || !data) return [];
  return dedupeSlots(data as AvailableSlot[]);
}

/** One visible choice per start time, ordered, with no employee pinned. */
function dedupeSlots(slots: AvailableSlot[]): AvailableSlot[] {
  const byStart = new Map<string, AvailableSlot>();
  for (const s of slots) {
    if (!byStart.has(s.slot_start)) {
      byStart.set(s.slot_start, { ...s, employee_id: null });
    }
  }
  return [...byStart.values()].sort((a, b) => a.slot_start.localeCompare(b.slot_start));
}

function mockSlots(serviceId: string, date: string, addonIds: string[] = []): AvailableSlot[] {
  const svc = mockConfig().services.find((s) => s.id === serviceId);
  // Mirror booking_duration_minutes(): service + selected add-ons.
  const duration =
    (svc?.duration_minutes ?? 60) +
    (svc?.addons ?? [])
      .filter((a) => addonIds.includes(a.id))
      .reduce((sum, a) => sum + (a.duration_minutes ?? 0), 0);
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(y, m - 1, d);
  const hours = MOCK_HOURS[day.getDay()];
  if (!hours || hours.closed || !hours.open_time || !hours.close_time) return [];

  const [oh, om] = hours.open_time.split(":").map(Number);
  const [ch, cm] = hours.close_time.split(":").map(Number);
  const open = new Date(y, m - 1, d, oh, om);
  const close = new Date(y, m - 1, d, ch, cm);
  const now = new Date();

  const slots: AvailableSlot[] = [];
  const step = 60; // offer hourly start times
  const employees = ["eeeeeeee-0000-0000-0000-000000000001", "eeeeeeee-0000-0000-0000-000000000002"];
  let cursor = new Date(open);
  let i = 0;
  while (cursor.getTime() + duration * 60000 <= close.getTime()) {
    // deterministic-ish "already booked" gaps so it doesn't look full/empty
    const skip = (cursor.getHours() + day.getDate()) % 4 === 0;
    if (!skip && cursor.getTime() > now.getTime()) {
      const end = new Date(cursor.getTime() + duration * 60000);
      slots.push({
        slot_start: cursor.toISOString(),
        slot_end: end.toISOString(),
        employee_id: employees[i % employees.length],
      });
      i++;
    }
    cursor = new Date(cursor.getTime() + step * 60000);
  }
  return slots;
}

/**
 * Turn the booking RPC's error codes into something a customer can act on.
 * Raw Postgres messages ("slot_taken", or an exclusion-violation dump) used to
 * be shown verbatim. Unknown codes fall back to a neutral message rather than
 * leaking internals.
 */
/**
 * Price a service + add-ons + an optional coupon before booking (A16).
 * The quote and the booking share price_coupon()/booking_duration_minutes()
 * in SQL, so what the customer is shown cannot drift from what is charged.
 */
export async function quoteBooking(input: {
  publicKey: string;
  serviceId: string;
  addonIds?: string[];
  couponCode?: string | null;
  /** Hours / square feet / custom units, for a service priced per unit (B06). */
  quantity?: number | null;
}): Promise<{
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  depositCents: number;
  durationMinutes: number;
  /** flat | hourly | square_foot | custom — what the total was calculated on. */
  pricingUnit: string;
  /** The units actually charged for: an hourly service bills its minimum. */
  pricingQuantity: number;
  pricingUnitLabel: string | null;
  couponError: string | null;
} | null> {
  if (!supabaseEnvConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("quote_booking", {
    p_public_key: input.publicKey,
    p_service_id: input.serviceId,
    p_addon_ids: input.addonIds ?? [],
    p_coupon_code: input.couponCode ?? null,
    p_quantity: input.quantity ?? null,
  });
  if (error || !data) return null;

  const q = data as unknown as {
    subtotal_cents: number;
    discount_cents: number;
    total_cents: number;
    deposit_cents: number;
    duration_minutes: number;
    pricing_unit?: string;
    pricing_quantity?: number | string;
    pricing_unit_label?: string | null;
    coupon: { ok: boolean; error?: string; min_subtotal_cents?: number };
  };
  return {
    subtotalCents: q.subtotal_cents,
    discountCents: q.discount_cents,
    totalCents: q.total_cents,
    depositCents: q.deposit_cents,
    durationMinutes: q.duration_minutes,
    pricingUnit: q.pricing_unit ?? "flat",
    pricingQuantity: Number(q.pricing_quantity ?? 1),
    pricingUnitLabel: q.pricing_unit_label ?? null,
    couponError:
      input.couponCode && !q.coupon?.ok
        ? couponErrorMessage(q.coupon?.error, q.coupon?.min_subtotal_cents)
        : null,
  };
}

function couponErrorMessage(code?: string, minSubtotalCents?: number): string {
  switch (code) {
    case "not_found":
      return "We don't recognise that code.";
    case "inactive":
      return "That code is no longer active.";
    case "expired":
      return "That code has expired.";
    case "fully_redeemed":
      return "That code has reached its redemption limit.";
    case "below_minimum":
      return minSubtotalCents
        ? `That code needs a minimum order of $${(minSubtotalCents / 100).toFixed(2)}.`
        : "Your order doesn't meet the minimum for that code.";
    default:
      return "That code can't be applied.";
  }
}

/**
 * Record an enquiry when a customer cannot find a slot (A34).
 *
 * Explicitly NOT a booking: it reserves nothing and consumes no capacity. The
 * no-availability state used to be a dead end — "No openings this day. Try
 * another date." and nothing else — so every customer who landed on a full day
 * was lost silently.
 */
export async function createBookingInquiry(input: {
  publicKey: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  serviceId?: string | null;
  requestedDate?: string | null;
  notes?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!supabaseEnvConfigured()) {
    return { ok: true }; // preview mode: pretend, nothing to store
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_booking_inquiry", {
    p_public_key: input.publicKey,
    p_customer_name: input.customerName,
    p_customer_email: input.customerEmail,
    p_customer_phone: input.customerPhone ?? null,
    p_service_id: input.serviceId ?? null,
    p_requested_date: input.requestedDate ?? null,
    p_notes: input.notes ?? null,
  });
  if (error) {
    const code = error.message.toLowerCase();
    if (code.includes("too_many_requests")) {
      return { ok: false, error: "We already have your request — the business will be in touch." };
    }
    if (code.includes("name_required")) return { ok: false, error: "Please enter your name." };
    if (code.includes("email_required")) return { ok: false, error: "Please enter your email address." };
    return { ok: false, error: "Could not send your request. Please try again." };
  }
  return { ok: true };
}

/**
 * Is this widget allowed to be embedded on `referer`'s origin? (A26)
 *
 * widget_configs.allowed_domains was collected, stored and listed back to the
 * owner under "Where the widget may be embedded" — and never read by anything.
 * Neither the booking page nor any of the RPCs consulted it, so the widget
 * could be embedded on any site by anyone holding the public key. The control
 * was a placebo that owners would reasonably trust.
 *
 * An empty list still means "anywhere", which is the sensible default and what
 * every existing tenant has. A referer is only present on cross-origin embeds,
 * and it is a hint, not proof — so this governs EMBEDDING, never authorization:
 * the hosted /book page and the RPCs behind it remain reachable directly, as
 * they must be for a customer following a link.
 */
export async function embedAllowedForKey(
  publicKey: string,
  referer: string | null,
): Promise<{ allowed: true } | { allowed: false; domains: string[] }> {
  if (!supabaseEnvConfigured()) return { allowed: true };
  if (!referer) return { allowed: true }; // direct visit, not an embed

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { allowed: true }; // cannot check: do not break the booking page
  }

  const { data } = await admin
    .from("widget_configs")
    .select("allowed_domains")
    .eq("public_key", publicKey)
    .maybeSingle();

  const domains = (data?.allowed_domains ?? []).filter(Boolean);
  if (domains.length === 0) return { allowed: true };

  let host: string;
  try {
    host = new URL(referer).hostname.toLowerCase();
  } catch {
    return { allowed: true };
  }

  const ok = domains.some((entry) => {
    const d = entry.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!d) return false;
    // "example.com" also covers its subdomains; "www.example.com" does not
    // cover "example.com".
    return host === d || host.endsWith(`.${d}`);
  });

  return ok ? { allowed: true } : { allowed: false, domains };
}

export interface CreateBookingInput {
  publicKey: string;
  serviceId: string;
  /** Discount code the customer entered, validated server-side. */
  couponCode?: string | null;
  startsAt: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  employeeId?: string | null;
  address?: Record<string, unknown> | null;
  notes?: string | null;
  addonIds?: string[];
  /** Hours / square feet / custom units, for a service priced per unit (B06). */
  quantity?: number | null;
  /** Recurrence for the series ("none" = one-time). */
  recurrence?: RecurrenceRule;
  /** ISO date string; null/undefined = open-ended (rolling window). */
  recurrenceUntil?: string | null;
}

/** Whether the tenant has enabled customer-facing recurring bookings. */
export async function getWidgetRecurringEnabled(publicKey: string): Promise<boolean> {
  if (!supabaseEnvConfigured()) return true; // demo: show the option
  try {
    const admin = createAdminClient();
    const { data: wc } = await admin
      .from("widget_configs")
      .select("tenant_id")
      .eq("public_key", publicKey)
      .maybeSingle();
    if (!wc?.tenant_id) return false;
    const { data: tenant } = await admin
      .from("tenants")
      .select("settings")
      .eq("id", wc.tenant_id)
      .maybeSingle();
    const settings = (tenant?.settings ?? {}) as { recurring_enabled?: boolean };
    return Boolean(settings.recurring_enabled);
  } catch {
    return false;
  }
}

/** What actually happened to a recurring series, so we can tell the customer. */
export interface RecurrenceOutcome {
  /** Occurrences successfully reserved, not counting the first booking. */
  reserved: number;
  /** ISO dates that could not be reserved. */
  skipped: string[];
  /** The same dates with the reason each one was refused. */
  skippedReasons?: Array<{ startsAt: string; reason: string }>;
  /** True when the run stopped early on an unexpected error. */
  incomplete: boolean;
}

/**
 * Reserve every future occurrence of a recurring booking.
 *
 * Each visit now goes through create_series_occurrence() (B04). The previous
 * version inserted copied booking rows with the service role, which meant
 * every visit after the first skipped the business-hours, staff-eligibility,
 * approved-time-off and buffer checks the first one passed, carried none of
 * its add-on links, queued no reminders and dispatched no calendar event. A
 * standing appointment could therefore sit on a day the business is closed,
 * with half its job details missing and nobody reminded about it.
 *
 * Occurrences that cannot be reserved are still skipped rather than fatal —
 * and still REPORTED, now with the reason, so the customer learns which dates
 * are missing instead of being told their series was booked.
 */
async function materializeRecurrence(input: {
  firstBookingId: string;
  rule: RecurrenceRule;
  recurrenceUntil: string | null;
  /** The business's IANA timezone, so a weekly 09:00 stays 09:00 (B05). */
  timezone: string;
  tenantId: string;
  customerId: string | null;
  notifications: Record<string, unknown>;
  plan: PlanTier;
}): Promise<RecurrenceOutcome> {
  const outcome: RecurrenceOutcome = { reserved: 0, skipped: [], incomplete: false };
  if (!input.rule || input.rule === "none") return outcome;
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    // No service-role key: the first booking stands, the series does not.
    outcome.incomplete = true;
    return outcome;
  }

  const { data: first } = await admin
    .from("bookings")
    .select("id, starts_at, status")
    .eq("id", input.firstBookingId)
    .maybeSingle();
  if (!first) {
    outcome.incomplete = true;
    return outcome;
  }

  const groupId = crypto.randomUUID();
  const until = input.recurrenceUntil ? new Date(input.recurrenceUntil) : null;

  // Tag the original as the series anchor. create_series_occurrence copies the
  // group id and rule from it, so this has to land first.
  const { error: anchorError } = await admin
    .from("bookings")
    .update({
      recurrence_group_id: groupId,
      recurrence_rule: input.rule,
      recurrence_until: input.recurrenceUntil ?? null,
    })
    .eq("id", input.firstBookingId);
  if (anchorError) {
    console.error("[recurrence] could not anchor the series", anchorError);
    outcome.incomplete = true;
    return outcome;
  }

  const occurrences = computeOccurrences(
    new Date(first.starts_at),
    input.rule,
    until,
    DEFAULT_MAX_OCCURRENCES,
    input.timezone || "UTC",
  );

  const result = await materializeSeries(admin, input.firstBookingId, occurrences);
  outcome.reserved = result.reserved.length;
  outcome.skipped = result.skipped.map((s) => s.startsAt);
  outcome.skippedReasons = result.skipped;
  outcome.incomplete = result.incomplete;

  // Every reserved visit gets the same follow-up the first one gets: a queued
  // reminder and, once confirmed, a calendar event. Neither happened before.
  for (const bookingId of result.reserved) {
    const { data: row } = await admin
      .from("bookings")
      .select("starts_at, status")
      .eq("id", bookingId)
      .maybeSingle();
    if (!row) continue;

    await scheduleBookingReminders({
      bookingId,
      tenantId: input.tenantId,
      customerId: input.customerId,
      startsAt: row.starts_at,
      notifications: input.notifications,
      plan: input.plan,
    }).catch((err) => {
      console.error("[recurrence] could not queue reminders for an occurrence", err);
    });

    if (row.status === "confirmed") {
      await createCalendarEventForBooking(bookingId).catch(() => {});
    }
  }

  return outcome;
}

async function scheduleBookingReminders(input: {
  bookingId: string;
  tenantId: string;
  customerId?: string | null;
  startsAt: string;
  notifications: Record<string, unknown>;
  /** The tenant's plan, so a paid channel is not queued for free (A19). */
  plan: PlanTier;
}) {
  const admin = createAdminClient();
  const reminders: Array<{ channel: string; scheduled_for: string }> = [];
  const startsAt = new Date(input.startsAt).getTime();

  // SMS is a paid feature with a real Twilio cost per message. The tenant
  // setting alone used to be enough to queue it, on any plan.
  const smsAllowed =
    input.notifications.sms_reminders === true && smsRemindersAllowed(input.plan);
  if (smsAllowed && input.notifications.sms_reminder_24h !== false) {
    reminders.push({ channel: "sms", scheduled_for: new Date(startsAt - 24 * 60 * 60 * 1000).toISOString() });
  }
  if (smsAllowed && input.notifications.sms_reminder_2h === true) {
    reminders.push({ channel: "sms", scheduled_for: new Date(startsAt - 2 * 60 * 60 * 1000).toISOString() });
  }
  if (input.notifications.reminder_emails !== false) {
    reminders.push({ channel: "email", scheduled_for: new Date(startsAt - 24 * 60 * 60 * 1000).toISOString() });
  }
  if (reminders.length === 0) return;
  await admin.from("booking_reminders").upsert(
    reminders.map((reminder) => ({
      tenant_id: input.tenantId,
      booking_id: input.bookingId,
      customer_id: input.customerId ?? null,
      channel: reminder.channel,
      scheduled_for: reminder.scheduled_for,
      status: "pending",
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "booking_id,channel,scheduled_for" },
  );
}

/** Create the booking via RPC, or synthesize a confirmation in preview mode. */
export async function createWidgetBooking(
  input: CreateBookingInput,
): Promise<{ ok: true; result: WidgetBookingResult } | { ok: false; error: string }> {
  const cfg = await getWidgetConfig(input.publicKey);
  const svc = cfg?.services.find((s) => s.id === input.serviceId);

  if (!supabaseEnvConfigured()) {
    if (!svc) return { ok: false, error: "Service not found." };
    const start = new Date(input.startsAt);
    const addonMinutes = svc.addons
      .filter((a) => (input.addonIds ?? []).includes(a.id))
      .reduce((sum, a) => sum + (a.duration_minutes ?? 0), 0);
    const end = new Date(start.getTime() + (svc.duration_minutes + addonMinutes) * 60000);
    return {
      ok: true,
      result: {
        booking_id: "preview-" + Math.round(start.getTime()),
        status: "confirmed",
        employee_id: input.employeeId ?? "preview",
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        price_cents: svc.price_cents,
        deposit_cents: svc.deposit_cents,
      },
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_widget_booking", {
    p_public_key: input.publicKey,
    p_service_id: input.serviceId,
    p_starts_at: input.startsAt,
    p_customer_name: input.customerName,
    p_customer_email: input.customerEmail,
    p_customer_phone: input.customerPhone ?? null,
    p_employee_id: input.employeeId ?? null,
    p_address: (input.address as never) ?? null,
    p_notes: input.notes ?? null,
    p_addon_ids: input.addonIds ?? [],
    p_quantity: input.quantity ?? null,
    p_recurrence: input.recurrence ?? "none",
  });
  if (error || !data) {
    return { ok: false, error: bookingErrorMessage(error?.message, "customer") };
  }
  const result = data as unknown as WidgetBookingResult;

  // Apply the coupon to the booking that was just created, before anything
  // else reads its price. The RPC re-validates the code and claims the
  // redemption atomically, so a coupon cannot be over-redeemed by two
  // simultaneous bookings.
  if (input.couponCode?.trim()) {
    const { data: couponResult } = await supabase.rpc("apply_coupon_to_booking", {
      p_public_key: input.publicKey,
      p_booking_id: result.booking_id,
      p_code: input.couponCode.trim(),
    });
    const applied = couponResult as unknown as
      | { ok: boolean; discount_cents?: number; total_cents?: number }
      | null;
    if (applied?.ok && typeof applied.total_cents === "number") {
      result.price_cents = applied.total_cents;
      result.discount_cents = applied.discount_cents ?? 0;
    }
  }

  const admin = createAdminClient();
  const { data: bookingRow } = await admin
    .from("bookings")
    .select("id, tenant_id, customer_id, starts_at, status")
    .eq("id", result.booking_id)
    .maybeSingle();

  // One tenant read, used by the recurrence, the reminders and the deposit
  // gate below. The recurrence used to run before this, with no access to the
  // notification settings, which is why repeat visits got no reminders.
  const { data: tenantRow } = bookingRow?.tenant_id
    ? await admin
        .from("tenants")
        .select("settings, stripe_charges_enabled, plan, timezone")
        .eq("id", bookingRow.tenant_id)
        .maybeSingle()
    : { data: null };
  const tenantSettings = (tenantRow?.settings ?? {}) as Record<string, unknown>;
  const notifications =
    (tenantSettings.notifications as Record<string, unknown> | undefined) ?? {};
  const plan = (tenantRow?.plan ?? "starter") as PlanTier;

  if (bookingRow?.tenant_id) {
    await scheduleBookingReminders({
      bookingId: result.booking_id,
      tenantId: bookingRow.tenant_id,
      customerId: bookingRow.customer_id,
      startsAt: result.starts_at,
      notifications,
      plan,
    }).catch((err) => {
      console.error("[booking] could not queue reminders", err);
    });

    if (result.status === "confirmed") {
      await createCalendarEventForBooking(result.booking_id).catch(() => {});
    }
  }

  // Reserve future occurrences on the calendar (blocks availability).
  if (input.recurrence && input.recurrence !== "none" && bookingRow?.tenant_id) {
    const outcome = await materializeRecurrence({
      firstBookingId: result.booking_id,
      rule: input.recurrence,
      recurrenceUntil: input.recurrenceUntil ?? null,
      timezone: tenantRow?.timezone ?? cfg?.tenant.timezone ?? "UTC",
      tenantId: bookingRow.tenant_id,
      customerId: bookingRow.customer_id,
      notifications,
      plan,
    }).catch((): RecurrenceOutcome => ({ reserved: 0, skipped: [], incomplete: true }));
    result.recurrence = outcome;
  }

  // The confirmation email is AWAITED and its outcome recorded (D01). It used
  // to be a bare `void ...catch(() => {})`, and the confirmation screen then
  // decided it had been "sent" from whether a sender was configured — so a
  // rejected or bounced send still told the customer to check their inbox.
  if (cfg && svc) {
    const start = new Date(result.starts_at);
    // Render the time in the BUSINESS's timezone so the email matches what the
    // customer picked and what the dashboard shows (not the server's UTC).
    const tz = tenantRow?.timezone || cfg.tenant.timezone || undefined;
    const sent = await sendBookingConfirmationForKey(input.publicKey, {
      businessName: cfg.tenant.name,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      serviceName: svc.name,
      whenText: `${start.toLocaleDateString("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" })} at ${start.toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" })}`,
      priceText: `$${(result.price_cents / 100).toFixed(2)}`,
      addressText: (input.address as { line1?: string } | null)?.line1 ?? undefined,
    }).catch((err) => {
      console.error("[booking] confirmation email threw", err);
      return { ok: false as const, error: "Delivery failed." };
    });
    result.confirmation_sent = sent.ok;
    if (!sent.ok) {
      console.error("[booking] confirmation email not delivered", sent.error);
    }
  }

  if (bookingRow?.tenant_id) {
    // Deposits (A12). Online capture is NOT implemented: there is no Stripe.js,
    // no Elements and no confirmation step in the booking flow. Creating a
    // PaymentIntent here produced a client secret nothing could ever confirm —
    // a stream of abandoned intents in the owner's Stripe dashboard, and a
    // "deposit intent created successfully" message that read like a payment.
    //
    // So nothing is charged, the booking says so plainly, and no intent is
    // created at all until capture is EXPLICITLY switched on.
    //
    // The gate is a dedicated flag, not the presence of a publishable key: that
    // key has to be set for anything else Stripe.js does, and using it here
    // would silently re-create unconfirmable intents the moment someone
    // configured Stripe properly. Only set STRIPE_DEPOSIT_CAPTURE_ENABLED=true
    // once the booking flow actually confirms the intent in the browser.
    const paymentsEnabled = tenantSettings.payments_enabled === true;
    const chargesEnabled = Boolean(tenantRow?.stripe_charges_enabled);
    const captureWired =
      process.env.STRIPE_DEPOSIT_CAPTURE_ENABLED === "true" &&
      Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim());
    if (paymentsEnabled && chargesEnabled && captureWired && result.deposit_cents > 0 && svc) {
      const paymentIntent = await createDepositIntent({
        amountCents: result.deposit_cents,
        tenantId: bookingRow.tenant_id,
        bookingId: result.booking_id,
        customerEmail: input.customerEmail,
      }).catch(() => ({ ok: false as const, error: "Stripe error." }));
      if (paymentIntent.ok) {
        result.deposit_client_secret = paymentIntent.clientSecret;
      }
    }
  }

  return { ok: true, result };
}
