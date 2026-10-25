import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { supabaseEnvConfigured } from "@/lib/env";
import { secretsMatch } from "@/lib/signed-state";
import {
  computeOccurrences,
  DEFAULT_MAX_OCCURRENCES,
  type RecurrenceRule,
} from "@/lib/recurrence";
import { materializeSeries } from "@/lib/recurrence-series";

/**
 * Auto-renew open-ended recurring series. Runs on a schedule (Vercel Cron, see
 * vercel.json) and tops up any series whose reserved future occurrences have
 * dropped below RENEW_THRESHOLD — so recurring appointments continue forever
 * until the customer or owner cancels. Uses the service role (cron is
 * unauthenticated); cancelling a series makes its latest occurrence "cancelled"
 * which excludes it here, so cancellation stops renewal automatically.
 *
 * CRON_SECRET is REQUIRED: without it this route returns 401 to everyone.
 * Vercel Cron sends it as a Bearer token.
 */
const RENEW_THRESHOLD = 6;

export async function GET(req: NextRequest) {
  return run(req);
}
export async function POST(req: NextRequest) {
  return run(req);
}

async function run(req: NextRequest) {
  // Fail CLOSED. This endpoint performs service-role writes across tenants;
  // the previous `if (secret)` guard meant an unset CRON_SECRET left it open
  // to anonymous callers.
  const secret = process.env.CRON_SECRET;
  if (!secret || !secretsMatch(req.headers.get("authorization"), `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  // "Active" means the same thing here as everywhere else (B01): a rescheduled
  // appointment still occupies its slot, so a series full of moved visits must
  // not look empty and get topped up again.
  const ACTIVE = new Set(["pending", "confirmed", "rescheduled"]);
  for (const r of rows ?? []) {
    const gid = r.recurrence_group_id as string;
    const t = new Date(r.starts_at).getTime();
    const g = groups.get(gid) ?? { future: 0, lastStart: -Infinity, lastStatus: "" };
    if (t >= now && ACTIVE.has(r.status)) g.future += 1;
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
  let skipped = 0;
  const incomplete: string[] = [];

  for (const gid of toRenew) {
    // Latest occurrence in the series: the template every new visit copies,
    // and the anchor create_series_occurrence validates against.
    const { data: last } = await admin
      .from("bookings")
      .select("id, tenant_id, starts_at, recurrence_rule, tenants(timezone)")
      .eq("recurrence_group_id", gid)
      .order("starts_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!last) continue;
    const rule = last.recurrence_rule as RecurrenceRule | null;
    if (!rule || rule === "none") continue;

    const tenant = Array.isArray(last.tenants) ? last.tenants[0] : last.tenants;
    const candidates = computeOccurrences(
      new Date(last.starts_at),
      rule,
      null,
      DEFAULT_MAX_OCCURRENCES,
      tenant?.timezone ?? "UTC",
    ).filter((d) => d.getTime() > now);

    // One validated creation path for every visit (B04). The copied INSERTs
    // this loop used to do ran none of the hours, eligibility, time-off or
    // buffer checks, carried no add-ons, and reported nothing when they
    // failed — so a series could quietly extend onto closed days.
    const result = await materializeSeries(admin, last.id, candidates);
    inserted += result.reserved.length;
    skipped += result.skipped.length;
    if (result.reserved.length > 0) renewed += 1;
    if (result.incomplete) incomplete.push(gid);
  }

  // Skipped dates and partial failures are reported, not swallowed: this run's
  // own output is what an operator has to work from.
  if (incomplete.length > 0) {
    console.error("[extend-recurring] series stopped early", incomplete);
  }

  return NextResponse.json({
    ok: incomplete.length === 0,
    seriesConsidered: toRenew.length,
    seriesRenewed: renewed,
    occurrencesReserved: inserted,
    occurrencesSkipped: skipped,
    seriesIncomplete: incomplete.length,
  });
}
