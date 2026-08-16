"use server";

import {
  createWidgetBooking,
  getAvailableSlots,
  type CreateBookingInput,
} from "@/lib/widget/data";
import type { AvailableSlot } from "@/types/domain";

/** Fetch open slots for a service on a given date ('YYYY-MM-DD'). */
export async function fetchSlots(
  publicKey: string,
  serviceId: string,
  date: string,
): Promise<AvailableSlot[]> {
  return getAvailableSlots(publicKey, serviceId, date);
}

/** Submit a booking from the public widget. */
export async function submitBooking(input: CreateBookingInput) {
  // Minimal server-side validation (client validates too).
  if (!input.customerName?.trim() || !input.customerEmail?.trim()) {
    return { ok: false as const, error: "Name and email are required." };
  }
  return createWidgetBooking(input);
}
