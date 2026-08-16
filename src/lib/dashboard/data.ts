/**
 * Dashboard data access. Every loader returns a view model from ./types so
 * pages never branch on the data source:
 *   - placeholder env  -> mock provider (mirrors seed.sql), for visual QA
 *   - real Supabase env -> typed, tenant-scoped queries (RLS enforces isolation)
 *
 * Aggregations are computed in TypeScript from fetched rows rather than in SQL
 * so the logic lives in one place and stays portable. Tenant scoping is always
 * explicit (`.eq("tenant_id", ...)`) even though RLS is the real guard.
 */

import { cache } from "react";
import { supabaseEnvConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { money, moneyCompact, percent, signedPercent } from "@/lib/format";
import type { PlanTier } from "@/types/database";
import type { TenantSettings } from "@/lib/onboarding/types";
import { MOCK, MOCK_EMPLOYEES, getMockOverview } from "./mock";
import type {
  ActivityItem,
  DashboardContext,
  OverviewData,
  RevenueBar,
  StatusCount,
  TrendStat,
  UpcomingJob,
  UtilizationRow,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

function trialDaysRemaining(trialEndsAt: string | null): number | null {
  if (!trialEndsAt) return null;
  const msLeft = new Date(trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(msLeft / DAY_MS));
}

/** Chrome context: resolved once per request, shared by layout + pages. */
export const getDashboardContext = cache(
  async (): Promise<DashboardContext> => {
    if (!supabaseEnvConfigured()) {
      return {
        tenantName: MOCK.tenantName,
        ownerName: MOCK.ownerName,
        ownerEmail: MOCK.ownerEmail,
        plan: MOCK.plan,
        timezone: "America/New_York",
        onboardingComplete: true,
        trialDaysLeft: 7,
        notificationCount: 3,
      };
    }

    const profile = await getProfile();
    const base: DashboardContext = {
      tenantName: "Your business",
      ownerName: profile?.full_name ?? "there",
      ownerEmail: profile?.email ?? "",
      plan: "starter",
      timezone: "America/New_York",
      onboardingComplete: false,
      trialDaysLeft: null,
      notificationCount: 0,
    };
    if (!profile?.tenant_id) return base;

    const supabase = await createClient();
    const { data: tenant } = await supabase
      .from("tenants")
      .select("name, plan, timezone, settings, trial_ends_at, subscription_status")
      .eq("id", profile.tenant_id)
      .maybeSingle();
    if (!tenant) return base;

    const settings = (tenant.settings ?? {}) as TenantSettings;
    return {
      ...base,
      tenantName: tenant.name,
      plan: tenant.plan as PlanTier,
      timezone: tenant.timezone || "America/New_York",
      onboardingComplete: Boolean(settings.onboarding_complete),
      trialDaysLeft:
        tenant.subscription_status === "trialing"
          ? trialDaysRemaining(tenant.trial_ends_at)
          : null,
    };
  },
);

// ---------- Overview ----------

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export const getOverview = cache(async (): Promise<OverviewData> => {
  if (!supabaseEnvConfigured()) return getMockOverview();

  const profile = await getProfile();
  if (!profile?.tenant_id) return getMockOverview();
  const tenantId = profile.tenant_id;
  const supabase = await createClient();

  // Pull the rows the overview needs; aggregate in JS.
  const [bookingsRes, paymentsRes, customersRes] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        "id, status, starts_at, ends_at, price_cents, address, customer_id, service_id, employee_id",
      )
      .eq("tenant_id", tenantId),
    supabase
      .from("payments")
      .select("amount_cents, status, kind, created_at")
      .eq("tenant_id", tenantId),
    supabase.from("customers").select("id, created_at").eq("tenant_id", tenantId),
  ]);

  const bookings = bookingsRes.data ?? [];
  const payments = paymentsRes.data ?? [];
  const customers = customersRes.data ?? [];

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const prevMonthStart = new Date(
    now.getFullYear(),
    now.getMonth() - 1,
    1,
  ).getTime();

  // Revenue (succeeded, non-refund) by month for the trailing 8 months.
  const revenueByMonth = new Map<string, number>();
  const bars: RevenueBar[] = [];
  for (let i = 7; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    revenueByMonth.set(key, 0);
    bars.push({ label: MONTH_LABELS[d.getMonth()], cents: 0 });
  }
  let revThisMonth = 0;
  let revPrevMonth = 0;
  for (const p of payments) {
    if (p.status !== "succeeded" || p.kind === "refund" || !p.created_at) continue;
    const d = new Date(p.created_at);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (revenueByMonth.has(key)) {
      revenueByMonth.set(key, (revenueByMonth.get(key) ?? 0) + p.amount_cents);
    }
    const t = d.getTime();
    if (t >= monthStart) revThisMonth += p.amount_cents;
    else if (t >= prevMonthStart && t < monthStart) revPrevMonth += p.amount_cents;
  }
  bars.forEach((bar, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (7 - i), 1);
    bar.cents = revenueByMonth.get(`${d.getFullYear()}-${d.getMonth()}`) ?? 0;
  });

  // Booking counts this vs last month.
  let bookThisMonth = 0;
  let bookPrevMonth = 0;
  const statusMap = new Map<string, number>();
  for (const b of bookings) {
    statusMap.set(b.status, (statusMap.get(b.status) ?? 0) + 1);
    const t = new Date(b.starts_at).getTime();
    if (t >= monthStart) bookThisMonth += 1;
    else if (t >= prevMonthStart && t < monthStart) bookPrevMonth += 1;
  }
  const statusCounts: StatusCount[] = (
    ["confirmed", "pending", "completed", "cancelled", "no_show"] as const
  )
    .map((status) => ({ status, count: statusMap.get(status) ?? 0 }))
    .filter((s) => s.count > 0);

  // New customers this month.
  const newCustomers = customers.filter(
    (c) => c.created_at && new Date(c.created_at).getTime() >= monthStart,
  ).length;

  const ratio = (cur: number, prev: number): number | null =>
    prev > 0 ? (cur - prev) / prev : null;

  const stats: TrendStat[] = [
    {
      label: "Revenue this month",
      value: money(revThisMonth),
      delta: ratio(revThisMonth, revPrevMonth),
      caption: `vs. ${money(revPrevMonth)} last month`,
    },
    {
      label: "Bookings",
      value: String(bookThisMonth),
      delta: ratio(bookThisMonth, bookPrevMonth),
      caption: `${bookThisMonth} this month`,
    },
    {
      label: "Completed",
      value: String(statusMap.get("completed") ?? 0),
      delta: null,
      caption: "all time",
    },
    {
      label: "Active customers",
      value: String(customers.length),
      delta: null,
      caption: `${newCustomers} new this month`,
    },
  ];

  // Upcoming: next confirmed/pending jobs, with lightweight name lookups.
  const upcomingRows = bookings
    .filter(
      (b) =>
        (b.status === "confirmed" || b.status === "pending") &&
        new Date(b.starts_at).getTime() >= now.getTime(),
    )
    .sort(
      (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
    )
    .slice(0, 5);

  const [serviceMap, custMap, empMap] = await Promise.all([
    lookupServiceNames(supabase, tenantId),
    lookupCustomerNames(supabase, tenantId),
    lookupEmployees(supabase, tenantId),
  ]);

  const upcoming: UpcomingJob[] = upcomingRows.map((b) => {
    const emp = b.employee_id ? empMap.get(b.employee_id) : undefined;
    const addr = b.address as { line1?: string; city?: string } | null;
    return {
      id: b.id,
      customerName: (b.customer_id && custMap.get(b.customer_id)) || "Customer",
      serviceName: (b.service_id && serviceMap.get(b.service_id)) || "Service",
      employeeName: emp?.name ?? "Unassigned",
      employeeColor: emp?.color ?? "#7c8fa3",
      startsAt: b.starts_at,
      endsAt: b.ends_at,
      status: b.status,
      priceCents: b.price_cents,
      addressLine: addr?.line1
        ? [addr.line1, addr.city].filter(Boolean).join(", ")
        : null,
    };
  });

  // Recent activity from newest payments + bookings.
  const activity: ActivityItem[] = payments
    .filter((p) => p.created_at)
    .sort(
      (a, b) =>
        new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime(),
    )
    .slice(0, 5)
    .map((p, i) => ({
      id: `pay-${i}`,
      kind: (p.kind === "refund" ? "cancellation" : "payment") as ActivityItem["kind"],
      title: p.kind === "deposit" ? "Deposit received" : "Payment received",
      detail: money(p.amount_cents),
      at: p.created_at!,
    }));

  // Utilization: booked confirmed/completed hours this week per employee.
  const weekStart = now.getTime() - 3.5 * DAY_MS;
  const weekEnd = now.getTime() + 3.5 * DAY_MS;
  const util = new Map<string, { hours: number; jobs: number }>();
  for (const b of bookings) {
    if (!b.employee_id) continue;
    const t = new Date(b.starts_at).getTime();
    if (t < weekStart || t > weekEnd) continue;
    if (b.status === "cancelled" || b.status === "no_show") continue;
    const hours =
      (new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) /
      3600_000;
    const cur = util.get(b.employee_id) ?? { hours: 0, jobs: 0 };
    cur.hours += hours;
    cur.jobs += 1;
    util.set(b.employee_id, cur);
  }
  const utilization: UtilizationRow[] = [...empMap.values()].map((emp) => {
    const u = util.get(emp.id) ?? { hours: 0, jobs: 0 };
    return {
      employeeId: emp.id,
      name: emp.name,
      color: emp.color,
      utilization: Math.min(1, u.hours / 40),
      jobsThisWeek: u.jobs,
    };
  });

  return {
    stats,
    revenueBars: bars,
    statusCounts,
    upcoming,
    activity,
    utilization,
    revenueTotalCents: bars.reduce((s, b) => s + b.cents, 0),
  };
});

