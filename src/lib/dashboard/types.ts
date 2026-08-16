/**
 * View-model shapes the dashboard pages render. Both the mock provider
 * (placeholder env) and the live Supabase provider return these, so pages
 * never branch on data source. Money is always integer cents.
 */

import type { BookingStatus, PlanTier } from "@/types/database";

/** Chrome-level context resolved once in the layout. */
export interface DashboardContext {
  tenantName: string;
  ownerName: string;
  ownerEmail: string;
  plan: PlanTier;
  onboardingComplete: boolean;
  trialDaysLeft: number | null;
  /** Unread count for the topbar bell. */
  notificationCount: number;
}

export interface TrendStat {
  label: string;
  /** Preformatted display value, e.g. "$12,400" or "73%". */
  value: string;
  /** Signed fraction vs. prior period; null hides the chip. */
  delta: number | null;
  /** For deltas where down is good (e.g. no-shows), invert chip coloring. */
  invertDelta?: boolean;
  /** Small caption under the value. */
  caption?: string;
}

export interface RevenueBar {
  label: string;
  cents: number;
}

export interface StatusCount {
  status: BookingStatus;
  count: number;
}

export interface UpcomingJob {
  id: string;
  customerName: string;
  serviceName: string;
  employeeName: string;
  employeeColor: string;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  priceCents: number;
  addressLine: string | null;
}

export type ActivityKind =
  | "booking_created"
  | "booking_confirmed"
  | "payment"
  | "review"
  | "cancellation"
  | "invoice";

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  title: string;
  detail: string;
  at: string;
}

export interface UtilizationRow {
  employeeId: string;
  name: string;
  color: string;
  /** 0..1 booked-hours / available-hours this week. */
  utilization: number;
  jobsThisWeek: number;
}

export interface OverviewData {
  stats: TrendStat[];
  revenueBars: RevenueBar[];
  statusCounts: StatusCount[];
  upcoming: UpcomingJob[];
  activity: ActivityItem[];
  utilization: UtilizationRow[];
  /** Sum used to render the revenue chart caption. */
  revenueTotalCents: number;
}

// ---------- Services ----------
export interface AddonView {
  id: string;
  name: string;
  priceCents: number;
  durationMinutes: number;
}
export interface ServiceView {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  durationMinutes: number;
  priceCents: number;
  depositCents: number;
  bufferBefore: number;
  bufferAfter: number;
  active: boolean;
  addons: AddonView[];
  /** How many team members can perform it. */
  employeeCount: number;
  /** Completed bookings of this service (popularity). */
  bookingCount: number;
}

// ---------- Customers ----------
export interface CustomerView {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  tags: string[];
  addressLine: string | null;
  hasPortalAccount: boolean;
  bookingsCount: number;
  ltvCents: number;
  lastBookingAt: string | null;
  createdAt: string;
}

// ---------- Team ----------
export interface EmployeeView {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  color: string;
  active: boolean;
  invited: boolean;
  hourlyRateCents: number | null;
  commissionPct: number | null;
  jobsThisMonth: number;
  utilization: number;
  earningsMonthCents: number;
  serviceCount: number;
}

// ---------- Bookings ----------
export interface BookingView {
  id: string;
  reference: string;
  customerName: string;
  serviceName: string;
  employeeName: string;
  employeeColor: string;
  status: BookingStatus;
  startsAt: string;
  endsAt: string;
  priceCents: number;
  depositCents: number;
  addressLine: string | null;
  notes: string | null;
  source: string;
}
export interface BookingsData {
  bookings: BookingView[];
  counts: Record<BookingStatus | "all", number>;
}

// ---------- Calendar ----------
export interface CalendarEvent {
  id: string;
  title: string;
  customerName: string;
  serviceName: string;
  employeeId: string;
  employeeName: string;
  employeeColor: string;
  status: BookingStatus;
  startsAt: string;
  endsAt: string;
}
export interface CalendarData {
  events: CalendarEvent[];
  employees: Array<{ id: string; name: string; color: string }>;
}

// ---------- Invoices ----------
export interface InvoiceView {
  id: string;
  number: string;
  customerName: string;
  status: import("@/types/database").InvoiceStatus;
  totalCents: number;
  paidCents: number;
  issuedAt: string;
  dueAt: string | null;
  lineItems: Array<{ description: string; qty: number; amountCents: number }>;
}
export interface InvoicesData {
  invoices: InvoiceView[];
  outstandingCents: number;
  paidThisMonthCents: number;
  overdueCount: number;
}

// ---------- Payments ----------
export interface PaymentView {
  id: string;
  customerName: string;
  kind: "payment" | "deposit" | "refund";
  status: import("@/types/database").PaymentStatus;
  amountCents: number;
  invoiceNumber: string | null;
  at: string;
}
export interface SubscriptionState {
  plan: PlanTier;
  status: import("@/types/database").SubscriptionStatus;
  priceMonthly: number;
  trialDaysLeft: number | null;
  paymentsEnabled: boolean;
}
export interface PaymentsData {
  payments: PaymentView[];
  grossCents: number;
  refundedCents: number;
  depositsHeldCents: number;
  subscription: SubscriptionState;
}

// ---------- Reports ----------
export interface ReportsData {
  revenueBars: RevenueBar[];
  bookingsBars: RevenueBar[];
  servicePopularity: Array<{ name: string; count: number; revenueCents: number }>;
  employeePerformance: Array<{
    name: string;
    color: string;
    jobs: number;
    revenueCents: number;
    utilization: number;
  }>;
  retention: { returning: number; newCustomers: number; repeatRate: number };
  totals: { revenueCents: number; bookings: number; avgTicketCents: number; noShowRate: number };
}

// ---------- Marketing ----------
export interface CouponView {
  id: string;
  code: string;
  pctOff: number | null;
  amountOffCents: number | null;
  active: boolean;
  expiresAt: string | null;
  maxRedemptions: number | null;
  redemptions: number;
}

// ---------- Widget ----------
export interface WidgetData {
  publicKey: string;
  primaryColor: string;
  radius: string;
  layout: string;
  active: boolean;
  allowedDomains: string[];
  customFields: Array<{ key: string; label: string; type: string; required: boolean }>;
  appUrl: string;
}
