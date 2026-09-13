import type { Json } from "@/types/database";
import { createAdminClient } from "@/lib/supabase/server";
import type { LaunchReadiness } from "@/lib/onboarding/types";

export interface AdminTenant {
  id: string;
  name: string;
  ownerName: string;
  ownerEmail: string;
  plan: "starter" | "professional" | "elite";
  status: "active" | "trialing" | "past_due" | "suspended";
  lifecycle: "trialing" | "activating" | "live" | "at_risk" | "past_due" | "suspended";
  healthScore: number;
  healthTier: "healthy" | "watch" | "at_risk" | "critical";
  mrrCents: number;
  employees: number;
  bookings30d: number;
  joinedAt: string;
  lastActiveAt: string;
  onboardingProgress: number;
  supportPriority: "normal" | "elevated" | "urgent";
  paymentStatus: "ok" | "action_needed" | "past_due";
  widgetPublished: boolean;
  firstBookingAt: string | null;
  suspended: boolean;
  businessCategory: string;
  timezone: string;
  notes: string[];
  activityTimeline: Array<{ id: string; label: string; detail: string; at: string }>;
  nextFollowUpAt: string | null;
  launchReadiness: LaunchReadiness;
}

export interface AdminData {
  metrics: {
    mrrCents: number;
    arrCents: number;
    tenants: number;
    activeTenants: number;
    churnRate: number;
    trialConversions: number;
    failedPayments: number;
    atRiskTenants: number;
    supportBacklog: number;
    onboardingStarts: number;
    onboardingCompletionRate: number;
    widgetPublishRate: number;
    firstBookingRate: number;
    activeWidgetRate: number;
    recurringAdoptionRate: number;
  };
  mrrBars: Array<{ label: string; cents: number }>;
  tenants: AdminTenant[];
  healthSegments: Array<{ label: string; value: number; color: string }>;
  funnel: Array<{ label: string; value: number }>;
  attention: Array<{ id: string; kind: "billing" | "onboarding" | "usage" | "support"; tenant: string; detail: string; priority: "high" | "medium" }>;
  revenueBreakdown: Array<{ label: string; cents: number }>;
  failedInvoices: Array<{ id: string; tenant: string; amountCents: number; attempts: number; dueAt: string }>;
  onboardingExceptions: Array<{ id: string; tenant: string; stage: string; daysStuck: number; recommendedAction: string }>;
  supportQueue: Array<{ id: string; tenant: string; issue: string; severity: "high" | "medium" | "low"; owner: string; nextAction: string }>;
  featureFlags: Array<{ key: string; description: string; enabled: boolean }>;
  audit: Array<{ id: string; actor: string; action: string; target: string; at: string }>;
}