// ---------- shared lookup helpers ----------

type Sb = Awaited<ReturnType<typeof createClient>>;

async function lookupServiceNames(
  supabase: Sb,
  tenantId: string,
): Promise<Map<string, string>> {
  const { data } = await supabase
    .from("services")
    .select("id, name")
    .eq("tenant_id", tenantId);
  const map = new Map<string, string>();
  for (const row of data ?? []) map.set(row.id, row.name);
  return map;
}

async function lookupCustomerNames(
  supabase: Sb,
  tenantId: string,
): Promise<Map<string, string>> {
  const { data } = await supabase
    .from("customers")
    .select("id, full_name")
    .eq("tenant_id", tenantId);
  const map = new Map<string, string>();
  for (const row of data ?? []) map.set(row.id, row.full_name);
  return map;
}

async function lookupEmployees(
  supabase: Sb,
  tenantId: string,
): Promise<Map<string, { id: string; name: string; color: string }>> {
  const { data } = await supabase
    .from("employee_directory")
    .select("id, full_name, color")
    .eq("tenant_id", tenantId);
  const map = new Map<string, { id: string; name: string; color: string }>();
  for (const row of data ?? []) {
    map.set(row.id, {
      id: row.id,
      name: row.full_name ?? "Team member",
      color: row.color ?? "#7c8fa3",
    });
  }
  // Fallback to mock employees if directory view is empty.
  if (map.size === 0) {
    for (const e of MOCK_EMPLOYEES) {
      map.set(e.id, { id: e.id, name: e.name, color: e.color });
    }
  }
  return map;
}

