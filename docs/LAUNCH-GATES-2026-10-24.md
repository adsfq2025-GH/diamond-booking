# Launch gates — response to the KnownBiz review of 23 October 2026

This records what changed in response to the two review documents
(`KnownBiz_Diamond_Booking_Progress_and_Launch_Readiness_2026-10-23` and the
24 October client edition), finding by finding, and — just as importantly —
what is **not** closed by code and still needs a person.

Everything below is a source change. **Nothing here has been executed against a
database or a deployment.** The review's own standard applies to this document
too: "implemented", "build succeeded" and "test script exists" are different
from "workflow passed". The acceptance checklist (T01–T20 in the review) is
still the gate, and `supabase/migrations/0013_launch_gates.sql` has not been
applied anywhere yet.

---

## Booking and calendar (P1)

### B01 — Rescheduled appointments stop holding capacity

**Was:** the owner reschedule action set a non-pending booking to
`rescheduled`. The deployed `booking_conflicts` function, the
`no_double_booking` exclusion constraint and the calendar query all counted
only `pending` and `confirmed`, so a moved appointment stopped blocking its new
time *and* disappeared from the calendar on refresh. Its slot could be sold
again.

**Now:** fixed from both ends, because either alone leaves a gap.

- A move no longer changes the status. `reschedule_booking()` records it in new
  `bookings.rescheduled_at` / `reschedule_count` columns, so the appointment
  stays whatever it was — an active commitment.
- `active_booking_statuses()` is the one definition of "occupies capacity", and
  it includes `rescheduled`. `booking_conflicts`, the reminder worker, the
  renewal worker and the exclusion constraint all use that list, so rows left
  in that state from before are protected too.
- The calendar query now excludes only `cancelled`.

The migration promotes existing `rescheduled` rows back to `confirmed`, one at
a time. If any of them overlaps another active appointment — a slot that was
genuinely sold twice while it was invisible — the migration **stops and names
the booking ids** rather than aborting on a raw Postgres error. Those need a
decision from the business, not an automatic fix.

### B02 — Calendar moves did not recheck the scheduling rules

**Was:** rescheduling checked date parsing and booking conflicts only. Business
hours, employee working hours, approved time off, service eligibility and a
future-date requirement were never revalidated, so the calendar could accept a
time the public booking flow would have refused.

**Now:** `assert_booking_slot()` is the single validation, and public booking,
the calendar move and every recurring visit all go through it. It raises a
distinct error per reason, which `src/lib/booking-errors.ts` turns into a
sentence for the customer or the owner — the calendar used to surface a raw
exclusion-violation dump.

### B03 — Buffer checks were not atomic

**Was:** buffer validation was a pre-insert read with no shared lock. Two
requests could both pass it and create jobs that do not overlap but whose
buffers do, which the exclusion constraint cannot see — it compares raw
appointment ranges.

**Now:** `lock_booking_capacity()` takes a transaction-scoped advisory lock per
employee per local date, held across the check and the write in
`create_widget_booking`, `reschedule_booking` and `create_series_occurrence`.
A reschedule locks both the old and the new date.

**Still to prove:** T07. Two parallel requests whose job spans do not overlap
but whose buffers do. This is the finding least verifiable by reading code.

---

## Recurring appointments and pricing

### B04 — Repeat visits bypassed booking validation

**Was:** three separate implementations (first materialization, the owner's
extend action, the renewal cron) each inserted copied booking rows. None ran
the hours, eligibility, time-off or buffer checks; none carried the first
visit's add-ons; none queued reminders or dispatched calendar events; and
failures in the two background ones were silent. `recurring_enabled` was only
checked in the browser.

**Now:** one validated path — `create_series_occurrence()` — used by all three
via `src/lib/recurrence-series.ts`. It validates, copies the add-on snapshot,
and **reports why** a date was skipped instead of dropping it. Reminders and
calendar events are queued for every reserved visit. `create_widget_booking`
refuses a series when the tenant has repeat bookings switched off, and
`MAX_SERIES_HORIZON_DAYS` caps how far ahead one call can reserve.

