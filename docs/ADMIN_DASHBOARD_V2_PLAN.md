# Diamond Booking Admin Dashboard V2

## Sprint 0 — Metrics foundation

- Define canonical platform KPIs: MRR, active tenants, churn, trial-to-paid, onboarding completion, first-booking rate, failed payments, support backlog
- Create event taxonomy for signup, onboarding, widget, booking, payments, admin actions, impersonation, and support workflows
- Normalize tenant lifecycle stages: `trialing`, `activating`, `live`, `at_risk`, `past_due`, `suspended`
- Define tenant health scoring inputs: onboarding completion, last activity, bookings trend, payment status, support risk, widget publish state
- Add data contracts for Admin Dashboard v2 sections so UI can evolve independently from live backend wiring

## Sprint 1 — Overview v2

- Replace current overview with executive KPI band
- Add attention queue cards for failed payments, stuck onboarding, low-activity new tenants, and flagged support issues
- Add health distribution panel for healthy, watch, at-risk, and critical tenants
- Add funnel snapshot for signup → onboarding → widget publish → first booking → paid conversion
- Add plan mix and revenue summary widgets

## Sprint 2 — Tenant management workspace

- Expand tenants table with lifecycle stage, health score, onboarding status, last active, and support priority
- Add search and filters for plan, billing state, lifecycle, and health tier
- Add tenant detail drawer with owner info, booking summary, widget status, billing state, and recent activity timeline
- Add safer row actions: impersonate, suspend, restore, resend invite, reset onboarding, copy booking page link
- Require audit-ready confirmation states for destructive actions

## Sprint 3 — Revenue and billing operations

- Add revenue section with MRR, ARR, new MRR, expansion MRR, churned MRR, NRR, ARPA
- Add failed invoice queue and dunning recovery view
- Add recent churns, expansions, and high-value accounts panels
- Add plan mix analytics and cohort-level conversion summaries
- Surface billing exceptions directly from overview and tenant detail screens

## Sprint 4 — Onboarding intelligence

- Add onboarding analytics page with step dropoff funnel and median completion time
- Add stuck-tenant table with current step, days inactive, and recommended next action
- Add launch-readiness status for each tenant
- Add “completed but not live” and “published but no bookings” exception views
- Add support actions for follow-up and guided recovery

## Sprint 5 — Product usage and adoption

- Add widget adoption, portal usage, recurring booking adoption, and payment adoption metrics
- Add feature usage comparison by plan and industry
- Add low-engagement tenant segments for success outreach
- Add adoption opportunities panel for upsell and enablement
- Add usage trend comparisons week-over-week and month-over-month

## Sprint 6 — Flags, support, and audit

- Add persisted feature flag management with global, plan-based, and tenant-based scopes
- Add rollout status, last changed by, reason, and rollback controls
- Add support workspace with internal notes, severity, next action, and assignee
- Add audit center for impersonation, suspension, billing overrides, and flag changes
- Add sensitive action history with filtering by admin, tenant, action type, and severity

## Sprint 7 — System health and reliability

- Add system health dashboard for webhook success, queue backlog, notification delivery, auth failures, and booking pipeline errors
- Add incident and degraded-service callouts in the admin overview
- Add retry tools for failed webhooks and notification jobs where safe
- Add tenant-linked error visibility for faster diagnosis
- Add rollout guardrails for degraded-service conditions

## Delivery principles

- Ship value in slices: overview first, then tenants, then operational depth
- Keep preview-mode demo data aligned with future production APIs
- Preserve existing PortalShell and dashboard visual language
- Make every screen answer “what needs attention now?” before “what happened?”
- Require logging and guardrails for every sensitive admin action

## Recommended build order for code

1. Data contracts and richer mock data
2. Overview v2 UI
3. Tenants workspace and drawer
4. Revenue and onboarding sections
5. Product usage and support sections
6. Flags, audit, and system health
