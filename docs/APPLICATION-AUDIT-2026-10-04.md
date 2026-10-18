# Diamond Booking application audit

Audit date: October 4, 2026 (America/Tijuana).

## Result and scope

The application builds and starts successfully, but the reviewed implementation has launch blockers. A successful build does not establish that onboarding, payments, notifications, or tenant isolation work end to end.

Reviewed the live homepage, signup and login at https://www.diamond-booking.com, the local production server at http://localhost:3100, onboarding actions and UI, booking RPCs and UI, database migrations, integrations, and selected dashboard controls. Existing application edits were preserved. Findings about database policies describe the repository migrations; the deployed database policies have not been independently inspected or exploited.

## Checks performed

- `npm run build`: passed; all application routes compiled. Warnings: deprecated middleware convention and Node 20 deprecation in Supabase.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false`: passed.
- `npm run lint`: no errors, one unused `formatDuration` warning in `ServicesStep.tsx`.
- `npm run start -- --port 3100`: started successfully.
- Local signed-out `/onboarding`: redirects to `/login?redirect=%2Fonboarding`.
- Local contact form: entered reserved test data and submitted; displayed “Message on its way.” Source confirms there is no delivery request or persistence.
- The user completed test-account signup. Live onboarding steps 1–6 completed successfully; reload resumed at step 6 before completion, and persisted completion reopened the booking-link screen afterward.
- With explicit user approval, submitted one one-time booking to the test business: BK-7225, October 5 at 09:00 America/Tijuana, AUDIT TEST Cleaning plus Inside fridge, $145, no deposit/online payment. Dashboard shows Pending, Audit Tester assigned, 09:00–11:30; reload preserved the booking. The occupied 09:00 slot disappeared from public availability. No payment was initiated. The confirmation UI claims email was sent; inbox delivery has not been independently verified.
- Four add-ons survive in the deployed version and appear in the public booking page. The add-on-loss finding below describes the current local workspace edits, which differ from the deployed implementation.
- Live pricing persistence bug: selected Flat rate during onboarding, then reopened step 2 after completion; it displayed Per hour and an empty minimum-hours field. The dashboard editor displays Flat rate. Pricing state is inconsistent between editors.
- Live branding bug: saved primary color `#246b45`, verified it reloaded in onboarding step 5, but public widget header/controls still use `#0c2440` from widget theme.
- Live completion screen initially showed both “ready to book” and “Finish onboarding”; reloading clears the stale blocker.
- Live travel-buffer bug: after the 09:00–11:30 booking, the public widget offers 11:30 as the next start despite the service's saved 30-minute after-buffer.

Evidence screenshots in the workspace: `qa-audit-onboarding-complete.jpg`, `qa-audit-booking-review.jpg`, `qa-audit-booking-created.jpg`, and `qa-audit-dashboard-booking.jpg`. The clearly labeled pending booking remains in the test account for review.

## Fixes proposed for approval

### 1. Protect roles, tenant membership, and integration credentials (critical)

`supabase/migrations/0002_rls.sql:75` permits profile updates when `id = auth.uid()`, including its WITH CHECK expression. No reviewed trigger or column privilege restriction prevents updating `role` or `tenant_id`. `auth_role()` and `auth_tenant()` subsequently derive authorization from those fields. If deployed as written with normal authenticated update privileges, this permits privilege escalation and tenant reassignment.

The tenant SELECT policy permits employees and customers to read their tenant row, while `src/lib/actions/settings.ts` stores SMTP passwords in `tenants.settings.email.smtp.pass`. Google calendar connection policies in migration 0006 also permit employee reads across the tenant's connections, which contain access and refresh tokens.

Proposed change: restrict identity and billing fields to privileged server operations; separate secrets from tenant-readable data; restrict calendar credentials to the server and authorized connection owner. Validate with two test tenants and each supported role. Inspect deployed grants/policies before assessing production exposure.

