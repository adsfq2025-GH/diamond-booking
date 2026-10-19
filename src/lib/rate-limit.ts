import "server-only";

/**
 * Best-effort in-process rate limiting (A32, A40).
 *
 * The public booking server actions (fetchSlots, submitBooking) and the
 * geocode proxy are reachable by anyone as plain POSTs/GETs, with no auth, no
 * captcha and no throttle: anyone holding a widget public key — which is
 * embedded in every page the widget appears on — could fill a business's
 * calendar with fake bookings, each of which also sent a confirmation email
 * and queued reminders.
 *
 * IMPORTANT, and deliberately stated rather than implied: this counter lives
 * in the process's memory. On a serverless platform each instance has its own,
 * so the effective limit is (limit x instances) and a cold start resets it.
 * It raises the cost of casual abuse; it is not a security boundary. Durable
 * protection needs a shared store (Upstash/Redis) or the platform's own WAF —
 * tracked as follow-up work rather than quietly assumed here.
 *
 * The database-side guards are the ones that actually hold: create_booking_inquiry
 * caps enquiries per email per tenant, and the booking RPC's exclusion
 * constraint means spam cannot double-book.
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
 * Consume one token for `key`. Returns ok:false once `limit` is exceeded
 * within `windowMs`.
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
 * A caller identity for rate limiting, from the proxy headers. Spoofable by
 * design — see the caveat above — so it is only ever used for throttling,
 * never for authorization.
 */
export function callerKey(headers: Headers, prefix: string): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const real = headers.get("x-real-ip")?.trim();
  return `${prefix}:${forwarded || real || "unknown"}`;
}
