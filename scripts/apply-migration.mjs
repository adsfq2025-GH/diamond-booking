#!/usr/bin/env node
/**
 * Apply a migration to the hosted Supabase project over the Management API.
 *
 * Why this exists: `supabase db push` needs the CLI linked AND the database
 * password. The Management API needs only a personal access token, and it runs
 * SQL directly — which is all a migration needs. No psql, no Docker, no DB
 * password.
 *
 * Setup (once). The token must belong to the Supabase account that owns the
 * project in NEXT_PUBLIC_SUPABASE_URL:
 *
 *   1. https://supabase.com/dashboard/account/tokens -> "Generate new token"
 *   2. Add it to .env.local (which is gitignored — checked):
 *        SUPABASE_ACCESS_TOKEN=sbp_...
 *
 * Usage:
 *   node scripts/apply-migration.mjs supabase/migrations/0013_launch_gates.sql
 *   node scripts/apply-migration.mjs <file> --dry-run   # parse check only
 *
 * The whole file is sent inside ONE transaction, so if any statement fails the
 * entire migration rolls back and the database is left exactly as it was.
 * Postgres DDL is transactional; this is what makes applying straight to
 * production acceptable without a staging rehearsal.
 *
 * The token is read from the environment and never printed.
 */

import fs from "node:fs";
import path from "node:path";

const MANAGEMENT_API = "https://api.supabase.com";

function loadEnvLocal() {
  const file = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

const [, , sqlPath, ...flags] = process.argv;
if (!sqlPath) fail("Usage: node scripts/apply-migration.mjs <path-to.sql> [--dry-run]");
if (!fs.existsSync(sqlPath)) fail(`No such file: ${sqlPath}`);

const env = { ...loadEnvLocal(), ...process.env };
const token = env.SUPABASE_ACCESS_TOKEN;
const url = env.NEXT_PUBLIC_SUPABASE_URL;

if (!url) fail("NEXT_PUBLIC_SUPABASE_URL is not set, so the target project is unknown.");
if (!token) {
  fail(
    "SUPABASE_ACCESS_TOKEN is not set.\n" +
      "  Create one at https://supabase.com/dashboard/account/tokens and add it to\n" +
      "  .env.local as SUPABASE_ACCESS_TOKEN=sbp_...  (that file is gitignored).\n" +
      "  It must belong to the account that owns the project below.",
  );
}

const ref = new URL(url).hostname.split(".")[0];
const sql = fs.readFileSync(sqlPath, "utf8");
const dryRun = flags.includes("--dry-run");

// Wrap in one transaction unless the file already does it itself.
const alreadyWrapped = /^\s*begin\s*;/im.test(sql) && /commit\s*;\s*$/im.test(sql);
const body = alreadyWrapped ? sql : `begin;\n${sql}\ncommit;`;

console.log(`  file    ${sqlPath} (${sql.split(/\r?\n/).length} lines)`);
console.log(`  project ${ref}`);
console.log(`  mode    ${dryRun ? "DRY RUN — parse only, nothing applied" : "APPLY (single transaction)"}`);

// A dry run parses every statement on the server and then throws the work
// away, so it reports syntax and name errors without changing anything.
const payload = dryRun ? `begin;\n${sql}\nrollback;` : body;

const res = await fetch(`${MANAGEMENT_API}/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query: payload }),
});

const text = await res.text();
let parsed = null;
try {
  parsed = JSON.parse(text);
} catch {
  /* not JSON; show it raw below */
}

if (!res.ok) {
  const message = parsed?.message ?? parsed?.error ?? text.slice(0, 4000);
  console.error(`\n  HTTP ${res.status} — nothing was applied (the transaction rolled back).\n`);
  console.error(`  ${message}\n`);
  if (res.status === 401 || res.status === 403) {
    console.error(
      `  That token cannot reach project ${ref}. Make sure it was created on the\n` +
        `  Supabase account that owns it — the CLI here is logged into accounts that\n` +
        `  do not have this project.\n`,
    );
  }
  process.exit(1);
}

console.log(
  dryRun
    ? "\n  Parsed cleanly. Nothing was applied — re-run without --dry-run to apply.\n"
    : "\n  Applied and committed.\n",
);
if (parsed && Array.isArray(parsed) && parsed.length) {
  console.log(`  server returned ${parsed.length} row(s)`);
}
