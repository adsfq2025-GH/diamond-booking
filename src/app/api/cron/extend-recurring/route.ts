import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { supabaseEnvConfigured } from "@/lib/env";
import {
  computeOccurrences,
  DEFAULT_MAX_OCCURRENCES,
  type RecurrenceRule,
} from "@/lib/recurrence";

/**
 * Auto-renew open-ended recurring series. Runs on a schedule (Vercel Cron, see
 * vercel.json) and tops up any series whose reserved future occurrences have
 * dropped below RENEW_THRESHOLD — so recurring appointments continue forever
 * until the customer or owner cancels. Uses the service role (cron is
 * unauthenticated); cancelling a series makes its latest occurrence "cancelled"
 * which excludes it here, so cancellation stops renewal automatically.
 *
 * Protect by setting CRON_SECRET; Vercel Cron sends it as a Bearer token.
 */
const RENEW_THRESHOLD = 6;

export async function GET(req: NextRequest) {
  return run(req);
}
export async function POST(req: NextRequest) {
  return run(req);
}

async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  if (!supabaseEnvConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Service role not configured" }, { status: 503 });
  }

  const now = Date.now();

  // All occurrences of open-ended series.
  const { data: rows, error } = await admin
    .from("bookings")
    .select("recurrence_group_id, starts_at, status")
    .not("recurrence_group_id", "is", null)
    .is("recurrence_until", null)
    .limit(20000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Group → { futureActive count, latest start + status }.
  type G = { future: number; lastStart: number; lastStatus: string };
  const groups = new Map<string, G>();
  for (const r of rows ?? []) {
    const gid = r.recurrence_group_id as string;
    const t = new Date(r.starts_at).getTime();
    const g = groups.get(gid) ?? { future: 0, lastStart: -Infinity, lastStatus: "" };
    if (t >= now && (r.status === "pending" || r.status === "confirmed")) g.future += 1;
    if (t > g.lastStart) {
      g.lastStart = t;
      g.lastStatus = r.status;
    }
    groups.set(gid, g);
  }

  const toRenew = [...groups.entries()]
    .filter(([, g]) => g.lastStatus !== "cancelled" && g.future < RENEW_THRESHOLD)
    .map(([gid]) => gid)
    .slice(0, 500); // safety cap per run

  let renewed = 0;
  let inserted = 0;

  for (const gid of toRenew) {
    // Full latest row to clone.
    const { data: last } = await admin
      .from("bookings")
      .select("*")
      .eq("recurrence_group_id", gid)
      .order("starts_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!last) continue;
    const rule = last.recurrence_rule as RecurrenceRule | null;
    if (!rule || rule === "none") continue;

    const durationMs = new Date(last.ends_at).getTime() - new Date(last.starts_at).getTime();
    const status = last.status === "pending" ? "pending" : "confirmed";
    const candidates = computeOccurrences(new Date(last.starts_at), rule, null, DEFAULT_MAX_OCCURRENCES)
      .filter((d) => d.getTime() > now);

    let any = false;
    for (const start of candidates) {
      const ends = new Date(start.getTime() + durationMs);
      const { error: insErr } = await admin.from("bookings").insert({
        tenant_id: last.tenant_id,
        customer_id: last.customer_id,
        service_id: last.service_id,
        employee_id: last.employee_id,
        status,
        starts_at: start.toISOString(),
        ends_at: ends.toISOString(),
        price_cents: last.price_cents,
        deposit_cents: last.deposit_cents,
        address: last.address,
        customer_notes: last.customer_notes,
        source: last.source,
        recurrence_group_id: gid,
        recurrence_rule: rule,
        recurrence_until: null,
      });
      if (!insErr) {
        inserted += 1;
        any = true;
      } else if (!/exclu|overlap|conflict|23P01/i.test(insErr.message)) {
        break;
      }
    }
    if (any) renewed += 1;
  }

  return NextResponse.json({ ok: true, seriesRenewed: renewed, occurrencesReserved: inserted });
}