`src/app/api/admin/setup/route.ts` also exposes unauthenticated GET and POST actions that create or reset the environment-defined admin account and return its email. Replace public password-reset bootstrap with a protected, explicit provisioning operation; remove mutation from GET.

### 2. Make onboarding finish reliable and readiness truthful (high)

`src/lib/actions/onboarding.ts:302` saves `onboarding_complete = true` before staff availability and service links are created. Several reads ignore their errors, and there are no server-side prerequisites ensuring an active service, bookable staff, open hours, or usable widget exist.

`src/app/onboarding/page.tsx:164` accepts arbitrary step query parameters through 7; step 7 displays completion regardless of persisted completion. Readiness uses hardcoded first-booking and payment assumptions. The wizard passes its original readiness into the completion screen without refreshing it after saving.

Proposed change: validate prerequisites on the server, complete the dependent writes before marking setup complete (preferably transactionally), preserve safe retry behavior, limit step navigation to valid progress, and refresh readiness from real service/staff/hours/widget/Stripe state. “Setup complete” and “Payments ready” should accurately describe separate states.

Also synchronize saved branding with the public widget theme. Live testing confirms that a persisted primary color is currently ignored by the widget.

### 3. Preserve pricing, duration, and add-ons (high)

The current workspace service editor offers hourly, flat, square-foot, and custom units, but onboarding saves only price and duration; pricing unit and custom label are not stored. Reload maps every service back to hourly. The booking RPC charges a fixed `price_cents`, so an hourly rate is not multiplied by minimum hours and square footage is not collected or calculated.

`ServicesStep.tsx` keeps add-ons only in component state, starts them as an empty list, and submits only services. `saveServices` deletes existing add-ons and does not insert replacements. The dashboard service action also ignores its pricing-model fields.

Proposed change: define one pricing model across schema, onboarding, dashboard, quote display, and server booking calculation. Persist and reload pricing fields and add-ons. Keep explicit duration for all pricing modes. Verify a two-hour $50/hour service quotes and books at $100, and verify edited add-ons survive reload and appear to customers.

### 4. Stop replacing whole service and staff tables (high)

Onboarding deletes all services/add-ons and staff before inserting replacements. An insert failure can leave setup data missing. Reopening setup after launch can fail on referenced services or detach booked employees and delete related availability. Returned service IDs are not applied to wizard state.

Proposed change: reconcile records by stable database ID, preserve booking references, deactivate referenced removals, and save related changes atomically. Repeat-save and resume tests must preserve IDs and existing bookings.

### 5. Complete the deposit/payment flow (high)

`src/components/widget/BookingFlow.tsx:728` explicitly displays that payment capture UI is the next step to wire. Creating a PaymentIntent does not collect money. Booking succeeds before payment and can still succeed when intent creation fails. The deposit-required setting is not used by the reviewed booking RPC, and the cancellation policy saved in onboarding is not supplied to the public widget contract even though confirmation says it was shown.

Proposed change: implement secure customer payment completion, server/webhook reconciliation and retry behavior, truthful payment status, and explicit policy display. Respect required deposits and connected-account readiness. Verify only in Stripe test mode before approving live payment operation.

### 6. Deliver reminders and team invitations (high)

`vercel.json` schedules only recurring extension. `/api/cron/send-reminders` exists but has no repository deployment schedule. Confirm whether an external scheduler exists before concluding production reminders never run.

Onboarding stores teammate names/emails but has no reviewed invite-dispatch/acceptance implementation. The dashboard “Invite teammate” button has no handler. “Invite queued” currently describes a record, not a demonstrated delivery queue.

Proposed change: schedule a reminder worker at an appropriate supported interval; add safe claiming/retry and delivery visibility. Implement authorized invitation sending and acceptance, profile/employee linking, and resend behavior. Test delivery with addresses explicitly authorized by the user.

### 7. Fix support and nonfunctional dashboard actions (high)