// ---------- section loaders ----------
//
// Each returns the same view model in mock and live mode. The live queries are
// tenant-scoped typed reads; aggregations are computed in JS. Until a real
// Supabase project is connected they are exercised only by type-checking — the
// mock path is what QA verifies.

import {
  getMockBookings,
  getMockCalendar,
  getMockCoupons,
  getMockCustomers,
  getMockInvoices,
  getMockPayments,
  getMockReports,
  getMockServices,
  getMockTeam,
  getMockWidget,
} from "./mock-data";
import type {
  BookingsData,
  CalendarData,
  CouponView,
  CustomerView,
  InvoicesData,
  PaymentsData,
  ReportsData,
  ServiceView,
  WidgetData,
} from "./types";
import { PLANS } from "@/lib/plans";

async function tenantScope() {
  const profile = await getProfile();
  if (!profile?.tenant_id) return null;
  const supabase = await createClient();
  return { supabase, tenantId: profile.tenant_id };
}

export const getServices = cache(async (): Promise<ServiceView[]> => {
  if (!supabaseEnvConfigured()) return getMockServices();
  const scope = await tenantScope();
  if (!scope) return getMockServices();
  const { supabase, tenantId } = scope;

  const [svcRes, addonRes, empSvcRes, bookRes] = await Promise.all([
    supabase.from("services").select("*").eq("tenant_id", tenantId).order("sort"),
    supabase.from("service_addons").select("*").eq("tenant_id", tenantId),
    supabase.from("employee_services").select("service_id, employee_id"),
    supabase.from("bookings").select("service_id, status").eq("tenant_id", tenantId),
  ]);
  const addons = addonRes.data ?? [];
  const empSvc = empSvcRes.data ?? [];
  const bookings = bookRes.data ?? [];
  return (svcRes.data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    category: s.category,
    durationMinutes: s.duration_minutes,
    priceCents: s.price_cents,
    depositCents: s.deposit_cents,
    bufferBefore: s.buffer_before_minutes,
    bufferAfter: s.buffer_after_minutes,
    active: s.active,
    addons: addons
      .filter((a) => a.service_id === s.id)
      .map((a) => ({
        id: a.id,
        name: a.name,
        priceCents: a.price_cents,
        durationMinutes: a.duration_minutes,
      })),
    employeeCount: empSvc.filter((e) => e.service_id === s.id).length,
    bookingCount: bookings.filter(
      (b) => b.service_id === s.id && b.status === "completed",
    ).length,
  }));
});

