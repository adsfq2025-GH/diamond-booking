import "server-only";

import { createAdminClient } from "@/lib/supabase/server";

/**
 * Rate limiting for the public, unauthenticated surfaces: the booking server
 * actions (fetchSlots, submitBooking), the enquiry form and the geocode proxy.
 * Anyone holding a widget public key — which is embedded in every page the
 * widget appears on — can call these, and each booking also sends a
 * confirmation email and queues reminders (A32, A40).
 *
 * There are two layers, and the difference matters:
 *
 *  - `rateLimit` is an in-process counter. On a serverless platform each
 *    instance has its own, so the effective limit is (limit x instances) and a
 *    cold start resets it. It raises the cost of casual abuse and nothing more.
 *
 *  - `rateLimitDurable` counts in the database, shared by every instance, which
 *    is what the review asked for before wider exposure: "replace in-process
 *    public rate limiting with a durable boundary". Use it for the write paths
 *    (bookings, enquiries); the in-process one is fine for cheap reads.
 *
 * Neither is an authorization boundary — the caller key comes from proxy
 * headers and is spoofable. The guards that actually hold are in the database:
 * create_booking_inquiry caps enquiries per email per tenant, and the booking
 * RPC's exclusion constraint means spam cannot double-book.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Stop the map growing without bound on a long-lived instance. */
function sweep(now: number) {
  if (buckets.size < 5000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the window resets; 0 when allowed. */
  retryAfter: number;
}

/**
 * Consume one token for `key` in this process. Returns ok:false once `limit`
 * is exceeded within `windowMs`.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfter: 0 };
}

/**
 * Consume one token for `key` against the shared database counter, so the
 * limit holds across every serverless instance and survives cold starts.
 *
 * The in-process counter is consulted first: it is free, and a caller already
 * over the limit on this instance never needs a round trip. If the database
 * cannot be reached the in-process result stands — a throttle that fails open
 * is the lesser evil here, because failing closed would take public booking
 * down with it. That trade-off is deliberate and worth knowing about.
 */
export async function rateLimitDurable(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const local = rateLimit(key, limit, windowMs);
  if (!local.ok) return local;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("consume_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: Math.max(1, Math.round(windowMs / 1000)),
    });
    if (error) {
      console.error("[rate-limit] durable counter unavailable", error);
      return local;
    }
    const result = data as unknown as { allowed?: boolean; retry_after?: number } | null;
    if (result?.allowed === false) {
      return { ok: false, retryAfter: Math.max(1, Number(result.retry_after ?? 60)) };
    }
    return { ok: true, retryAfter: 0 };
  } catch (err) {
    console.error("[rate-limit] durable counter threw", err);
    return local;
  }
}

/**
 * A caller identity for rate limiting, from the proxy headers. Spoofable by
 * design — see the caveat above — so it is only ever used for throttling,
 * never for authorization.
 */
export function callerKey(headers: Headers, prefix: string): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const real = headers.get("x-real-ip")?.trim();
  return `${prefix}:${forwarded || real || "unknown"}`;
}
