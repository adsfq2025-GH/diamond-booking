# Diamond Booking — Go-Live Runbook

Everything below takes the app from "runs on demo data" to "live for real
customers." Do it in order. Steps marked **(free)** cost nothing at this stage.

The app is built so **every feature degrades gracefully** until its keys are
present: with no keys it runs on demo data; add each key and that capability
switches on. You can launch with just Supabase + Vercel and add Stripe / email /
SMS later.

---

## 0. What you need to sign up for

| Service | Why | Cost to start |
|---|---|---|
| **Supabase** | Database + auth (the backbone) | Free → $25/mo (Pro) when you grow |
| **Vercel** | Hosting the app | Free (Hobby) → $20/mo (Pro) |
| **Stripe** | Subscriptions + deposits | Free; ~2.9% + 30¢ per charge |
| **Resend** | Confirmation/reminder emails | Free up to 3k emails/mo |
| **Twilio** | SMS reminders (optional, paid plans) | ~$1/mo number + per-text |
| **Domain** | `diamond-booking.com` | ~$12/yr (you may already own it) |

You can go live on **Supabase + Vercel alone**.

---

## 1. Supabase (database + auth)

Full details in [`docs/BACKEND.md`](./BACKEND.md). Short version:

1. Create a project at <https://supabase.com/dashboard> (pick a region near your
   customers). Save the DB password.
2. Apply the migrations **in order** (SQL editor or CLI):
   `0001_schema.sql` → `0002_rls.sql` → `0003_functions.sql` → `0004_onboarding.sql`.
3. (Optional) Run `supabase/seed.sql` to load the demo tenant for a smoke test,
   then delete it before real launch.
4. Copy the three keys from **Project Settings → API** into `.env.local`
   (and into Vercel later): `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
5. In **Authentication → URL Configuration**, set the Site URL to your production
   URL and add `https://diamond-booking.com/auth/confirm` as a redirect URL.

> The moment these keys are real, the app leaves preview mode: auth works,
> onboarding saves, dashboards read live data. The "Preview mode" banners disappear.

---

## 2. Vercel (hosting)

1. Push the repo to GitHub.
2. <https://vercel.com> → **Add New → Project** → import the repo.
3. **Root Directory:** `platform`.
4. Framework preset auto-detects Next.js. Build command `next build`, output is
   handled automatically.
5. Add every variable from `.env.example` under **Settings → Environment
   Variables** (Production + Preview). Start with the Supabase three + `NEXT_PUBLIC_APP_URL=https://diamond-booking.com`.
6. Deploy. Confirm the marketing site loads at the Vercel URL.

---

## 3. Domain + DNS (`diamond-booking.com`)

1. In Vercel → **Project → Settings → Domains**, add `diamond-booking.com` and
   `www.diamond-booking.com`.
2. At your registrar, create the records Vercel shows you — typically:
   - `A` record `@` → `76.76.21.21` (Vercel shows the exact IP), **or** a
     `CNAME` for the apex if your registrar supports it.
   - `CNAME` `www` → `cname.vercel-dns.com`.
3. Wait for propagation (minutes to a couple hours). Vercel issues the SSL cert
   automatically. Set `NEXT_PUBLIC_APP_URL=https://diamond-booking.com` and
   redeploy.

---

## 4. Stripe (subscriptions + deposits)

1. Create a Stripe account. Stay in **Test mode** until you've verified the flow.
2. **Product catalog → Add product** three times — one per plan — each with a
   **monthly recurring price**:
   - Starter $29/mo, Professional $59/mo, Elite $119/mo (must match `src/lib/plans.ts`).
   - Copy each Price ID (`price_…`) into `STRIPE_PRICE_STARTER/PROFESSIONAL/ELITE`.
3. **Developers → API keys**: copy `STRIPE_SECRET_KEY` and
   `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
4. **Developers → Webhooks → Add endpoint:**
   - URL: `https://diamond-booking.com/api/webhooks/stripe`
   - Events: `checkout.session.completed`, `customer.subscription.created`,
     `customer.subscription.updated`, `customer.subscription.deleted`,
     `invoice.payment_failed`.
   - Copy the **Signing secret** (`whsec_…`) into `STRIPE_WEBHOOK_SECRET`.
5. Redeploy. In the dashboard, **Settings → Billing** now runs real Checkout, and
   **Settings → Integrations** shows Stripe "Connected". Test a subscription with
   card `4242 4242 4242 4242`.
6. When ready for real money, flip Stripe to **Live mode** and swap in the live
   keys + a live webhook endpoint.

