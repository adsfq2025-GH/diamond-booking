import { NextResponse, type NextRequest } from "next/server";
import { secretsMatch } from "@/lib/signed-state";
import { createAdminClient } from "@/lib/supabase/server";
import { supabaseEnvConfigured } from "@/lib/env";
import type { UserRole } from "@/types/database";

/**
 * Super-admin bootstrap. Set the platform owner's credentials as env vars —
 * treated like an API key — and this endpoint provisions (or updates) the
 * single super-admin account from them:
 *
 *   SUPER_ADMIN_EMAIL=you@example.com
 *   SUPER_ADMIN_PASSWORD=a-strong-password
 *
 * The endpoint is DISABLED unless you also set a one-time token:
 *
 *   SUPER_ADMIN_SETUP_TOKEN=<long random string>
 *
 * Then call it once with that token and remove the variable again:
 *
 *   curl -X POST "{APP_URL}/api/admin/setup" -H "x-setup-token: <token>"
 *
 * Idempotent: change the env password and call it again to rotate. Sign in at
 * /login with those credentials to reach /admin.
 *
 * Why the token, given the endpoint only ever writes the password already in
 * the environment: without it, any anonymous caller could silently revert a
 * password you had rotated in the UI, and each call pages through up to 5,000
 * auth users — a free amplification primitive against the Auth API.
 */

type SetupResult = { status: number; body: Record<string, unknown> };

async function ensureSuperAdmin(): Promise<SetupResult> {
  const email = process.env.SUPER_ADMIN_EMAIL?.trim();
  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (!email || !password) {
    return {
      status: 400,
      body: { error: "Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD in your environment first." },
    };
  }
  if (!supabaseEnvConfigured()) {
    return { status: 400, body: { error: "Supabase is not configured." } };
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { status: 400, body: { error: "SUPABASE_SERVICE_ROLE_KEY is not set." } };
  }

  const meta = {
    email_confirm: true,
    app_metadata: { role: "super_admin" satisfies UserRole },
    user_metadata: { full_name: "Platform Admin" },
  };

  // Create the auth user, or update it in place if the email already exists.
  let userId: string | null = null;
  let created = false;
  const { data: createdUser, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    ...meta,
  });
  if (createdUser?.user) {
    userId = createdUser.user.id;
    created = true;
  } else {
    const existing = await findUserByEmail(admin, email);
    if (!existing) {
      return { status: 500, body: { error: createErr?.message ?? "Could not create the admin user." } };
    }
    userId = existing.id;
    const { error: updateErr } = await admin.auth.admin.updateUserById(userId, {
      password,
      ...meta,
    });
    if (updateErr) return { status: 500, body: { error: updateErr.message } };
  }

  // Platform admin has no tenant.
  const { error: profileErr } = await admin.from("profiles").upsert({
    id: userId,
    tenant_id: null,
    role: "super_admin",
    full_name: "Platform Admin",
    email,
  });
  if (profileErr) return { status: 500, body: { error: profileErr.message } };

  return {
    status: 200,
    body: {
      ok: true,
      email,
      action: created ? "created" : "updated",
      message: `Super admin ready. Sign in at /login with ${email} to reach /admin.`,
    },
  };
}

/** Page through auth users to find one by email (no direct get-by-email API). */
async function findUserByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
) {
  const target = email.toLowerCase();
  for (let page = 1; page <= 25; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data) break;
    const match = data.users.find((u) => u.email?.toLowerCase() === target);
    if (match) return match;
    if (data.users.length < 200) break;
  }
  return null;
}

/**
 * Authorize the caller, then run the bootstrap. Unauthorized callers get a
 * flat 404 so the route is not discoverable, and every attempt is logged.
 */
async function handle(req: NextRequest): Promise<NextResponse> {
  const expected = process.env.SUPER_ADMIN_SETUP_TOKEN;
  const presented =
    req.headers.get("x-setup-token") ?? req.nextUrl.searchParams.get("token");

  if (!expected || !secretsMatch(presented, expected)) {
    console.warn(
      "[admin setup] rejected call",
      expected ? "(bad or missing token)" : "(SUPER_ADMIN_SETUP_TOKEN not set — route disabled)",
    );
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const r = await ensureSuperAdmin();
  console.warn("[admin setup] authorized call completed with status", r.status);
  return NextResponse.json(r.body, { status: r.status });
}

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}