The confirmation screen now shows the reason per skipped date ("closed that
day", "team member away") rather than describing every one as "already taken".

### B05 — Weekly series could shift by an hour

**Was:** `computeOccurrences` used the server runtime's calendar arithmetic. On
a UTC server a weekly 09:00 America/Tijuana appointment became 08:00 after the
November daylight-saving change.

**Now:** occurrences are generated in the tenant's IANA timezone and converted
back to UTC, resolving the offset in effect *at each occurrence* rather than
today's. Monthly series clamp short months. Every caller passes the tenant's
zone.

### B06 — Pricing units were stored but never calculated

**Was:** onboarding offered hourly, square-foot and custom pricing and the
quote and booking functions used `price_cents` flat. A $50/hour service with a
two-hour minimum was advertised and booked at $50. The tenant's
`default_buffer_minutes` was saved and never read.

**Now:**

- `service_quote_cents()` is one quantity-aware price, shared by the quote and
  the booking, and the units are persisted on the booking
  (`pricing_unit`, `pricing_quantity`).
- Hourly services bill at least their minimum hours, and the widget shows that
  total with the rate underneath.
- Square-foot and custom services cannot be priced without a measurement, so
  they are **not offered an instant total at all** — `get_widget_config` marks
  them `quote_on_request` and the widget routes them to the enquiry path. This
  follows the review's instruction not to advertise quantity-based pricing
  until the displayed price and the saved total agree.
- `service_effective_buffers()` applies the tenant default as a documented
  fallback: a service with its own after-buffer keeps it, a service with none
  inherits the business-wide gap.

---

## Tenant and customer data controls (P1)

### S01 — Owners could update protected subscription controls

**Was:** `tenants_update` let an owner update their own row, and
`authenticated` held UPDATE on `plan`, `subscription_status`, `suspended`,
`billing_cycle`, `trial_ends_at` and every `stripe_*` column. An owner could
self-upgrade or self-unsuspend straight through the data API, whatever the
dashboard hid.

**Now:** two layers. Column privileges are revoked from client roles — the
owner keeps only the business-profile fields the dashboard edits — and
`guard_tenant_privileged_fields` refuses the change as well. The two Stripe
Connect writes in `src/lib/actions/billing.ts` moved to the service role,
because they are reviewed billing operations rather than ordinary owner edits.

### S02 — Customer and employee booking updates were too broad

**Was:** customers could update their own active booking and employees their
assigned bookings, with `authenticated` holding UPDATE on `price_cents`,
`status`, `starts_at`, `ends_at` and `service_id`. The cancellation window was
enforced in a server action a direct API caller simply skipped.

**Now:** `guard_booking_field_access` decides per role, in the database:

| Role | May change |
| --- | --- |
| Owner of the tenant | anything except moving the booking to another business or customer |
| Assigned employee | status (`confirmed` / `completed` / `no_show`) and internal notes |
| The customer | status → `cancelled` only, and only outside the business's notice period |

The cancellation window is now enforced at the boundary, not just in the UI.

---

## Onboarding and staff readiness

### O01 — Completion widened staff eligibility and left stale hours

**Was:** `finishOnboarding` linked every employee to every service — including
inactive rows — on every finish, so an owner who reopened setup silently
re-qualified staff they had deliberately unassigned. Availability for days the
business had since closed was left behind. Readiness proved only that *some*
staff were linked and *some* had hours, and the success screen rendered the
readiness prop the page was built with.

**Now:**

- Only an employee with **no** service assignments at all gets the default
  links; explicit choices are preserved. Only active rows are considered.
- Availability on a day the business is now closed is removed (it can never
  produce a slot). Rows for newly opened days are *not* added automatically —
  that would put staff to work without being asked.
- `onboarding_readiness()` now reports `service_without_bookable_staff`: for
  each active service, is there an active qualified employee whose working
  hours overlap an open day by at least the service's duration?
- Readiness is re-read after the completion flag is written and passed to the
  success screen.
- The catalog upsert matches on **id**, not name. Renaming a booked service
  used to insert a second service and deactivate the original, forking the live
  catalog in two.

### O02 — Staff invitation acceptance had no account path

**Was:** the invite page sent a new invitee to the business signup form, which
creates a `business_owner`, bootstraps a tenant and redirects to onboarding.
And because `accept_employee_invitation` refuses to demote an owner, that
invitee could then never accept at all. For an existing customer profile, our
own 0007 identity guard rejected the promotion, because
`request.jwt.claims` is a session setting that `SECURITY DEFINER` does not
change.

**Now:**

- New staff register on the invitation page itself
  (`registerFromInvitation`): the account is created with the **invited email**
  — taken from the invitation row, not the form — and the employee role from
  the start, bound to the inviting business, consuming the invitation in the
  same call, with a rollback if any step fails.
- The identity guard recognises a change made inside a trusted definer
  function, via a transaction-local flag that `set_config` sets and no client
  can reach over the data API.
- An invitee who already owns a business now gets a clear refusal
  (`invitee_owns_a_business`) instead of a silent no-op.

### Signup atomicity and email verification

- The signup rollback removes the **tenant as well as** the auth user. Only the
  auth user was removed before, so a failure after the tenant insert left an
  ownerless tenant behind.
- Owner signup auto-confirmed the email address, which the review flagged as a
  decision nobody had made. It is now an explicit switch:
  `REQUIRE_EMAIL_VERIFICATION=true`. **Set it before opening registration to
  the public** — with it off, anyone can create a workspace against someone
  else's address. It is off by default so invited pilot businesses, whose
  address the operator already knows, are unaffected.

---

## Notifications, portals and daily operations

### D01 — Reminder delivery was failing

The five most recent workflow runs had failed and a reminder was overdue since
19 October. **The cause was environment, not code, and this work does not fix
it** — `APP_URL`, a matching `CRON_SECRET` and the production sender still have
to be checked in the Vercel account that owns the deployment.

What the code now does is make the worker recoverable and diagnosable:

- Claiming is one atomic `UPDATE ... RETURNING` (`claim_due_reminders`), so two
  overlapping runs cannot both send the same reminder. The GitHub workflow's
  concurrency group only ever covered itself.
- Failures retry with backoff and an attempt ceiling instead of being marked
  terminally `failed` on one bad response.
- A reminder for a cancelled or already-past appointment is retired
  (`retire_stale_reminders`) rather than left pending for ever.
- A worker that dies mid-send leaves a stale claim, which is reclaimed after 15
  minutes.
- **The route returns 500 when it claimed reminders and delivered none**, and
  reports per-outcome counts. A run that can do nothing no longer reports
  `{ok: true}` — which is how five failed runs went unnoticed.

The booking confirmation email is awaited and its real outcome recorded. The
confirmation screen used to decide "sent" from whether a sender was configured.

### D02 — Customer cancellation could look successful when refused

**Was:** the portal removed the booking from its list, called
`cancelMyBooking` and ignored the result. A refusal inside the notice period
looked like success until reload. Server cancellation writes ignored returned
errors, and for a series only the clicked booking's reminder and calendar event
were cleaned up.

**Now:** the optimistic removal is reversible, the result is awaited, refusals
are shown, and the list is restored on failure. Every cancelled occurrence in a
series has its reminders and calendar events cleared.

### Unfinished features are labelled rather than dead

Controls that looked live and did nothing now say what they are: receipt
download and saved-address "Add" in the customer portal, "New request" in the
staff portal, and staff availability (read-only, with who to ask). Per the
review: disabled or clearly excluded, not silently left for a tenant to find.

### Guest booking → a real account

Guest bookings create a customer row with no `profile_id`, and the portal only
shows bookings linked to the signed-in profile, so a guest who later got an
account saw an empty portal. `link_guest_customer_records()` adopts unclaimed
rows matching the address the session just authenticated, on sign-in.

---

## Hardening and hygiene

- **Durable rate limiting.** The public booking and enquiry paths now count
  against a shared database counter (`consume_rate_limit`), so the limit holds
  across serverless instances instead of being (limit × instances). It fails
  **open** if the database is unreachable — deliberate, because failing closed
  would take public booking down with it. Slot search stays in-process.
- **SECURITY DEFINER surface.** The advisor flagged 20 definer functions
  callable by client roles. Internal helpers are revoked (a definer function
  calls them as its owner, so no client grant is needed); the six that guest
  booking genuinely needs stay reachable by `anon`. Note that revoking from
  `PUBLIC` also strips `service_role`, so every worker's grant is re-stated
  explicitly.
- **`touch_updated_at`** now has a fixed `search_path`. It runs on nine tables.
- **14 unindexed foreign keys** indexed.
- **Node runtime** pinned to `>=22` (`engines` + `.nvmrc`); the Supabase
  packages require it.

---

## Not closed by this work

These were in the review and **cannot be fixed in the repository**. They are
the remaining launch gates.

| Item | Who | Why it is still open |
| --- | --- | --- |
| Apply `0013_launch_gates.sql` | Developer | Not run anywhere. Apply to staging first; it rebuilds the `no_double_booking` constraint and may stop with booking ids that need a decision. |
| Reminder delivery cause | Developer + owner | Check `APP_URL`, `CRON_SECRET` and the production sender; then prove a reminder was *received*, not just attempted. |
| Leaked-password protection | Owner | A Supabase Auth dashboard setting. |
| Credential rotation after the earlier exposure | Owner | The review could not verify it happened. |
| Backups and a restore rehearsal | Owner + developer | Policy unverified; rehearse a staging restore and record the rollback steps for app and database together. |
| Monitoring and an incident log | Owner | Assign an owner for failed jobs, undelivered messages and booking errors. The reminder route's 500 is only useful if something is watching. |
| Production configuration | Owner | Confirm app URL, Supabase project, sender, OAuth redirects and job secrets in the Vercel account that owns this deployment. |
| Stripe configuration and money-flow acceptance | Owner | Separate workstream. Online **deposit capture is still not implemented** — there is no browser confirmation step, and `STRIPE_DEPOSIT_CAPTURE_ENABLED` must stay off. Adding keys does not finish it. |
| Data pagination and query limits | Developer | **Not addressed.** The review asked for this "before larger adoption". Several dashboard reads still select whole tables for a tenant (bookings, customers), which is fine at pilot size and not fine beyond it. |
| T01–T20 acceptance runs | Tester | No fresh production write tests, payments, invitations, cancellations, emails or SMS were triggered by this work. |

## Pilot scope this supports

A pay-later pilot of one to three owner-managed businesses, one-time bookings,
once the migration is applied and the delivery and operational gates above
pass. Recurring bookings and staff self-service remain out of scope until
their own acceptance runs pass — recurrence is now correct by construction, but
"correct by construction" is not the same as tested, and the review is right
that it should stay off until it is.
