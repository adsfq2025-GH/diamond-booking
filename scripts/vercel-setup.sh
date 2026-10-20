#!/usr/bin/env bash
# ============================================================
# Diamond Booking — push production env vars to Vercel, then deploy.
#
#   ./scripts/vercel-setup.sh                      (asks for the URL)
#   ./scripts/vercel-setup.sh https://your-domain.com   (or pass it)
#
# Reads values from .env.local and pipes them to `vercel env add` on stdin.
# Values are never printed, never echoed, and never put on a command line
# (where they would land in your shell history and in `ps` output).
#
# Run `npx vercel login` and `npx vercel link` first — see the checks below.
# Safe to re-run: each variable is removed and re-added, so it converges.
# ============================================================
set -euo pipefail

APP_URL="${1:-}"

die() { printf '\nERROR: %s\n' "$1" >&2; exit 1; }

# ---- preconditions -----------------------------------------------------
# NEXT_PUBLIC_APP_URL is checked after linking, where the CLI can list the
# project's real domains instead of making you remember one.

[ -f .env.local ] || die ".env.local not found. Run this from the repo root."

command -v npx >/dev/null || die "npx not found; install Node.js."

if ! npx --no-install vercel whoami >/dev/null 2>&1; then
  die "The Vercel CLI is not logged in. Run:

    npx vercel login

then re-run this script. I cannot do this step for you: it is an
authentication flow tied to your account."
fi

echo "Logged in to Vercel as: $(npx --no-install vercel whoami 2>/dev/null | tail -1)"

# A project.json written by an IDE often has only projectName, which is not
# enough for the CLI. projectId is what actually identifies the project.
if ! grep -q '"projectId"' .vercel/project.json 2>/dev/null; then
  echo
  echo "This folder is not fully linked to a Vercel project."
  echo "Running 'vercel link' — pick the EXISTING project that serves your"
  echo "production site. Do not create a new one, or you will deploy to a"
  echo "fresh URL and your real site will not change."
  echo
  npx --no-install vercel link
fi

grep -q '"projectId"' .vercel/project.json || die "Linking did not complete."

# ---- which URL is production? -----------------------------------------
# This value is baked into embed snippets and OAuth redirects, so a wrong
# one breaks the booking widget and Google Calendar connect — silently, and
# only for customers. Worth getting right rather than guessing.
validate_url() {
  case "$1" in
    ""|*" "*)                                  return 1 ;;
    http://localhost*|https://localhost*|*127.0.0.1*) return 1 ;;
    https://*.*)                               return 0 ;;
    *)                                         return 1 ;;
  esac
}

if ! validate_url "${APP_URL:-}"; then
  [ -z "${APP_URL:-}" ] || echo "'$APP_URL' is not a usable production URL."
  echo
  echo "Domains Vercel has for this project:"
  # Both are listed: an alias is what a custom domain resolves to, and a
  # project can have either, neither, or several.
  npx --no-install vercel alias ls 2>/dev/null | grep -oE '[a-z0-9.-]+\.[a-z]{2,}' | sort -u | sed 's/^/  /' || true
  npx --no-install vercel domains ls 2>/dev/null | grep -oE '[a-z0-9.-]+\.[a-z]{2,}' | sort -u | sed 's/^/  /' || true
  echo
  echo "Pick the one customers actually visit. If the list is empty or wrong,"
  echo "copy it from your Vercel dashboard (Project -> Domains)."
  echo
  while ! validate_url "${APP_URL:-}"; do
    read -r -p "Production URL (https://...): " APP_URL
    validate_url "$APP_URL" || echo "  Needs to be https:// with a real domain, not localhost."
  done
fi

echo "Using NEXT_PUBLIC_APP_URL=$APP_URL"

# ---- what goes up ------------------------------------------------------
# Copied verbatim from .env.local.
COPY_VARS=(
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY
  CRON_SECRET
  STRIPE_SECRET_KEY
  STRIPE_WEBHOOK_SECRET
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  STRIPE_PRICE_STARTER
  STRIPE_PRICE_PROFESSIONAL
  STRIPE_PRICE_ELITE
  STRIPE_PRICE_STARTER_YEARLY
  STRIPE_PRICE_PROFESSIONAL_YEARLY
  STRIPE_PRICE_ELITE_YEARLY
  RESEND_API_KEY
  RESEND_FROM_EMAIL
  GOOGLE_CLIENT_ID
  GOOGLE_CLIENT_SECRET
)

# Read one value out of .env.local without printing it. Handles 'KEY=value',
# strips surrounding quotes, keeps '=' inside the value intact.
value_of() {
  sed -n "s/^$1=//p" .env.local | head -1 | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

push() { # name, value-on-stdin
  local name="$1"
  npx --no-install vercel env rm "$name" production --yes >/dev/null 2>&1 || true
  if npx --no-install vercel env add "$name" production >/dev/null 2>&1; then
    echo "  set       $name"
  else
    echo "  FAILED    $name"
    return 1
  fi
}

echo
echo "Pushing production environment variables..."
missing=()
failed=()
for v in "${COPY_VARS[@]}"; do
  val="$(value_of "$v")"
  if [ -z "$val" ]; then
    missing+=("$v")
    echo "  missing   $v  (not in .env.local — skipped)"
    continue
  fi
  printf '%s' "$val" | push "$v" || failed+=("$v")
done

# Set by hand, not copied.
printf '%s' "$APP_URL"   | push NEXT_PUBLIC_APP_URL        || failed+=(NEXT_PUBLIC_APP_URL)
printf '%s' "false"      | push STRIPE_DEPOSIT_CAPTURE_ENABLED || failed+=(STRIPE_DEPOSIT_CAPTURE_ENABLED)

# A fresh signing key so OAuth state is not signed with the service-role key.
if [ -z "$(value_of OAUTH_STATE_SECRET)" ]; then
  openssl rand -hex 32 | tr -d '\n' | push OAUTH_STATE_SECRET || failed+=(OAUTH_STATE_SECRET)
fi

# ALLOW_PLACEHOLDER_MODE is deliberately absent: setting it in production
# disables route protection and fakes bookings. Remove it if it is there.
npx --no-install vercel env rm ALLOW_PLACEHOLDER_MODE production --yes >/dev/null 2>&1 \
  && echo "  REMOVED   ALLOW_PLACEHOLDER_MODE (must never be set in production)" || true

if [ "${#failed[@]}" -gt 0 ]; then
  die "These variables did not get set: ${failed[*]}
Nothing has been deployed. Fix them and re-run; deploying now would 503."
fi

echo
echo "SUPER_ADMIN_SETUP_TOKEN was NOT set. Add it only when you need to create"
echo "the super admin, then delete it — while it is set, /api/admin/setup is live."
if [ "${#missing[@]}" -gt 0 ]; then
  echo
  echo "Not found in .env.local, so not set: ${missing[*]}"
  echo "Supabase vars missing here means the deploy will 503. Stop and check."
fi

# ---- deploy ------------------------------------------------------------
echo
read -r -p "Deploy to PRODUCTION now? [y/N] " ok
case "$ok" in
  y|Y) ;;
  *) echo "Stopped. Variables are set; run 'npx vercel --prod' when ready."; exit 0 ;;
esac

npx --no-install vercel --prod

echo
echo "Deployed. Now open /pricing on the live site:"
echo "  Professional \$69.99 and a monthly/yearly toggle  = new build is live"
echo "  Professional \$59 and no toggle                   = still the old build"