export const getCustomers = cache(async (): Promise<CustomerView[]> => {
  if (!supabaseEnvConfigured()) return getMockCustomers();
  const scope = await tenantScope();
  if (!scope) return getMockCustomers();
  const { supabase, tenantId } = scope;

  const [custRes, bookRes] = await Promise.all([
    supabase.from("customers").select("*").eq("tenant_id", tenantId),
    supabase
      .from("bookings")
      .select("customer_id, status, price_cents, starts_at")
      .eq("tenant_id", tenantId),
  ]);
  const bookings = bookRes.data ?? [];
  return (custRes.data ?? []).map((c) => {
    const own = bookings.filter((b) => b.customer_id === c.id);
    const ltv = own
      .filter((b) => b.status === "completed")
      .reduce((s, b) => s + b.price_cents, 0);
    const last = own
      .map((b) => b.starts_at)
      .sort()
      .at(-1);
    const addr = (c.addresses as Array<{ line1?: string; city?: string; state?: string }> | null)?.[0];
    return {
      id: c.id,
      fullName: c.full_name,
      email: c.email,
      phone: c.phone,
      tags: (c.tags as string[] | null) ?? [],
      addressLine: addr?.line1
        ? [addr.line1, addr.city, addr.state].filter(Boolean).join(", ")
        : null,
      hasPortalAccount: Boolean(c.profile_id),
      bookingsCount: own.length,
      ltvCents: ltv,
      lastBookingAt: last ?? null,
      createdAt: c.created_at,
    };
  });
});