The contact form shows success solely by calling `setSent(true)`; no message is delivered. The local test reproduced this. New invoice and PDF download controls have no functional handler. Invoice paid/refunded actions update React state only, so they do not persist or execute payment/refund operations. Coupon creation and activation also update local React state only and disappear on reload.

Proposed change: implement server-backed support delivery and show success only after acceptance; connect invoice creation/export and persisted status actions, and persist coupons with server-side validation and booking redemption. Distinguish manually recorded invoice status from actual processor transactions. Confirm the intended support address before using it: the displayed address is `support@diamondbooking.com`, whereas the application domain is `diamond-booking.com`.

### 8. Fix availability and booking edge cases (high)

Slot fetching uses only base service duration; booking creation adds add-on duration afterward. A slot offered to customers can therefore fail at submission. The onboarding default travel-buffer setting is stored but not consumed by the reviewed slot RPC. Recurrence materialization silently skips conflicts and copies times without checking all future business-hour/availability constraints; the resulting series needs a visible outcome.

Proposed change: calculate availability using the selected add-ons and effective buffers on both the candidate appointment and existing bookings, verify repeat occurrences against business timezone and availability, report skipped dates, and test daylight-saving boundaries and concurrent bookings. Live testing confirmed an 11:30 slot is offered immediately after a booking ending 11:30 despite its service having a 30-minute after-buffer.

### 9. Unify naming, plan limits, and product promises (medium)

- Homepage: Enterprise $119; signup, plan definitions and comparison table: Elite $119.
- Homepage Starter: one staff calendar; plan definitions: up to three team members.
- Homepage says every capability ships in every plan; plan feature gates disagree.
- Marketing includes claims for live route dispatch, two-way texting, API docs, and other capabilities that require feature-by-feature verification. API/embed-doc links currently lead to the general features page.
- Usage totals, testimonials, growth percentages, utilization and show-rate claims should have supporting evidence or be replaced with factual product descriptions. Initial differing counter values observed were animation progress, not a confirmed totals bug.
- Mobile navigation hides sign-in and primary links without a menu alternative. Footer Privacy/Terms/Security is plain text rather than links.

Proposed change: use `src/lib/plans.ts` as the shared plan source, keep Elite unless a deliberate rename is approved, publish only supported capabilities, add mobile navigation and working legal links, and standardize business/person name display with safe fallbacks. Onboarding plan-limit enforcement must also be server-side.

### 10. Improve setup recovery and maintenance (medium)

Signup cleanup deletes only the auth user when tenant bootstrap fails; a tenant already inserted is not removed by that deletion. Signup also immediately confirms email ownership without verification. Decide an intentional verification flow and make failed bootstrap recoverable.

The launch/test runbooks mention only migrations through 0004 even though 0005 and 0006 are required by recurrence/integration code. Their placeholder-mode and completed-feature assertions no longer reliably reflect current source.

Proposed change: transactional or compensating signup cleanup, recoverable setup errors, explicit email verification behavior, complete migration/configuration documentation, a supported Node version, and migration from middleware to proxy following bundled Next.js guidance.

## Recommended implementation order

1. Security restrictions and secret isolation.
2. Pricing/add-on persistence and safe onboarding completion/resume.
3. Test-account onboarding to first booking; verify dashboard and reload.
4. Payment completion, reminder scheduling, invitations and support delivery.
5. Remaining dashboard controls, naming/claims and mobile navigation.

## Acceptance before launch

Run signup -> every onboarding step -> reload/resume -> public booking -> dashboard -> confirmation -> reminder with a disposable business. Exercise required-deposit success/failure in Stripe test mode, duplicate-slot races, add-on duration, recurring conflicts, and two-tenant role isolation. Record actual delivery and database outcomes. Production configuration, deployed policies and external service operation must be checked separately from compiling local code.

Application changes and deployment await user approval. This document records the proposed work; it does not claim fixes have been applied.
