"use server";

import {
  createWidgetBooking,
  getAvailableSlots,
  type CreateBookingInput,
} from "@/lib/widget/data";
import type { AvailableSlot } from "@/types/domain";

/**
 * Fetch open slots for a service on a given date ('YYYY-MM-DD').
 *
 * addonIds matter: add-ons extend how long the job occupies the calendar, and
 * the booking enforces that longer span. Searching without them offered start
 * times that could not hold the configured job (A09).
 */
export async function fetchSlots(
  publicKey: string,
  serviceId: string,
  date: string,
  addonIds: string[] = [],
): Promise<AvailableSlot[]> {
  return getAvailableSlots(publicKey, serviceId, date, addonIds);
}

/** Submit a booking from the public widget. */
export async function submitBooking(input: CreateBookingInput) {
  // Minimal server-side validation (client validates too).
  if (!input.customerName?.trim() || !input.customerEmail?.trim()) {
    return { ok: false as const, error: "Name and email are required." };
  }
  return createWidgetBooking(input);
}