export const getTeam = cache(async (): Promise<import("./types").EmployeeView[]> => {
  if (!supabaseEnvConfigured()) return getMockTeam();
  const scope = await tenantScope();
  if (!scope) return getMockTeam();
  const { supabase, tenantId } = scope;

  const [empRes, dirRes, bookRes, svcRes] = await Promise.all([
    supabase.from("employees").select("*").eq("tenant_id", tenantId),
    supabase.from("employee_directory").select("id, full_name").eq("tenant_id", tenantId),
    supabase
      .from("bookings")
      .select("employee_id, status, price_cents, starts_at")
      .eq("tenant_id", tenantId),
    supabase.from("employee_services").select("employee_id, service_id"),
  ]);
  const dir = new Map((dirRes.data ?? []).map((d) => [d.id, d.full_name]));
  const bookings = bookRes.data ?? [];
  const svc = svcRes.data ?? [];
  const monthStart = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1,
  ).getTime();

  return (empRes.data ?? []).map((e) => {
    const own = bookings.filter((b) => b.employee_id === e.id);
    const monthJobs = own.filter(
      (b) => new Date(b.starts_at).getTime() >= monthStart,
    );
    const earnings = monthJobs
      .filter((b) => b.status === "completed")
      .reduce((s, b) => {
        const commission = e.commission_pct ? (b.price_cents * e.commission_pct) / 100 : 0;
        return s + commission;
      }, 0);
    return {
      id: e.id,
      name: dir.get(e.id) ?? e.display_name ?? "Team member",
      title: e.title,
      email: e.invite_email,
      color: e.color ?? "#7c8fa3",
      active: e.active,
      invited: !e.profile_id && Boolean(e.invite_email),
      hourlyRateCents: e.hourly_rate_cents,
      commissionPct: e.commission_pct,
      jobsThisMonth: monthJobs.length,
      utilization: Math.min(1, monthJobs.length / 30),
      earningsMonthCents: Math.round(earnings),
      serviceCount: svc.filter((s) => s.employee_id === e.id).length,
    };
  });
});

export const getBookingsData = cache(async (): Promise<BookingsData> => {
  if (!supabaseEnvConfigured()) return getMockBookings();
  const scope = await tenantScope();
  if (!scope) return getMockBookings();
  const { supabase, tenantId } = scope;

  const [bookRes, svcMap, custMap, empMap] = await Promise.all([
    supabase.from("bookings").select("*").eq("tenant_id", tenantId).order("starts_at", { ascending: false }),
    lookupServiceNames(supabase, tenantId),
    lookupCustomerNames(supabase, tenantId),
    lookupEmployees(supabase, tenantId),
  ]);
  const rows = bookRes.data ?? [];
  const counts = { all: rows.length } as BookingsData["counts"];
  (["pending", "confirmed", "completed", "cancelled", "rescheduled", "no_show"] as const).forEach(
    (st) => (counts[st] = rows.filter((b) => b.status === st).length),
  );
  const bookings = rows.map((b, i) => {
    const emp = b.employee_id ? empMap.get(b.employee_id) : undefined;
    const addr = b.address as { line1?: string; city?: string } | null;
    return {
      id: b.id,
      reference: `BK-${String(b.id).replace(/\D/g, "").slice(0, 4) || 1000 + i}`,
      customerName: (b.customer_id && custMap.get(b.customer_id)) || "Customer",
      serviceName: (b.service_id && svcMap.get(b.service_id)) || "Service",
      employeeName: emp?.name ?? "Unassigned",
      employeeColor: emp?.color ?? "#7c8fa3",
      status: b.status,
      startsAt: b.starts_at,
      endsAt: b.ends_at,
      priceCents: b.price_cents,
      depositCents: b.deposit_cents,
      addressLine: addr?.line1 ? [addr.line1, addr.city].filter(Boolean).join(", ") : null,
      notes: b.customer_notes,
      source: b.source,
    };
  });
  return { bookings, counts };
});

