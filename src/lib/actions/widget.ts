"use server";

import { headers } from "next/headers";
import { callerKey, rateLimit } from "@/lib/rate-limit";

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
  // Browsing dates is cheap but not free: each call runs the availability
  // scan. Generous enough that a real customer never notices.
  const limit = rateLimit(callerKey(await headers(), "slots"), 120, 60 * 1000);
  if (!limit.ok) return [];
  return getAvailableSlots(publicKey, serviceId, date, addonIds);
}

/**
 * Submit a booking from the public widget.
 *
 * This is an unauthenticated POST endpoint, so it validates server-side and
 * throttles by caller. See lib/rate-limit for what that throttle is and is
 * not — the database's exclusion constraint remains the real guarantee that
 * spam cannot double-book (A32).
 */
export async function submitBooking(input: CreateBookingInput) {
  // Minimal server-side validation (client validates too).
  if (!input.customerName?.trim() || !input.customerEmail?.trim()) {
    return { ok: false as const, error: "Name and email are required." };
  }

  const limit = rateLimit(callerKey(await headers(), "book"), 8, 60 * 60 * 1000);
  if (!limit.ok) {
    return {
      ok: false as const,
      error: "You've made several bookings just now. Please contact the business directly.",
    };
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

  const limit = rateLimit(callerKey(await headers(), "inquiry"), 5, 60 * 60 * 1000);
  if (!limit.ok) {
    return {
      ok: false as const,
      error: "We already have your request — the business will be in touch.",
    };
  }

  return createBookingInquiry(input);
}
