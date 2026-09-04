# Admin Dashboard V2 UI Spec

## Route structure

- `/admin` → overview landing page
- `/admin?tab=tenants` → tenant management workspace
- `/admin?tab=revenue` → revenue and billing analytics
- `/admin?tab=onboarding` → activation and onboarding intelligence
- `/admin?tab=usage` → feature adoption and usage analytics
- `/admin?tab=flags` → feature rollouts and release controls
- `/admin?tab=support` → support operations workspace
- `/admin?tab=audit` → audit and security review
- `/admin?tab=health` → platform system health

## Shell layout

- Top heading with title, subtitle, and platform status chips
- Horizontal tab bar under page heading
- KPI band at top of overview
- Secondary content split into responsive panels and operational tables
- Mobile layout stacks all panels vertically and keeps tabs horizontally scrollable

## Overview page structure

### Row 1 — KPI band

- MRR
- ARR
- Active tenants
- Trial conversion
- Churn rate
- Failed payments
- At-risk tenants
- Support backlog

### Row 2 — Immediate attention

- Attention queue card
- Tenant health distribution card
- Launch funnel snapshot card

### Row 3 — Business intelligence

- Revenue trend chart
- Plan mix distribution
- Platform email / communications status

### Row 4 — Actionable lists

- Accounts needing intervention
- Recent platform events

## Tenants page structure

### Toolbar

- Search by business name, owner, email, or tenant ID
- Filter chips: status, lifecycle, plan, health, billing
- Primary action: export or open support queue

### Summary strip

- Total tenants
- Live tenants
- Trialing tenants
- At-risk tenants
- Past due tenants

### Main table columns

- Business
- Owner
- Plan
- Lifecycle
- Health
- Billing status
- Onboarding
- MRR
- Bookings 30d
- Last active
- Next action
- Actions

### Tenant detail drawer

- Header with business name, lifecycle badge, health badge, quick actions
- Snapshot cards: MRR, bookings, team size, last active
- Sections:
  - onboarding progress
  - widget and booking page status
  - billing and payment status
  - recent product activity
  - support notes
  - audit timeline

## Revenue page structure

### KPI band

- MRR
- ARR
- New MRR
- Expansion MRR
- Churned MRR
- NRR
- ARPA
- Failed payment recovery

### Main panels

- Revenue trend chart
- Plan mix chart
- Trial-to-paid trend chart
- Billing issues summary

### Tables

- Failed invoices
- Recent expansions
- Recent churns
- Top accounts by revenue

## Onboarding page structure

### KPI band

- Onboarding starts
- Completion rate
- Median completion time
- Widget publish rate
- Payment setup rate
- First booking within 7 days

### Main panels

- Step dropoff funnel
- Tenants stuck by step
- Completed but not live
- Published but no bookings

### Actions

- Follow up tenant
- Reset step
- Open tenant drawer
- Assign support outreach

## Usage page structure

### KPI band

- Widget adoption
- Customer portal usage
- Team portal usage
- Recurring booking adoption
- Online payment adoption
- Average bookings per active tenant

### Panels

- Adoption by plan
- Adoption by industry
- Low usage segments
- Expansion opportunities

## Flags page structure

### Feature flag table

- Flag name
- Description
- Global state
- Targeting scope
- Affected tenants
- Last changed by
- Last changed at
- Rollback state
- Actions

### Flag detail panel

- Rollout summary
- Change reason
- Audit history
- Linked incidents
- Rollback controls

## Support page structure

### KPI strip

- Open issues
- High priority tenants
- Billing escalations
- Onboarding follow-ups
- Recent impersonations

### Main workspace

- Search and filter bar
- Support queue table
- Internal notes panel
- Tenant quick-view panel

## Audit page structure

### KPI strip

- Impersonations this week
- Suspensions this month
- Sensitive actions today
- Failed admin actions

### Tables

- Impersonation history
- Suspension history
- Feature flag changes
- Billing override history
- Access anomalies

## Health page structure

### KPI band

- Webhook success
- Queue backlog
- Email success
- SMS success
- Auth failure rate
- Booking pipeline errors

### Panels

- Webhook health
- Notification health
- Auth health
- Booking pipeline health
- Incident timeline

## Visual rules

- Use existing `Panel`, `PanelHeader`, `StatCard`, `TableWrap`, `Th`, and `Td` primitives where possible
- Keep dense but readable spacing matching current admin and dashboard surfaces
- Use status badges for lifecycle, health tier, and billing state
- Prioritize dark navy text, quiet panels, and restrained accent colors already used in the product
- Surface warnings in gold and critical items in soft red, not harsh saturated tones

## Interaction rules

- Tabs must preserve selection via query string so views are linkable
- Row actions open drawer or modal instead of full route change where possible
- Sensitive actions require confirmation and reason entry in future backend phase
- Empty states must tell the admin what action to take next
- Preview mode stays clearly labeled when live backend data is unavailable