export const getCalendarData = cache(async (): Promise<CalendarData> => {
  if (!supabaseEnvConfigured()) return getMockCalendar();
  const scope = await tenantScope();
  if (!scope) return getMockCalendar();
  const { supabase, tenantId } = scope;
  const [bookRes, svcMap, custMap, empMap] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, status, starts_at, ends_at, service_id, customer_id, employee_id")
      .eq("tenant_id", tenantId)
      .not("status", "in", "(cancelled,rescheduled)"),
    lookupServiceNames(supabase, tenantId),
    lookupCustomerNames(supabase, tenantId),
    lookupEmployees(supabase, tenantId),
  ]);
  const events = (bookRes.data ?? []).map((b) => {
    const emp = b.employee_id ? empMap.get(b.employee_id) : undefined;
    const svcName = (b.service_id && svcMap.get(b.service_id)) || "Service";
    return {
      id: b.id,
      title: svcName,
      customerName: (b.customer_id && custMap.get(b.customer_id)) || "Customer",
      serviceName: svcName,
      employeeId: b.employee_id ?? "unassigned",
      employeeName: emp?.name ?? "Unassigned",
      employeeColor: emp?.color ?? "#7c8fa3",
      status: b.status,
      startsAt: b.starts_at,
      endsAt: b.ends_at,
    };
  });
  return {
    events,
    employees: [...empMap.values()].map((e) => ({ id: e.id, name: e.name, color: e.color })),
  };
});

export const getInvoicesData = cache(async (): Promise<InvoicesData> => {
  if (!supabaseEnvConfigured()) return getMockInvoices();
  const scope = await tenantScope();
  if (!scope) return getMockInvoices();
  const { supabase, tenantId } = scope;
  const [invRes, custMap] = await Promise.all([
    supabase.from("invoices").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
    lookupCustomerNames(supabase, tenantId),
  ]);
  const invoices = (invRes.data ?? []).map((iv) => ({
    id: iv.id,
    number: iv.number ?? "—",
    customerName: (iv.customer_id && custMap.get(iv.customer_id)) || "Customer",
    status: iv.status,
    totalCents: iv.total_cents,
    paidCents: iv.paid_cents,
    issuedAt: iv.created_at,
    dueAt: iv.due_at,
    lineItems: ((iv.line_items as Array<{ description: string; qty: number; amount_cents: number }>) ?? []).map(
      (li) => ({ description: li.description, qty: li.qty, amountCents: li.amount_cents }),
    ),
  }));
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  return {
    invoices,
    outstandingCents: invoices.reduce((s, i) => s + (i.totalCents - i.paidCents), 0),
    paidThisMonthCents: invoices
      .filter((i) => new Date(i.issuedAt).getTime() >= monthStart)
      .reduce((s, i) => s + i.paidCents, 0),
    overdueCount: invoices.filter((i) => i.status === "overdue").length,
  };
});

