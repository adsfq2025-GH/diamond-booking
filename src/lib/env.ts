/**
 * Single source of truth for "are real Supabase keys configured?".
 *
 * Importable from server code, client code and the middleware (it only
 * reads NEXT_PUBLIC_* env vars, which Next.js inlines into every bundle).
 *
 * Placeholder mode (false) drives the graceful degradations across the app:
 *  - auth forms show the "backend not configured" notice instead of submitting
 *  - the onboarding wizard renders with an in-memory mock tenant
 *  - the middleware skips Supabase session refresh entirely
 *
 * A real *local* stack (`npx supabase start`) still counts as configured:
 * its anon key is a JWT ("eyJ..."), unlike the human-written placeholder.
 */
export function supabaseEnvConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !key) return false;
  if (key.toLowerCase().includes("placeholder")) return false;
  if (
    (url.includes("127.0.0.1") || url.includes("localhost")) &&
    !key.startsWith("eyJ") &&
    !key.startsWith("sb_")
  ) {
    return false;
  }
  return true;
}
