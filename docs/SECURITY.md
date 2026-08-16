# Diamond Booking — Security Guide (plain English)

You're going to hold real people's names, addresses, bookings, and payment
activity. This is how to keep that safe **without spending much money**, good
enough to keep opportunistic hackers and spam bots out from day one, with a
clear path to upgrade as you grow.

The single most important idea: **you don't have to be a security expert,
because the tools do most of the work — if you turn them on and never take
shortcuts with secrets.**

---

## Part 1 — What already protects you (built into how this app is built)

You get a lot for free just from the architecture. You don't have to do anything
for these except *not undo them*:

1. **Card numbers never touch your app or database.** All payments go through
   **Stripe**. Your app only ever sees a token, never a real card number. This is
   the biggest one: if you never store card data, a database breach can't leak
   card data. It also keeps your PCI-compliance obligation at the *lowest,
   simplest level* (SAQ-A) — a short self-questionnaire, not an audit.

2. **Every business's data is walled off from every other's.** The database uses
   **Row-Level Security (RLS)** — a rule on every table that says "you can only
   see rows belonging to your own business." Even if someone found a bug in the
   app, the database itself refuses to hand over another tenant's data. (This is
   the tenant-isolation smoke test in the go-live runbook — verify it before
   launch.)

3. **Passwords are never stored as text.** Supabase Auth hashes them. Even you
   can't see them. A leaked database gives an attacker useless scrambled strings.

4. **Traffic is encrypted (HTTPS).** Vercel issues SSL automatically. Nobody on
   the coffee-shop wifi can read your customers' data in transit.

5. **The "master key" stays on the server.** The `service_role` key (which can
   bypass those tenant walls) is only ever used in server code and webhooks —
   never sent to the browser. The browser only gets the `anon` key, which RLS
   keeps on a short leash.

6. **Webhooks are signature-verified.** The Stripe webhook checks a cryptographic
   signature, so a random person can't POST fake "this customer paid" events to
   your app.

---

## Part 2 — Do these now (all free, ~1 hour total)

This is where **most real-world break-ins actually happen** — not clever hacking,
but someone getting into *your* accounts. Lock those down:

- [ ] **Turn on 2-factor authentication (2FA) on every account that runs the
  business:** Supabase, Vercel, Stripe, GitHub, your domain registrar, and the
  email inbox those are tied to. If an attacker gets your email, they can reset
  everything else — so protect the email most of all.
- [ ] **Use a password manager** and give each of those accounts a unique, long
  password. Reused passwords are the #1 cause of account takeover.
- [ ] **Never put secrets in the code.** Keys live in `.env.local` (which is
  git-ignored) and in Vercel's Environment Variables. Never paste a key into a
  chat, screenshot, or public repo. If a key ever leaks, rotate it immediately
  (Supabase and Stripe let you roll keys in one click).
- [ ] **In Supabase → Authentication:** require **email confirmation** for new
  signups, and turn on **"leaked password protection"** (it blocks passwords
  known to be in past breaches). Both are toggles.
- [ ] **In Stripe:** keep it in **Test mode** until you've tested, and leave
  **Stripe Radar** on (free) — it auto-blocks obviously fraudulent cards.
- [ ] **Turn on database backups.** Supabase's free tier is fine to start but has
  no daily backups and pauses when idle — plan to move to the **Pro plan
  ($25/mo)** and enable **Point-in-Time Recovery** before you depend on it. A
  backup is your insurance against both attacks and your own mistakes.

---

## Part 3 — Keep the spam and bots out (cheap/free)

Public forms (the booking widget, signup, login) attract bots. Cheapest strong
setup:

- [ ] **Put Cloudflare in front of the site (free plan).** Point your domain's
  DNS at Cloudflare. You instantly get DDoS protection, a basic firewall, and bot
  filtering at no cost. This is the single highest-leverage free upgrade.
- [ ] **Add Cloudflare Turnstile (free) to the public booking + signup forms.**
  It's a privacy-friendly, invisible CAPTCHA — real people sail through, bots get
  stopped. (Wiring point: the booking form in
  `src/components/widget/BookingFlow.tsx` and the auth forms.)
- [ ] **Rate-limit the sensitive endpoints** so someone can't hammer login or spam
  1,000 fake bookings. Cheapest options: Cloudflare rate-limiting rules (free
  tier covers basics), or **Upstash Redis (free tier)** with a few lines in the
  booking/auth server actions. Supabase Auth already rate-limits login attempts.
- [ ] **Email confirmation on signup** (Part 2) also kills most fake-account spam.

---

## Part 4 — The rule for financial data (read this twice)

- **Never store, log, or email a full card number, CVC, or bank number — ever.**
  You don't need to; Stripe handles it. This app is built that way. If you later
  add a feature, keep it that way.
- **Deposits and payments** run through Stripe PaymentIntents/Checkout, so the
  card details are entered on Stripe's secured fields, not yours.
- **Don't email invoices with sensitive details in the subject line**, and treat
  your Stripe dashboard login like a bank login (2FA, unique password).
- If you ever take payments over the phone, do it *inside Stripe's dashboard*,
  not by writing card numbers down.

---

## Part 5 — Ongoing hygiene (a few minutes a month, free)

- [ ] **Keep dependencies patched.** Turn on **GitHub Dependabot** (free) — it
  opens PRs when a library needs a security update. Run `npm audit` occasionally.
- [ ] **Watch the logs.** Supabase, Vercel, and Stripe all show recent activity
  and failed logins. Skim them; investigate anything weird.
- [ ] **Least privilege for staff.** The app already separates owner / employee /
  customer roles, and RLS enforces that employees can't see business financials.
  Don't share the owner login — invite teammates as employees.
- [ ] **Review who has access** to your Supabase/Vercel/Stripe projects every few
  months; remove anyone who's left.

---

## The cheapest "good enough to launch" stack

| Layer | Tool | Cost |
|---|---|---|
| Isolation + auth + hashed passwords | Supabase (built-in RLS) | free → $25/mo |
| Card data / PCI burden offloaded | Stripe + Stripe Radar | free (per-txn fees) |
| HTTPS, hosting | Vercel | free |
| DDoS + firewall + bot filtering | **Cloudflare free plan** | free |
| CAPTCHA on public forms | **Cloudflare Turnstile** | free |
| Rate limiting | Cloudflare rules / Upstash free | free |
| Dependency patches | GitHub Dependabot | free |
| Account protection | 2FA + password manager | free |

That combination is a genuinely solid baseline for a business your size — the
same tools much larger companies rely on, just on their free tiers.

## When you grow, upgrade to

- Supabase Pro (backups/PITR), a WAF with custom rules (Cloudflare Pro ~$20/mo),
  paid rate-limiting, an error monitor like Sentry (free tier exists), and a
  yearly third-party security review once you're handling serious volume.

---

### One-paragraph summary

Payments go through Stripe so you never hold card data; the database walls off
each business with Row-Level Security; passwords are hashed and traffic is
encrypted — all built in. Your job is the boring, decisive stuff: **turn on 2FA
everywhere, never leak your keys, put Cloudflare (free) in front with Turnstile
on the public forms, and keep backups on.** Do those and you're in good shape to
launch, with room to add more as you scale.
