/**
 * Public booking-widget data access. Powers /book/[public_key] and the
 * embed. Anonymous — no auth. Uses the anon Supabase client to call the
 * SECURITY DEFINER RPCs (get_widget_config, get_available_slots,
 * create_widget_booking). In placeholder mode it returns a demo config and
 * generates slots locally so the flow is fully testable without a backend.
 */
import "server-only";
import { supabaseEnvConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { getMockServices } from "@/lib/dashboard/mock-data";
import { MOCK } from "@/lib/dashboard/mock";
import { sendBookingConfirmationForKey } from "@/lib/integrations/email";
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

function mockConfig(): WidgetConfigPayload {
  return {
    tenant: {
      slug: "clean-sweep",
      name: MOCK.tenantName,
      industry: "cleaning",
      timezone: "America/New_York",
      branding: { primary_color: "#2e86c1" },
    },
    theme: { primary_color: "#2e86c1", radius: "12px", layout: "vertical" },
    custom_fields: [
      { key: "pets", label: "Any pets we should know about?", type: "text", required: false },
    ],
    business_hours: MOCK_HOURS,
    services: getMockServices().map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      category: s.category,
      duration_minutes: s.durationMinutes,
      price_cents: s.priceCents,
      deposit_cents: s.depositCents,
      addons: s.addons.map((a) => ({
        id: a.id,
        name: a.name,
        price_cents: a.priceCents,
        duration_minutes: a.durationMinutes,
      })),
    })),
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
 * Available slots for a service on a date ('YYYY-MM-DD'). In preview mode we
 * synthesize slots from the mock business hours + service duration.
 */
export async function getAvailableSlots(
  publicKey: string,
  serviceId: string,
  date: string,
): Promise<AvailableSlot[]> {
  if (!supabaseEnvConfigured()) {
    return mockSlots(serviceId, date);
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_available_slots", {
    p_public_key: publicKey,
    p_service_id: serviceId,
    p_date: date,
  });
  if (error || !data) return [];
  return data as AvailableSlot[];
}

function mockSlots(serviceId: string, date: string): AvailableSlot[] {
  const svc = mockConfig().services.find((s) => s.id === serviceId);
  const duration = svc?.duration_minutes ?? 60;
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

export interface CreateBookingInput {
  publicKey: string;
  serviceId: string;
  startsAt: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  employeeId?: string | null;
  address?: Record<string, unknown> | null;
  notes?: string | null;
  addonIds?: string[];
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
    const end = new Date(start.getTime() + svc.duration_minutes * 60000);
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
  });
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Could not create booking." };
  }
  const result = data as unknown as WidgetBookingResult;

  // Fire-and-forget confirmation email (tenant SMTP → platform Resend → no-op).
  if (cfg && svc) {
    const start = new Date(result.starts_at);
    void sendBookingConfirmationForKey(input.publicKey, {
      businessName: cfg.tenant.name,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      serviceName: svc.name,
      whenText: `${start.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} at ${start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`,
      priceText: `$${(result.price_cents / 100).toFixed(2)}`,
      addressText: (input.address as { line1?: string } | null)?.line1 ?? undefined,
    }).catch(() => {});
  }

  return { ok: true, result };
}