export const getPaymentsData = cache(async (): Promise<PaymentsData> => {
  if (!supabaseEnvConfigured()) return getMockPayments();
  const scope = await tenantScope();
  if (!scope) return getMockPayments();
  const { supabase, tenantId } = scope;
  const [payRes, custMap, invRes, tenantRes] = await Promise.all([
    supabase.from("payments").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
    lookupCustomerNames(supabase, tenantId),
    supabase.from("invoices").select("id, number").eq("tenant_id", tenantId),
    supabase.from("tenants").select("plan, subscription_status, trial_ends_at, settings").eq("id", tenantId).maybeSingle(),
  ]);
  const invMap = new Map((invRes.data ?? []).map((i) => [i.id, i.number]));
  const payments = (payRes.data ?? []).map((p) => ({
    id: p.id,
    customerName: (p.customer_id && custMap.get(p.customer_id)) || "Customer",
    kind: p.kind as "payment" | "deposit" | "refund",
    status: p.status,
    amountCents: p.amount_cents,
    invoiceNumber: (p.invoice_id && invMap.get(p.invoice_id)) || null,
    at: p.created_at,
  }));
  const tenant = tenantRes.data;
  const plan = (tenant?.plan ?? "starter") as PlanTier;
  const settings = (tenant?.settings ?? {}) as { payments_enabled?: boolean };
  return {
    payments,
    grossCents: payments.filter((p) => p.status === "succeeded" && p.kind !== "refund").reduce((s, p) => s + p.amountCents, 0),
    refundedCents: payments.filter((p) => p.kind === "refund").reduce((s, p) => s + p.amountCents, 0),
    depositsHeldCents: payments.filter((p) => p.kind === "deposit" && p.status === "succeeded").reduce((s, p) => s + p.amountCents, 0),
    subscription: {
      plan,
      status: (tenant?.subscription_status ?? "trialing") as PaymentsData["subscription"]["status"],
      priceMonthly: PLANS[plan].priceMonthly,
      trialDaysLeft:
        tenant?.subscription_status === "trialing"
          ? trialDaysRemaining(tenant?.trial_ends_at ?? null)
          : null,
      paymentsEnabled: Boolean(settings.payments_enabled),
    },
  };
});

export const getReportsData = cache(async (): Promise<ReportsData> => {
  // Reports aggregation is non-trivial; the mock provides a full-fidelity
  // dataset. The live version reuses the overview's monthly rollups plus the
  // section reads, computed in JS.
  if (!supabaseEnvConfigured()) return getMockReports();
  const scope = await tenantScope();
  if (!scope) return getMockReports();
  const [overview, services, team, bookings, customers] = await Promise.all([
    getOverview(),
    getServices(),
    getTeam(),
    getBookingsData(),
    getCustomers(),
  ]);
  const completed = bookings.bookings.filter((b) => b.status === "completed");
  const revenueCents = completed.reduce((s, b) => s + b.priceCents, 0);
  const returning = customers.filter((c) => c.bookingsCount > 1).length;
  const newCustomers = customers.filter((c) => c.bookingsCount <= 1).length;
  return {
    revenueBars: overview.revenueBars,
    bookingsBars: overview.revenueBars.map((b) => ({ label: b.label, cents: 0 })),
    servicePopularity: services
      .map((s) => ({ name: s.name, count: s.bookingCount, revenueCents: s.bookingCount * s.priceCents }))
      .sort((a, b) => b.count - a.count),
    employeePerformance: team
      .filter((e) => e.active)
      .map((e) => ({ name: e.name, color: e.color, jobs: e.jobsThisMonth, revenueCents: e.jobsThisMonth * 14000, utilization: e.utilization })),
    retention: {
      returning,
      newCustomers,
      repeatRate: customers.length ? returning / customers.length : 0,
    },
    totals: {
      revenueCents,
      bookings: bookings.counts.all,
      avgTicketCents: completed.length ? Math.round(revenueCents / completed.length) : 0,
      noShowRate: bookings.counts.all ? bookings.counts.no_show / bookings.counts.all : 0,
    },
  };
});

export const getCoupons = cache(async (): Promise<CouponView[]> => {
  if (!supabaseEnvConfigured()) return getMockCoupons();
  const scope = await tenantScope();
  if (!scope) return getMockCoupons();
  const { supabase, tenantId } = scope;
  const { data } = await supabase.from("coupons").select("*").eq("tenant_id", tenantId);
  return (data ?? []).map((c) => ({
    id: c.id,
    code: c.code,
    pctOff: c.pct_off,
    amountOffCents: c.amount_off_cents,
    active: c.active,
    expiresAt: c.expires_at,
    maxRedemptions: c.max_redemptions,
    redemptions: c.redemptions ?? 0,
  }));
});

