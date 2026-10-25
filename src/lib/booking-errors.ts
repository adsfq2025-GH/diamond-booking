/**
 * One place to turn a scheduling error code into something a person can act on.
 *
 * assert_booking_slot() raises a distinct code for each reason a time is
 * unusable, and three different surfaces need to explain them: the public
 * booking widget, the owner's calendar and the recurring-series report. They
 * used to have separate, partial lists — the calendar in particular surfaced a
 * raw Postgres exclusion-violation dump — so a customer and an owner could be
 * told different things about the same refusal.
 */

export type BookingAudience = "customer" | "owner";

const SHARED: Record<string, { customer: string; owner: string }> = {
  slot_taken: {
    customer: "That time was just booked by someone else. Please pick another time.",
    owner:
      "That time clashes with another appointment for this team member, or with the gap one of them needs either side. Pick a different time.",
  },
  no_qualified_staff: {
    customer:
      "Nobody is scheduled to provide that service at that time. Please pick another time.",
    owner: "No active team member is qualified and scheduled for that service at that time.",
  },
  employee_not_qualified: {
    customer: "That service is not available at that time. Please pick another time.",
    owner:
      "This team member is not assigned to that service. Assign them to it, or move the job to someone who is.",
  },
  employee_not_available: {
    customer: "That service is not available at that time. Please pick another time.",
    owner: "That team member is no longer active on this business.",
  },
  outside_working_hours: {
    customer: "That time is outside the team's working hours. Please pick another time.",
    owner: "That time falls outside this team member's working hours for that day.",
  },
  employee_on_leave: {
    customer: "That time is not available. Please pick another time.",
    owner: "This team member has approved time off covering that time.",
  },
  outside_business_hours: {
    customer: "That appointment would run past closing time. Please pick an earlier start.",
    owner: "That time falls outside the business's opening hours for that day, or runs past closing.",
  },
  crosses_midnight: {
    customer:
      "That appointment is too long to fit in one day. Please contact the business directly.",
    owner: "That appointment would run past midnight, which opening hours cannot express.",
  },
  slot_in_past: {
    customer: "That time has already passed. Please pick another time.",
    owner: "That time is in the past. Appointments can only be moved to a future time.",
  },
  invalid_range: {
    customer: "That time could not be read. Please pick another time.",
    owner: "That appointment would end before it starts.",
  },
  service_not_found: {
    customer: "That service is no longer available.",
    owner: "That service is no longer active on this business.",
  },
  widget_not_found: {
    customer: "This booking page is not currently accepting appointments.",
    owner: "This business's booking page is not active.",
  },
  tenant_not_found: {
    customer: "This booking page is not currently accepting appointments.",
    owner: "That business could not be found.",
  },
  tenant_suspended: {
    customer: "This booking page is not currently accepting appointments.",
    owner: "This business is suspended, so no new appointments can be reserved.",
  },
  booking_not_found: {
    customer: "That appointment could not be found.",
    owner: "That appointment could not be found.",
  },
  booking_not_active: {
    customer: "That appointment can no longer be changed.",
    owner: "Only an active appointment can be moved. Reopen it first.",
  },
  recurrence_not_enabled: {
    customer:
      "Repeat appointments are not available for this business. Please book a single visit.",
    owner: "Repeat bookings are switched off for this business. Enable them in settings first.",
  },
  quantity_required: {
    customer:
      "This service is priced per unit, so it needs a quantity before it can be booked. Please contact the business for a quote.",
    owner:
      "This service is priced by the hour, square foot or a custom unit, so a quantity is required before it can be priced.",
  },
  cancellation_window_closed: {
    customer:
      "This appointment is too close to its start time to cancel online. Please contact the business directly.",
    owner: "That cancellation falls inside the business's online cancellation window.",
  },
  not_authorized: {
    customer: "You do not have permission to do that.",
    owner: "You do not have permission to change that appointment.",
  },
  email_required: { customer: "Please enter your email address.", owner: "An email address is required." },
  name_required: { customer: "Please enter your name.", owner: "A name is required." },
};

const FALLBACK: Record<BookingAudience, string> = {
  customer: "Could not create the booking. Please try again.",
  owner: "Could not save that change. Please try again.",
};

/**
 * Map a raw Postgres/PostgREST message to a sentence for `audience`.
 * Unrecognised messages fall back rather than leaking internals — except an
 * exclusion-constraint violation, which always means the slot was taken.
 */
export function bookingErrorMessage(
  raw: string | null | undefined,
  audience: BookingAudience = "customer",
): string {
  const code = (raw ?? "").toLowerCase();
  for (const [key, messages] of Object.entries(SHARED)) {
    if (code.includes(key)) return messages[audience];
  }
  if (/exclu|overlap|23p01/.test(code)) return SHARED.slot_taken[audience];
  return FALLBACK[audience];
}

/** Whether a failure means "this time does not work", as opposed to a fault. */
export function isSlotUnavailable(raw: string | null | undefined): boolean {
  const code = (raw ?? "").toLowerCase();
  return (
    /exclu|overlap|23p01/.test(code) ||
    [
      "slot_taken",
      "no_qualified_staff",
      "employee_not_qualified",
      "employee_not_available",
      "outside_working_hours",
      "employee_on_leave",
      "outside_business_hours",
      "crosses_midnight",
      "slot_in_past",
    ].some((key) => code.includes(key))
  );
}
