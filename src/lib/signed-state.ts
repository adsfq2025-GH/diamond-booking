import "server-only";
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

/**
 * HMAC-signed, expiring payloads for OAuth `state` round-trips.
 *
 * The Google Calendar callback used to base64-decode `state` and trust the
 * profileId / tenantId inside it, with no signature and no session check —
 * so anyone could mint a state naming any tenant, complete OAuth with their
 * own Google account, and have those tokens attached to that tenant. Signing
 * closes the forgery path; the callback additionally re-checks the signed
 * subject against the live session.
 *
 * Key: OAUTH_STATE_SECRET when set, otherwise the service-role key (already
 * required for the flow to persist anything, and never leaves the server).
 */

const MAX_AGE_MS = 10 * 60 * 1000; // an OAuth consent screen does not take longer

function key(): string {
  const secret =
    process.env.OAUTH_STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new Error(
      "signed-state: set OAUTH_STATE_SECRET (or SUPABASE_SERVICE_ROLE_KEY) to sign OAuth state",
    );
  }
  return secret;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function sign(body: string): string {
  return b64url(createHmac("sha256", key()).update(body).digest());
}

/** Sign an arbitrary JSON payload for a one-trip round into a third party. */
export function signState(payload: Record<string, unknown>): string {
  const body = b64url(
    Buffer.from(
      JSON.stringify({ ...payload, iat: Date.now(), nonce: b64url(randomBytes(9)) }),
    ),
  );
  return `${body}.${sign(body)}`;
}

/**
 * Verify and decode a state produced by signState. Returns null for anything
 * unparseable, tampered with, or older than MAX_AGE_MS — callers treat null as
 * "ignore this callback", never as "proceed with defaults".
 */
export function verifyState<T extends Record<string, unknown>>(
  state: string | null | undefined,
): (T & { iat: number }) | null {
  if (!state) return null;
  const dot = state.lastIndexOf(".");
  if (dot <= 0) return null;

  const body = state.slice(0, dot);
  const given = state.slice(dot + 1);

  let a: Buffer;
  let b: Buffer;
  try {
    a = Buffer.from(given, "base64url");
    b = Buffer.from(sign(body), "base64url");
  } catch {
    return null;
  }
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & {
      iat?: number;
    };
    if (typeof payload.iat !== "number") return null;
    if (Date.now() - payload.iat > MAX_AGE_MS) return null;
    return payload as T & { iat: number };
  } catch {
    return null;
  }
}

/**
 * Constant-time string comparison for shared secrets (cron bearer tokens,
 * one-time setup tokens) so a wrong guess leaks nothing through timing.
 */
export function secretsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