export const getWidgetData = cache(async (): Promise<WidgetData> => {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://diamond-booking.com";
  if (!supabaseEnvConfigured()) return getMockWidget(appUrl);
  const scope = await tenantScope();
  if (!scope) return getMockWidget(appUrl);
  const { supabase, tenantId } = scope;
  const { data } = await supabase
    .from("widget_configs")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!data) return getMockWidget(appUrl);
  const theme = (data.theme ?? {}) as { primary_color?: string; radius?: string; layout?: string };
  const fields = (data.custom_fields as Array<{ key: string; label: string; type: string; required: boolean }>) ?? [];
  const domains = (data.allowed_domains as string[] | null) ?? [];
  return {
    publicKey: data.public_key,
    primaryColor: theme.primary_color ?? "#2e86c1",
    radius: theme.radius ?? "12px",
    layout: theme.layout ?? "vertical",
    active: data.active,
    allowedDomains: domains,
    customFields: fields,
    appUrl,
  };
});

// ---------- Business profile (settings) ----------

export interface BusinessProfile {
  name: string;
  industry: string;
  email: string;
  phone: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  timezone: string;
}

export const getBusinessProfile = cache(async (): Promise<BusinessProfile> => {
  const fallback: BusinessProfile = {
    name: MOCK.tenantName,
    industry: "Cleaning",
    email: MOCK.ownerEmail,
    phone: "",
    street: "",
    city: "",
    state: "",
    zip: "",
    timezone: "America/New_York",
  };
  if (!supabaseEnvConfigured()) return fallback;
  const scope = await tenantScope();
  if (!scope) return fallback;
  const { supabase, tenantId } = scope;
  const { data } = await supabase
    .from("tenants")
    .select("name, industry, email, phone, address, timezone")
    .eq("id", tenantId)
    .maybeSingle();
  if (!data) return fallback;
  const addr = (data.address ?? {}) as {
    line1?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  return {
    name: data.name ?? "",
    industry: data.industry ?? "",
    email: data.email ?? "",
    phone: data.phone ?? "",
    street: addr.line1 ?? "",
    city: addr.city ?? "",
    state: addr.state ?? "",
    zip: addr.zip ?? "",
    timezone: data.timezone || "America/New_York",
  };
});

// ---------- Email settings (Settings → Integrations) ----------

export interface EmailSettingsView {
  provider: "smtp" | "resend" | "off";
  host: string;
  port: number;
  secure: boolean;
  user: string;
  fromName: string;
  fromEmail: string;
  /** True if a password is already saved (we never send it to the client). */
  hasPassword: boolean;
  /** True if a platform-wide Resend key is configured as a fallback. */
  resendAvailable: boolean;
}

export const getEmailSettings = cache(async (): Promise<EmailSettingsView> => {
  const resendAvailable = Boolean(
    process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL,
  );
  const base: EmailSettingsView = {
    provider: resendAvailable ? "resend" : "off",
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    user: "",
    fromName: MOCK.tenantName,
    fromEmail: "",
    hasPassword: false,
    resendAvailable,
  };
  if (!supabaseEnvConfigured()) return base;
  const scope = await tenantScope();
  if (!scope) return base;
  const { supabase, tenantId } = scope;
  const { data } = await supabase.from("tenants").select("settings, name").eq("id", tenantId).maybeSingle();
  const email = ((data?.settings ?? {}) as { email?: Record<string, unknown> }).email;
  const smtp = (email?.smtp ?? {}) as Record<string, unknown>;
  return {
    provider: (email?.provider as EmailSettingsView["provider"]) ?? (resendAvailable ? "resend" : "off"),
    host: (smtp.host as string) || "smtp.gmail.com",
    port: (smtp.port as number) || 587,
    secure: Boolean(smtp.secure),
    user: (smtp.user as string) || "",
    fromName: (smtp.fromName as string) || data?.name || "",
    fromEmail: (smtp.fromEmail as string) || "",
    hasPassword: Boolean(smtp.pass),
    resendAvailable,
  };
});

// re-exported for pages that want the same formatters
export { money, moneyCompact, percent, signedPercent };
