import type { NextConfig } from "next";

/**
 * Security headers (A27). The app had none, while serving an
 * iframe-embeddable booking page that collects names, addresses and payment
 * intents.
 *
 * The frame rules are deliberately split:
 *   /book/*  must be embeddable on customers' own websites — that is the
 *            product — so it gets no frame denial. Which sites may embed it
 *            is enforced per-tenant by widget_configs.allowed_domains.
 *   everything the dashboard, admin, portal and auth screens included — may
 *            not be framed at all, which is what stops clickjacking against a
 *            signed-in owner.
 *
 * The CSP is intentionally conservative but permits what the app actually
 * uses: Stripe.js and Stripe's payment iframes, the Supabase REST/realtime
 * origin, and the Photon geocoder proxied through our own origin.
 */

const supabaseOrigin = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
      : "";
  } catch {
    return "";
  }
})();

const connectSrc = ["'self'", supabaseOrigin, "https://api.stripe.com"]
  .filter(Boolean)
  .join(" ");

/**
 * 'unsafe-inline' is required for styles because Tailwind v4 and Next inject
 * inline style attributes; 'unsafe-eval' is NOT granted. Script hashes would
 * be preferable to 'unsafe-inline' for scripts, but Next's inline bootstrap
 * needs it until a nonce-based middleware CSP is wired up — tracked as
 * residual work rather than silently claiming a stricter policy than we have.
 */
function csp(frameAncestors: string): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline' https://js.stripe.com",
    `connect-src ${connectSrc}`,
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
    "media-src 'self'",
    `frame-ancestors ${frameAncestors}`,
    "upgrade-insecure-requests",
  ].join("; ");
}

const common = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(self)",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  // Hide the floating dev-tools badge so QA screenshots match production.
  devIndicators: false,

  async headers() {
    return [
      {
        // The public booking page: embeddable anywhere by design.
        source: "/book/:path*",
        headers: [...common, { key: "Content-Security-Policy", value: csp("*") }],
      },
      {
        // Everything else: never framed. /book is excluded rather than
        // overridden — a second CSP header would be intersected with this one
        // by the browser, and frame-ancestors 'none' would win.
        source: "/((?!book/).*)",
        headers: [
          ...common,
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: csp("'none'") },
        ],
      },
    ];
  },
};

export default nextConfig;