Local testing: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.

---

## 5. Email — two options (pick either or both)

Booking emails are sent using, in order: **the tenant's own SMTP**, then your
**platform-wide SMTP**, then a **platform-wide Resend** key, else nothing (no error).

**Option A — each business connects their own email (no env vars).**
In the app: **Settings → Integrations → Email delivery → "My own email (SMTP)"**.
For Gmail: host `smtp.gmail.com`, port `587`, username = the Gmail address, and a
**Google App Password** (Google Account → Security → 2-Step Verification → App
passwords) as the password. Then **Send test email** to confirm. The password is
stored server-side only. This is the simplest path for a single business.

**Option B — your own platform-wide SMTP (env, one sender for everyone).**
Set these env vars (Vercel + `.env.local`); they take priority over Resend:
```
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_SECURE=false          # true only for port 465
SMTP_USER=your-smtp-username
SMTP_PASS=your-smtp-password-or-app-password
SMTP_FROM=Diamond Booking <notifications@yourdomain.com>
```
Redeploy. Every tenant that hasn't set their own SMTP now sends through yours.

**Option C — platform-wide Resend (env, one sender for everyone).**
1. <https://resend.com> → add & **verify your sending domain** (SPF + DKIM DNS
   records they provide). This keeps emails out of spam.
2. Create an API key → `RESEND_API_KEY`.
3. Set `RESEND_FROM_EMAIL="Diamond Booking <notifications@diamond-booking.com>"`.
4. Redeploy.

## 5b. Super admin (platform owner)

Your own platform-admin login (for `/admin`) is set by env vars, like an API key:

1. Set in Vercel (and `.env.local` for local):
   ```
   SUPER_ADMIN_EMAIL=you@yourdomain.com
   SUPER_ADMIN_PASSWORD=a-long-strong-password
   ```
2. Deploy, then visit **`{APP_URL}/api/admin/setup`** once in your browser. It
   provisions the super-admin account from those env vars (idempotent — change
   the password and revisit to rotate).
3. Sign in at `/login` with those credentials → you land on `/admin`.

Requires `SUPABASE_SERVICE_ROLE_KEY` to be set. Only ever provisions that one
env-defined account, so the endpoint is safe to reach.

---

## 6. Twilio (SMS reminders — optional, paid plans)

1. Buy a phone number in the Twilio console.
2. Copy `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` (E.164,
   e.g. `+15551234567`).
3. Redeploy. SMS is plan-gated (Professional/Elite) and behind these keys.

---

## 7. Pre-launch smoke tests

Run these once against the **live** project (they can't run on demo data):

**A. Auth + onboarding** — follow [`docs/TESTING.md`](./TESTING.md) end to end
(sign up → onboarding wizard → dashboard).

**B. Tenant isolation (critical for a multi-tenant app):**
1. Sign up two separate businesses (Tenant A, Tenant B) with different emails.
2. As Tenant A, create a booking/customer.
3. Sign in as Tenant B. Confirm you see **none** of Tenant A's data anywhere —
   dashboard, bookings, customers, calendar, reports.
4. Try to hit an API/route with B's session for an A record — it must return
   nothing. This is enforced by Row-Level Security (`supabase/migrations/0002_rls.sql`),
   which filters every table by `auth_tenant()`.
> If A ever sees B's data, **stop and do not launch** — re-check that RLS is
> enabled on every table (`0002_rls.sql`) and that no query uses the service-role
> client for tenant reads.

**C. Booking widget:** open `/book/<your_public_key>`, complete a booking, and
verify it appears in the owner dashboard and (with Resend) the email arrives.

---

## 8. Quality bar (measured on this build)

Production build passes (`npm run build`), `npm run lint` clean, and Lighthouse
(desktop) on the running app:

| Page | Performance | Accessibility | Best-practices | SEO |
|---|---|---|---|---|
| Marketing `/` | **92** | **94** | **100** | **100** |
| App `/dashboard` | **95** | **90** | **100** | — |

Targets (≥85 marketing, ≥80 app) are exceeded. Full-page screenshots at 1440px
and 375px for every route are in `qa/` (zero console errors, zero horizontal
overflow at mobile width).

---

## 9. After launch

- Move Supabase to the **Pro plan** ($25/mo) before you rely on it — the free
  tier pauses after inactivity and has no daily backups.
- Turn on Supabase **Point-in-Time Recovery** / daily backups.
- Read [`docs/SECURITY.md`](./SECURITY.md) and work through the checklist — it's
  the difference between "works" and "safe to hold customers' data."