function asObject(value: Json | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function toIsoMonthLabel(date: Date) {
  return date.toLocaleString("en-US", { month: "short" });
}

function normalizeStatus(status: string, suspended: boolean): AdminTenant["status"] {
  if (suspended) return "suspended";
  if (status === "past_due") return "past_due";
  if (status === "trialing") return "trialing";
  return "active";
}

function scoreHealth(input: { onboardingProgress: number; paymentStatus: AdminTenant["paymentStatus"]; bookings30d: number; lastActiveAt: string; suspended: boolean }) {
  if (input.suspended) return { score: 12, tier: "critical" as const };
  const daysSinceActive = Math.max(0, Math.floor((Date.now() - new Date(input.lastActiveAt).getTime()) / 86400000));
  let score = 45;
  score += Math.round(input.onboardingProgress * 25);
  score += Math.min(20, input.bookings30d / 4);
  if (input.paymentStatus === "ok") score += 10;
  if (input.paymentStatus === "action_needed") score -= 6;
  if (input.paymentStatus === "past_due") score -= 16;
  score -= Math.min(18, daysSinceActive * 3);
  const clamped = Math.max(8, Math.min(97, Math.round(score)));
  if (clamped >= 80) return { score: clamped, tier: "healthy" as const };
  if (clamped >= 60) return { score: clamped, tier: "watch" as const };
  if (clamped >= 35) return { score: clamped, tier: "at_risk" as const };
  return { score: clamped, tier: "critical" as const };
}

function computeLifecycle(status: AdminTenant["status"], onboardingProgress: number, healthTier: AdminTenant["healthTier"], suspended: boolean): AdminTenant["lifecycle"] {
  if (suspended) return "suspended";
  if (status === "past_due") return "past_due";
  if (status === "trialing") return onboardingProgress >= 0.8 ? "activating" : "trialing";
  if (healthTier === "at_risk" || healthTier === "critical") return "at_risk";
  return "live";
}

function buildLaunchReadiness(input: {
  onboardingProgress: number;
  onboardingComplete: boolean;
  widgetPublished: boolean;
  firstBookingAt: string | null;
  paymentStatus: AdminTenant["paymentStatus"];
  nextFollowUpAt: string | null;
}): LaunchReadiness {
  const blockers: string[] = [];
  if (!input.onboardingComplete) blockers.push("Finish onboarding");
  if (!input.widgetPublished) blockers.push("Publish the booking widget");
  if (input.paymentStatus !== "ok") blockers.push("Review billing and payment setup");
  if (!input.firstBookingAt) blockers.push("Complete a first booking test");
  return {
    onboardingProgress: input.onboardingProgress,
    onboardingComplete: input.onboardingComplete,
    widgetPublished: input.widgetPublished,
    firstBookingAt: input.firstBookingAt,
    paymentStatus: input.paymentStatus,
    nextFollowUpAt: input.nextFollowUpAt,
    blockers,
    status: blockers.length === 0 ? "ready" : input.onboardingComplete ? "needs_attention" : "not_ready",
  };
}

export async function getAdminData(): Promise<AdminData> {
  const admin = createAdminClient();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString();

  const [
    tenantsResult,
    profilesResult,
    employeesResult,
    bookingsResult,
    invoicesResult,
    widgetConfigsResult,
    featureFlagsResult,
    auditResult,
  ] = await Promise.all([
    admin.from("tenants").select("id, name, industry, timezone, plan, subscription_status, suspended, created_at, updated_at, settings"),
    admin.from("profiles").select("id, tenant_id, full_name, email, role, created_at"),
    admin.from("employees").select("id, tenant_id, active"),
    admin.from("bookings").select("id, tenant_id, status, starts_at, created_at, updated_at, price_cents, deposit_cents").order("starts_at", { ascending: false }),
    admin.from("invoices").select("id, tenant_id, status, total_cents, due_at, created_at"),
    admin.from("widget_configs").select("tenant_id, active, created_at"),
    admin.from("feature_flags").select("key, description, enabled"),
    admin.from("audit_logs").select("id, tenant_id, actor_id, action, entity, entity_id, meta, created_at").order("created_at", { ascending: false }).limit(100),
  ]);

  if (tenantsResult.error) throw tenantsResult.error;
  if (profilesResult.error) throw profilesResult.error;
  if (employeesResult.error) throw employeesResult.error;
  if (bookingsResult.error) throw bookingsResult.error;
  if (invoicesResult.error) throw invoicesResult.error;
  if (widgetConfigsResult.error) throw widgetConfigsResult.error;
  if (featureFlagsResult.error) throw featureFlagsResult.error;
  if (auditResult.error) throw auditResult.error;

  const tenantsRows = tenantsResult.data ?? [];
  const profiles = profilesResult.data ?? [];
  const employees = employeesResult.data ?? [];
  const bookings = bookingsResult.data ?? [];
  const invoices = invoicesResult.data ?? [];
  const widgetConfigs = widgetConfigsResult.data ?? [];
  const featureFlags = featureFlagsResult.data ?? [];
  const auditRows = auditResult.data ?? [];

  const ownerByTenant = new Map(
    profiles.filter((profile) => profile.role === "business_owner" && profile.tenant_id).map((profile) => [profile.tenant_id as string, profile]),
  );
  const actorById = new Map(profiles.map((profile) => [profile.id, profile.full_name || profile.email || "Unknown"]));
  const employeeCountByTenant = new Map<string, number>();
  for (const employee of employees) {
    if (!employee.active) continue;
    employeeCountByTenant.set(employee.tenant_id, (employeeCountByTenant.get(employee.tenant_id) ?? 0) + 1);
  }

  const recentBookingsByTenant = new Map<string, typeof bookings>();
  const allBookingsByTenant = new Map<string, typeof bookings>();
  for (const booking of bookings) {
    allBookingsByTenant.set(booking.tenant_id, [...(allBookingsByTenant.get(booking.tenant_id) ?? []), booking]);
    if (booking.starts_at >= thirtyDaysAgo) {
      recentBookingsByTenant.set(booking.tenant_id, [...(recentBookingsByTenant.get(booking.tenant_id) ?? []), booking]);
    }
  }

  const invoicesByTenant = new Map<string, typeof invoices>();
  for (const invoice of invoices) {
    invoicesByTenant.set(invoice.tenant_id, [...(invoicesByTenant.get(invoice.tenant_id) ?? []), invoice]);
  }

  const widgetByTenant = new Map(widgetConfigs.map((config) => [config.tenant_id, config]));
  const auditByTenant = new Map<string, typeof auditRows>();
  for (const row of auditRows) {
    if (!row.tenant_id) continue;
    auditByTenant.set(row.tenant_id, [...(auditByTenant.get(row.tenant_id) ?? []), row]);
  }

  const tenants: AdminTenant[] = tenantsRows.map((tenant) => {
    const settings = asObject(tenant.settings);
    const owner = ownerByTenant.get(tenant.id);
    const tenantBookings = allBookingsByTenant.get(tenant.id) ?? [];
    const bookings30d = recentBookingsByTenant.get(tenant.id)?.length ?? 0;
    const firstBookingAt = [...tenantBookings].sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0]?.starts_at ?? null;
    const lastActiveAt = tenantBookings[0]?.updated_at ?? owner?.created_at ?? tenant.updated_at ?? tenant.created_at;
    const onboardingStep = Number(settings.onboarding_step ?? 0);
    const onboardingComplete = Boolean(settings.onboarding_complete ?? false);
    const onboardingProgress = onboardingComplete ? 1 : Math.max(0, Math.min(1, onboardingStep / 6));
    const latestInvoices = invoicesByTenant.get(tenant.id) ?? [];
    const paymentStatus: AdminTenant["paymentStatus"] = latestInvoices.some((invoice) => invoice.status === "overdue")
      ? "past_due"
      : latestInvoices.some((invoice) => invoice.status === "sent" || invoice.status === "draft")
        ? "action_needed"
        : "ok";
    const health = scoreHealth({
      onboardingProgress,
      paymentStatus,
      bookings30d,
      lastActiveAt,
      suspended: tenant.suspended,
    });
    const lifecycle = computeLifecycle(normalizeStatus(tenant.subscription_status, tenant.suspended), onboardingProgress, health.tier, tenant.suspended);
    const notes = (auditByTenant.get(tenant.id) ?? [])
      .filter((row) => row.action === "admin_note_added")
      .map((row) => String(asObject(row.meta).note ?? ""))
      .filter(Boolean)
      .slice(0, 6);
    const nextFollowUpAt = (auditByTenant.get(tenant.id) ?? [])
      .find((row) => row.action === "admin_follow_up_scheduled");
    const widgetPublished = Boolean(widgetByTenant.get(tenant.id)?.active);
    const activityTimeline = (auditByTenant.get(tenant.id) ?? [])
      .slice(0, 8)
      .map((row) => ({
        id: String(row.id),
        label: row.action.replaceAll("_", " ").replaceAll(".", " "),
        detail: describeAuditDetail(row.action, asObject(row.meta)),
        at: row.created_at,
      }));

    const launchReadiness = buildLaunchReadiness({
      onboardingProgress,
      onboardingComplete,
      widgetPublished,
      firstBookingAt,
      paymentStatus,
      nextFollowUpAt: nextFollowUpAt ? String(asObject(nextFollowUpAt.meta).follow_up_at ?? "") : null,
    });

    return {
      id: tenant.id,
      name: tenant.name,
      ownerName: owner?.full_name ?? "No owner assigned",
      ownerEmail: owner?.email ?? "No owner email",
      plan: tenant.plan,
      status: normalizeStatus(tenant.subscription_status, tenant.suspended),
      lifecycle,
      healthScore: health.score,
      healthTier: health.tier,
      mrrCents: latestInvoices.filter((invoice) => invoice.status === "paid" || invoice.status === "sent" || invoice.status === "overdue").sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.total_cents ?? 0,
      employees: employeeCountByTenant.get(tenant.id) ?? 0,
      bookings30d,
      joinedAt: tenant.created_at,
      lastActiveAt,
      onboardingProgress,
      supportPriority: health.tier === "critical" || paymentStatus === "past_due" ? "urgent" : health.tier === "at_risk" || paymentStatus === "action_needed" ? "elevated" : "normal",
      paymentStatus,
      widgetPublished,
      firstBookingAt,
      suspended: tenant.suspended,
      businessCategory: tenant.industry ?? "General services",
      timezone: tenant.timezone,
      notes,
      activityTimeline,
      nextFollowUpAt: launchReadiness.nextFollowUpAt ?? null,
      launchReadiness,
    };
  });

  const paidInvoices = invoices.filter((invoice) => invoice.status === "paid");
  const paidRecentInvoices = paidInvoices.filter((invoice) => invoice.created_at >= thirtyDaysAgo);
  const totalMrr = tenants.reduce((sum, tenant) => sum + tenant.mrrCents, 0);
  const onboardingStarts = tenants.filter((tenant) => tenant.onboardingProgress > 0).length;
  const completedOnboarding = tenants.filter((tenant) => tenant.onboardingProgress >= 1).length;
  const widgetPublishedCount = tenants.filter((tenant) => tenant.widgetPublished).length;
  const firstBookingCount = tenants.filter((tenant) => tenant.firstBookingAt).length;
  const recurringEnabledCount = tenantsRows.filter((tenant) => {
    const settings = asObject(tenant.settings);
    return settings.recurring_enabled === true || settings.recurring_enabled === "true";
  }).length;
  const months = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setMonth(date.getMonth() - (6 - index));
    const month = date.getMonth();
    const year = date.getFullYear();
    const cents = paidInvoices
      .filter((invoice) => {
        const created = new Date(invoice.created_at);
        return created.getMonth() === month && created.getFullYear() === year;
      })
      .reduce((sum, invoice) => sum + invoice.total_cents, 0);
    return { label: toIsoMonthLabel(date), cents };
  });

  const trialingTenants = tenants.filter((tenant) => tenant.status === "trialing").length;
  const paidConvertedTenants = tenants.filter((tenant) => tenant.status === "active" && new Date(tenant.joinedAt).toISOString() >= ninetyDaysAgo).length;
  const trialConversions = trialingTenants + paidConvertedTenants > 0 ? paidConvertedTenants / (trialingTenants + paidConvertedTenants) : 0;
  const overdueInvoices = invoices.filter((invoice) => invoice.status === "overdue");

  return {
    metrics: {
      mrrCents: totalMrr,
      arrCents: totalMrr * 12,
      tenants: tenants.length,
      activeTenants: tenants.filter((tenant) => !tenant.suspended).length,
      churnRate: tenants.length === 0 ? 0 : tenants.filter((tenant) => tenant.suspended).length / tenants.length,
      trialConversions,
      failedPayments: overdueInvoices.length,
      atRiskTenants: tenants.filter((tenant) => tenant.healthTier === "at_risk" || tenant.healthTier === "critical").length,
      supportBacklog: tenants.filter((tenant) => tenant.supportPriority !== "normal").length,
      onboardingStarts,
      onboardingCompletionRate: onboardingStarts > 0 ? completedOnboarding / onboardingStarts : 0,
      widgetPublishRate: tenants.length > 0 ? widgetPublishedCount / tenants.length : 0,
      firstBookingRate: completedOnboarding > 0 ? firstBookingCount / completedOnboarding : 0,
      activeWidgetRate: tenants.length > 0 ? widgetPublishedCount / tenants.length : 0,
      recurringAdoptionRate: tenants.length > 0 ? recurringEnabledCount / tenants.length : 0,
    },
    mrrBars: months,
    tenants,
    healthSegments: [
      { label: "Healthy", value: tenants.filter((tenant) => tenant.healthTier === "healthy").length, color: "var(--success-500)" },
      { label: "Watch", value: tenants.filter((tenant) => tenant.healthTier === "watch").length, color: "var(--gold-500)" },
      { label: "At risk", value: tenants.filter((tenant) => tenant.healthTier === "at_risk").length, color: "#d26b4f" },
      { label: "Critical", value: tenants.filter((tenant) => tenant.healthTier === "critical").length, color: "#a63d39" },
    ],
    funnel: [
      { label: "Tenants", value: tenants.length },
      { label: "Configured", value: tenants.filter((tenant) => tenant.onboardingProgress >= 0.5).length },
      { label: "Completed", value: tenants.filter((tenant) => tenant.onboardingProgress >= 1).length },
      { label: "Published", value: tenants.filter((tenant) => tenant.widgetPublished).length },
      { label: "First booking", value: tenants.filter((tenant) => tenant.firstBookingAt).length },
      { label: "Paid", value: tenants.filter((tenant) => tenant.mrrCents > 0).length },
    ],
    attention: tenants
      .filter((tenant) => tenant.supportPriority !== "normal")
      .slice(0, 6)
      .map((tenant) => ({
        id: tenant.id,
        kind: tenant.paymentStatus === "past_due" ? "billing" : tenant.onboardingProgress < 1 ? "onboarding" : "support",
        tenant: tenant.name,
        detail:
          tenant.paymentStatus === "past_due"
            ? "Billing recovery needed."
            : tenant.onboardingProgress < 1
              ? "Onboarding has not been completed yet."
              : "Recent activity suggests outreach is needed.",
        priority: tenant.supportPriority === "urgent" ? "high" : "medium",
      })),
    revenueBreakdown: [
      { label: "New MRR", cents: paidRecentInvoices.reduce((sum, invoice) => sum + invoice.total_cents, 0) },
      { label: "Expansion", cents: 0 },
      { label: "Churned", cents: overdueInvoices.reduce((sum, invoice) => sum + invoice.total_cents, 0) },
    ],
    failedInvoices: overdueInvoices.map((invoice) => ({
      id: invoice.id,
      tenant: tenants.find((tenant) => tenant.id === invoice.tenant_id)?.name ?? invoice.tenant_id,
      amountCents: invoice.total_cents,
      attempts: 1,
      dueAt: invoice.due_at ?? invoice.created_at,
    })),
    onboardingExceptions: tenants
      .filter((tenant) => tenant.onboardingProgress < 1)
      .map((tenant) => ({
        id: tenant.id,
        tenant: tenant.name,
        stage: tenant.onboardingProgress < 0.34 ? "Business profile" : tenant.onboardingProgress < 0.67 ? "Team and hours" : "Payments and launch",
        daysStuck: Math.max(0, Math.floor((Date.now() - new Date(tenant.lastActiveAt).getTime()) / 86400000)),
        recommendedAction: tenant.paymentStatus === "action_needed" ? "Help complete payment setup" : "Send onboarding follow-up",
      })),
    supportQueue: tenants
      .filter((tenant) => tenant.supportPriority !== "normal")
      .map((tenant) => ({
        id: tenant.id,
        tenant: tenant.name,
        issue: tenant.paymentStatus === "past_due" ? "Billing issue" : tenant.onboardingProgress < 1 ? "Onboarding incomplete" : "Usage risk detected",
        severity: tenant.supportPriority === "urgent" ? "high" : "medium",
        owner: tenant.ownerName,
        nextAction: tenant.nextFollowUpAt ? `Follow up ${tenant.nextFollowUpAt}` : "Review account and contact owner",
      })),
    featureFlags: featureFlags.map((flag) => ({ key: flag.key, description: flag.description ?? "", enabled: flag.enabled })),
    audit: auditRows.map((row) => ({
      id: String(row.id),
      actor: row.actor_id ? actorById.get(row.actor_id) ?? row.actor_id : "System",
      action: row.action,
      target: tenants.find((tenant) => tenant.id === row.tenant_id)?.name ?? row.entity_id ?? row.entity ?? "Platform",
      at: row.created_at,
    })),
  };
}

function describeAuditDetail(action: string, meta: Record<string, unknown>) {
  if (action === "admin_note_added") {
    return typeof meta.note === "string" ? meta.note : "Admin note added.";
  }
  if (action === "admin_follow_up_scheduled") {
    return typeof meta.follow_up_at === "string" ? `Follow-up scheduled for ${meta.follow_up_at}.` : "Follow-up scheduled.";
  }
  return Object.entries(meta)
    .map(([key, value]) => `${key.replaceAll("_", " ")}: ${String(value)}`)
    .join(" · ") || "Platform activity recorded.";
}

export async function getAdminTenantById(tenantId: string) {
  const data = await getAdminData();
  return data.tenants.find((tenant) => tenant.id === tenantId) ?? null;
}
