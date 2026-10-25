import "server-only";

import { isSlotUnavailable } from "@/lib/booking-errors";

/**
 * Reserving the visits of a recurring series.
 *
 * There were three copies of this: the first materialization in the public
 * booking flow, the owner's "extend series" action and the renewal cron. All
 * three inserted copied booking rows directly, which meant none of them ran
 * the business-hours, staff-eligibility, time-off or buffer checks, none of
 * them carried the first visit's add-ons, and a failure in the two background
 * ones was invisible (B04).
 *
 * They now share this one function, over the validated
 * create_series_occurrence() RPC, which also reports WHY a date was skipped
 * instead of dropping it.
 *
 * Deliberately not a server action: it takes a Supabase client, so it must not
 * be reachable from a browser.
 */

/** One occurrence, as create_series_occurrence reports it. */
interface OccurrenceResult {
  ok?: boolean;
  booking_id?: string;
  starts_at?: string;
  reason?: string;
}

/**
 * The subset of a Supabase client this needs — user-scoped or service role.
 *
 * `rpc` is typed loosely on purpose: the generated client narrows the function
 * name to a union of known RPCs, which makes a client-agnostic helper
 * impossible to type structurally. The call itself is checked below.
 */
export interface RpcCapableClient {
  rpc: unknown;
}

type RpcCall = (
  fn: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

export interface SeriesMaterializationResult {
  /** Booking ids actually reserved. */
  reserved: string[];
  /** Dates that could not be reserved, with the reason, for the customer. */
  skipped: Array<{ startsAt: string; reason: string }>;
  /** True when the run stopped early on an unexpected error. */
  incomplete: boolean;
}

export async function materializeSeries(
  client: RpcCapableClient,
  sourceBookingId: string,
  occurrences: Date[],
): Promise<SeriesMaterializationResult> {
  const out: SeriesMaterializationResult = {
    reserved: [],
    skipped: [],
    incomplete: false,
  };

  const rpc = client.rpc as RpcCall;

  for (const start of occurrences) {
    const { data, error } = await rpc("create_series_occurrence", {
      p_source_booking_id: sourceBookingId,
      p_starts_at: start.toISOString(),
    });

    if (error) {
      if (isSlotUnavailable(error.message)) {
        out.skipped.push({ startsAt: start.toISOString(), reason: error.message });
        continue;
      }
      // Something unexpected: stop, and say the series is incomplete rather
      // than letting the caller claim a standing appointment it does not have.
      console.error("[recurrence] stopped early", error);
      out.incomplete = true;
      break;
    }

    const occurrence = (data ?? null) as OccurrenceResult | null;
    if (occurrence?.ok && occurrence.booking_id) {
      out.reserved.push(occurrence.booking_id);
      continue;
    }

    // "This date does not work" and "something is broken" are different
    // answers, and only the first one should be reported to a customer as a
    // skipped date. A systemic refusal — a suspended tenant, a missing
    // service — stops the run instead of making every remaining date look
    // individually unavailable.
    const reason = occurrence?.reason ?? "unavailable";
    if (isSlotUnavailable(reason)) {
      out.skipped.push({ startsAt: start.toISOString(), reason });
      continue;
    }

    console.error("[recurrence] stopped early", reason);
    out.incomplete = true;
    break;
  }

  return out;
}
