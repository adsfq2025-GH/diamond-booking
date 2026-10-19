"use server";

import {
  createBookingInquiry,
  createWidgetBooking,
  getAvailableSlots,
  quoteBooking,
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

/** Price a service + add-ons + coupon code before the customer commits. */
export async function fetchQuote(input: {
  publicKey: string;
  serviceId: string;
  addonIds?: string[];
  couponCode?: string | null;
}) {
  return quoteBooking(input);
}

/**
 * Record a request when the customer could not find a usable slot. This is an
 * enquiry, not a booking: nothing is reserved and no capacity is consumed.
 */
export async function submitInquiry(input: {
  publicKey: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  serviceId?: string | null;
  requestedDate?: string | null;
  notes?: string | null;
}) {
  if (!input.customerName?.trim() || !input.customerEmail?.trim()) {
    return { ok: false as const, error: "Name and email are required." };
  }
  return createBookingInquiry(input);
}
