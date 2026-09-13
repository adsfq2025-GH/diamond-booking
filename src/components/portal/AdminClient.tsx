"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { money, moneyCompact, percent, relativeDay } from "@/lib/format";
import type { AdminData, AdminTenant } from "@/lib/portal/admin-data";
import { resetAdminTenantOnboarding, restoreAdminTenant, suspendAdminTenant } from "@/lib/actions/admin";
import type { AdminTenantMutationState } from "@/lib/actions/admin";
import { BarChart, RevenueBarChart, SegmentBar } from "@/components/dashboard/charts";
import { Icon } from "@/components/dashboard/icons";
import { Meter, Panel, PanelHeader, StatCard } from "@/components/dashboard/ui";
import { Toggle } from "@/app/onboarding/wizard-ui";
import { ActionButton, FilterTabs, GhostBtn, TableWrap, Td, Th, Toolbar } from "@/components/dashboard/sections/shared";
import { Modal, Sheet } from "@/components/dashboard/Modal";

type Tab = "overview" | "tenants" | "revenue" | "onboarding" | "usage" | "flags" | "support" | "audit" | "health";
const TABS: Array<{ key: Tab; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "tenants", label: "Tenants" },
  { key: "revenue", label: "Revenue" },
  { key: "onboarding", label: "Onboarding" },
  { key: "usage", label: "Usage" },
  { key: "flags", label: "Feature flags" },
  { key: "support", label: "Support" },
  { key: "audit", label: "Audit log" },
  { key: "health", label: "System health" },
];

const PLAN_LABEL = { starter: "Starter", professional: "Professional", elite: "Elite" };
const STATUS_TONE: Record<AdminTenant["status"], string> = {
  active: "bg-success-50 text-success-700",
  trialing: "bg-blue-50 text-blue-700",
  past_due: "bg-gold-100 text-gold-700",
  suspended: "bg-[#fbeaea] text-[#a63d39]",
};
const LIFECYCLE_TONE: Record<AdminTenant["lifecycle"], string> = {
  trialing: "bg-blue-50 text-blue-700",
  activating: "bg-navy-50 text-navy-600",
  live: "bg-success-50 text-success-700",
  at_risk: "bg-gold-100 text-gold-700",
  past_due: "bg-[#fff2e8] text-[#b85b36]",
  suspended: "bg-[#fbeaea] text-[#a63d39]",
};
const HEALTH_TONE: Record<AdminTenant["healthTier"], string> = {
  healthy: "bg-success-50 text-success-700",
  watch: "bg-gold-100 text-gold-700",
  at_risk: "bg-[#fff2e8] text-[#b85b36]",
  critical: "bg-[#fbeaea] text-[#a63d39]",
};
const SUPPORT_TONE: Record<AdminTenant["supportPriority"], string> = {
  normal: "bg-surface-alt text-ink-faint",
  elevated: "bg-gold-100 text-gold-700",
  urgent: "bg-[#fbeaea] text-[#a63d39]",
};
type TenantFilter = "all" | "at_risk" | "past_due" | "trialing";
type ActionDraft = { tenantId: string; kind: "suspend" | "restore" | "reset_onboarding" } | null;
type AuditFilter = "all" | "impersonation" | "billing" | "security";

function pillClassName(tone: string) {
  return cn("inline-flex rounded-[var(--radius-pill)] px-2.5 py-[3px] text-[0.72rem] font-semibold capitalize", tone);
}

export interface PlatformEmail {
  method: "smtp" | "resend" | "none";
  detail: string;
}

export function AdminClient({
  data,
  platformEmail,
  initialTab,
}: {
  data: AdminData;
  platformEmail?: PlatformEmail;
  initialTab?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlTab = searchParams.get("tab");
  const tab = isTab(urlTab) ? urlTab : isTab(initialTab) ? initialTab : "overview";
  const pe: PlatformEmail = platformEmail ?? { method: "none", detail: "" };
  const [tenants, setTenants] = useState(data.tenants);
  const [flags, setFlags] = useState(data.featureFlags);
  const [search, setSearch] = useState("");
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [tenantFilter, setTenantFilter] = useState<TenantFilter>("all");
  const [actionDraft, setActionDraft] = useState<ActionDraft>(null);
  const [actionReason, setActionReason] = useState("");
  const [auditFilter, setAuditFilter] = useState<AuditFilter>("all");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [, suspendAction, suspendPending] = useActionState<AdminTenantMutationState, FormData>(suspendAdminTenant, null);
  const [, restoreAction, restorePending] = useActionState<AdminTenantMutationState, FormData>(restoreAdminTenant, null);
  const [, resetOnboardingAction, resetOnboardingPending] = useActionState<AdminTenantMutationState, FormData>(resetAdminTenantOnboarding, null);

  const filteredTenants = useMemo(
    () =>
      tenants.filter((tenant) => {
        const query = search.trim().toLowerCase();
        const matchesQuery = !query || [tenant.name, tenant.ownerName, tenant.ownerEmail, tenant.id].some((value) => value.toLowerCase().includes(query));
        if (!matchesQuery) return false;
        if (tenantFilter === "at_risk") return tenant.healthTier === "at_risk" || tenant.healthTier === "critical";
        if (tenantFilter === "past_due") return tenant.status === "past_due";
        if (tenantFilter === "trialing") return tenant.status === "trialing" || tenant.lifecycle === "activating";
        return true;
      }),
    [search, tenantFilter, tenants],
  );

  const selectedTenant = selectedTenantId ? tenants.find((tenant) => tenant.id === selectedTenantId) ?? null : null;
  const draftTenant = actionDraft ? tenants.find((tenant) => tenant.id === actionDraft.tenantId) ?? null : null;
  const actionPending = actionDraft?.kind === "suspend" ? suspendPending : actionDraft?.kind === "restore" ? restorePending : resetOnboardingPending;
  const filteredAudit = useMemo(
    () =>
      data.audit.filter((item) => {
        if (auditFilter === "all") return true;
        if (auditFilter === "impersonation") return /impersonat/i.test(item.action);
        if (auditFilter === "billing") return /billing|invoice|payment/i.test(item.action) || /billing|invoice|payment/i.test(item.target);
        if (auditFilter === "security") return /suspend|restore|role|security/i.test(item.action);
        return true;
      }),
    [auditFilter, data.audit],
  );

  function changeTab(nextTab: Tab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", nextTab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-[clamp(1.4rem,3.5vw,1.9rem)] font-bold tracking-[-0.03em] text-ink">
          Platform <span className="em-italic em-blue">console.</span>
        </h1>
        <p className="mt-1 text-[0.88rem] text-ink-muted">Every tenant, subscription and flag across Diamond Booking.</p>
      </div>

      <div className="mb-5 flex gap-1.5 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => changeTab(t.key)}
            className={cn(
              "flex-none rounded-[var(--radius-pill)] border px-4 py-2 text-[0.82rem] font-semibold transition-colors",
              tab === t.key
                ? "border-transparent bg-navy-900 text-white"
                : "border-line-strong bg-card text-ink-muted hover:border-blue-600 hover:text-blue-600",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 min-[521px]:grid-cols-2 xl:grid-cols-4">
            <StatCard label="MRR" value={money(data.metrics.mrrCents)} delta={0.086} caption="monthly recurring" />
            <StatCard label="ARR" value={moneyCompact(data.metrics.arrCents)} delta={0.086} caption="annualized" />
            <StatCard label="Active tenants" value={String(data.metrics.activeTenants)} caption={`${data.metrics.tenants} total`} />
            <StatCard label="Churn" value={percent(data.metrics.churnRate, 1)} delta={data.metrics.churnRate} invertDelta caption="monthly" />
          </div>
          <div className="grid grid-cols-1 gap-4 min-[521px]:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Trial conversion" value={percent(data.metrics.trialConversions)} delta={0.04} caption="last 90 days" />
            <StatCard label="Failed payments" value={String(data.metrics.failedPayments)} caption="attention needed" />
            <StatCard label="At-risk tenants" value={String(data.metrics.atRiskTenants)} caption="watch closely" />
            <StatCard label="Support backlog" value={String(data.metrics.supportBacklog)} caption="open follow-ups" />
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <Panel className="lg:col-span-2">
              <PanelHeader title="Recurring revenue" caption="MRR, last 7 months" action={<span className="font-instrument text-[1.1rem] font-semibold text-ink">{money(data.metrics.mrrCents)}</span>} />
              <div className="px-5 py-5">
                <RevenueBarChart bars={data.mrrBars} height={188} />
              </div>
            </Panel>
            <Panel>
              <PanelHeader title="Tenant health" caption="Platform distribution" />
              <div className="px-5 py-5">
                <SegmentBar segments={data.healthSegments} />
              </div>
            </Panel>
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Panel>
              <PanelHeader title="Attention queue" caption="What needs action now" action={<span className="text-[0.76rem] font-semibold text-ink-muted">{data.attention.length} open</span>} />
              <ul className="divide-y divide-line px-5">
                {data.attention.map((item) => (
                  <li key={item.id} className="flex items-start justify-between gap-3 py-4">
                    <div className="min-w-0">
                      <p className="text-[0.84rem] font-semibold text-ink">{item.tenant}</p>
                      <p className="mt-1 text-[0.76rem] leading-[1.55] text-ink-faint">{item.detail}</p>
                    </div>
                    <span className={pillClassName(item.priority === "high" ? "bg-[#fbeaea] text-[#a63d39]" : "bg-gold-100 text-gold-700")}>
                      {item.priority}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel>
              <PanelHeader title="Activation funnel" caption="Signup to paid conversion" />
              <div className="px-5 py-5">
                <BarChart
                  height={200}
                  bars={data.funnel.map((item, index) => ({
                    label: item.label,
                    value: item.value,
                    display: String(item.value),
                    color: index === data.funnel.length - 1 ? "linear-gradient(180deg,var(--gold-400),var(--gold-500))" : undefined,
                  }))}
                  highlightLast={false}
                />
              </div>
            </Panel>
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <Panel>
              <PanelHeader title="Revenue mix" caption="This month" />
              <div className="space-y-3 px-5 py-5">
                {data.revenueBreakdown.map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-3 rounded-[12px] bg-surface-alt px-3.5 py-3">
                    <span className="text-[0.8rem] text-ink-muted">{item.label}</span>
                    <span className="font-instrument font-semibold text-ink">{money(item.cents)}</span>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel className="lg:col-span-2">
              <PanelHeader title="Accounts needing intervention" caption="High-priority tenant watchlist" />
              <div className="divide-y divide-line px-5">
                {tenants
                  .filter((tenant) => tenant.supportPriority !== "normal" || tenant.healthTier !== "healthy")
                  .slice(0, 4)
                  .map((tenant) => (
                    <div key={tenant.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                      <div>
                        <p className="text-[0.84rem] font-semibold text-ink">{tenant.name}</p>
                        <p className="mt-1 text-[0.76rem] text-ink-faint">
                          {tenant.ownerName} · {tenant.bookings30d} bookings in the last 30 days
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={pillClassName(HEALTH_TONE[tenant.healthTier])}>{tenant.healthTier.replace("_", " ")}</span>
                        <span className={pillClassName(SUPPORT_TONE[tenant.supportPriority])}>{tenant.supportPriority}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </Panel>
          </div>
          <PlatformEmailCard pe={pe} />
        </div>
      )}

      {tab === "tenants" && (
        <Panel>
          <PanelHeader title="Tenants" caption={`${filteredTenants.length} businesses in view`} action={<ActionButton>Export tenants</ActionButton>} />
          {actionMessage ? <p className="px-5 pt-4 text-[0.78rem] font-medium text-success-700">{actionMessage}</p> : null}
          <div className="px-5 pt-5">
            <Toolbar
              search={search}
              onSearch={setSearch}
              placeholder="Search business, owner, email, or tenant ID"
            >
              <FilterTabs
                tabs={[
                  { key: "all", label: "All", count: tenants.length },
                  { key: "at_risk", label: "At risk", count: tenants.filter((tenant) => tenant.healthTier === "at_risk" || tenant.healthTier === "critical").length },
                  { key: "past_due", label: "Past due", count: tenants.filter((tenant) => tenant.status === "past_due").length },
                  { key: "trialing", label: "Activating", count: tenants.filter((tenant) => tenant.status === "trialing" || tenant.lifecycle === "activating").length },
                ]}
                value={tenantFilter}
                onChange={setTenantFilter}
              />
            </Toolbar>
          </div>
          <TableWrap>
            <thead>
              <tr>
                <Th>Business</Th>
                <Th>Owner</Th>
                <Th>Plan</Th>
                <Th>Lifecycle</Th>
                <Th>Health</Th>
                <Th>Billing</Th>
                <Th>Onboarding</Th>
                <Th className="text-right">MRR</Th>
                <Th className="text-right">Bookings 30d</Th>
                <Th>Last active</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {filteredTenants.map((t) => (
                <tr key={t.id} className="transition-colors hover:bg-surface-alt/60">
                  <Td>
                    <p className="font-semibold text-ink">{t.name}</p>
                    <p className="text-[0.72rem] text-ink-faint">{t.id} · {t.employees} team members</p>
                  </Td>
                  <Td>
                    <p className="font-medium text-ink">{t.ownerName}</p>
                    <p className="text-[0.72rem] text-ink-faint">{t.ownerEmail}</p>
                  </Td>
                  <Td className="text-ink-muted">{PLAN_LABEL[t.plan]}</Td>
                  <Td>
                    <span className={pillClassName(LIFECYCLE_TONE[t.lifecycle])}>
                      {t.lifecycle.replace("_", " ")}
                    </span>
                  </Td>
                  <Td>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className={pillClassName(HEALTH_TONE[t.healthTier])}>{t.healthTier.replace("_", " ")}</span>
                        <span className="text-[0.72rem] font-semibold text-ink-faint">{t.healthScore}</span>
                      </div>
                      <Meter value={t.healthScore / 100} />
                    </div>
                  </Td>
                  <Td>
                    <div className="space-y-1">
                      <span className={pillClassName(STATUS_TONE[t.status])}>{t.status.replace("_", " ")}</span>
                      <p className="text-[0.7rem] text-ink-faint">{t.paymentStatus.replace("_", " ")}</p>
                    </div>
                  </Td>
                  <Td>
                    <div className="space-y-1.5">
                      <p className="text-[0.76rem] text-ink-muted">{Math.round(t.onboardingProgress * 100)}%</p>
                      <Meter value={t.onboardingProgress} color="var(--gold-500)" />
                    </div>
                  </Td>
                  <Td className="text-right font-instrument font-semibold">{money(t.mrrCents)}</Td>
                  <Td className="text-right font-instrument">{t.bookings30d}</Td>
                  <Td className="text-ink-muted">{relativeDay(t.lastActiveAt)}</Td>
                  <Td>
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        title="Impersonate"
                        onClick={() => setSelectedTenantId(t.id)}
                        className="rounded-[8px] border border-line-strong px-2.5 py-1.5 text-[0.72rem] font-semibold text-ink-muted transition-colors hover:border-blue-600 hover:text-blue-600"
                      >
                        View
                      </button>
                      <button
                        type="button"
                        onClick={() => setActionDraft({ tenantId: t.id, kind: "reset_onboarding" })}
                        className="rounded-[8px] border border-line-strong px-2.5 py-1.5 text-[0.72rem] font-semibold text-ink-muted transition-colors hover:border-gold-500 hover:text-gold-700"
                      >
                        Reset onboarding
                      </button>
                      <button
                        type="button"
                        onClick={() => setActionDraft({ tenantId: t.id, kind: t.suspended ? "restore" : "suspend" })}
                        className={cn(
                          "rounded-[8px] border px-2.5 py-1.5 text-[0.72rem] font-semibold transition-colors",
                          t.suspended
                            ? "border-line-strong text-ink-muted hover:border-success-500 hover:text-success-700"
                            : "border-line-strong text-ink-muted hover:border-[#c25450] hover:text-[#a63d39]",
                        )}
                      >
                        {t.suspended ? "Restore" : "Suspend"}
                      </button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Panel>
      )}

      {tab === "revenue" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 min-[521px]:grid-cols-2 xl:grid-cols-4">
            <StatCard label="New MRR" value={money(data.revenueBreakdown[0]?.cents ?? 0)} caption="this month" />
            <StatCard label="Expansion" value={money(data.revenueBreakdown[1]?.cents ?? 0)} caption="upsells and upgrades" />
            <StatCard label="Churned" value={money(data.revenueBreakdown[2]?.cents ?? 0)} invertDelta delta={0.03} caption="lost this month" />
            <StatCard label="Trial to paid" value={percent(data.metrics.trialConversions)} delta={0.04} caption="last 90 days" />
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Panel>
              <PanelHeader title="Revenue trend" caption="Monthly recurring revenue" />
              <div className="px-5 py-5">
                <RevenueBarChart bars={data.mrrBars} height={220} />
              </div>
            </Panel>
            <Panel>
              <PanelHeader title="Revenue mix" caption="New, expansion, and churned MRR" />
              <div className="px-5 py-5">
                <BarChart
                  height={220}
                  bars={data.revenueBreakdown.map((item, index) => ({
                    label: item.label,
                    value: item.cents,
                    display: money(item.cents),
                    color:
                      index === 0
                        ? "linear-gradient(180deg,var(--blue-500),var(--blue-600))"
                        : index === 1
                          ? "linear-gradient(180deg,var(--gold-400),var(--gold-500))"
                          : "linear-gradient(180deg,#e5a18a,#d26b4f)",
                  }))}
                  highlightLast={false}
                />
              </div>
            </Panel>
          </div>
          <Panel>
            <PanelHeader title="Failed invoices" caption="Needs billing recovery" />
            <TableWrap>
              <thead>
                <tr>
                  <Th>Tenant</Th>
                  <Th className="text-right">Amount</Th>
                  <Th className="text-right">Attempts</Th>
                  <Th>Due</Th>
                </tr>
              </thead>
              <tbody>
                {data.failedInvoices.map((invoice) => (
                  <tr key={invoice.id} className="transition-colors hover:bg-surface-alt/60">
                    <Td>{invoice.tenant}</Td>
                    <Td className="text-right font-instrument font-semibold">{money(invoice.amountCents)}</Td>
                    <Td className="text-right">{invoice.attempts}</Td>
                    <Td className="text-ink-muted">{relativeDay(invoice.dueAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </Panel>
        </div>
      )}

      {tab === "onboarding" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 min-[521px]:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Starts" value={String(data.metrics.onboardingStarts)} caption="tenants who began setup" />
            <StatCard label="Completion" value={percent(data.metrics.onboardingCompletionRate)} caption="wizard completion rate" />
            <StatCard label="Published" value={percent(data.metrics.widgetPublishRate)} caption="widget publish rate" />
            <StatCard label="First booking" value={percent(data.metrics.firstBookingRate)} caption="completed tenants with bookings" />
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Panel>
              <PanelHeader title="Step dropoff" caption="Signup to launch" />
              <div className="px-5 py-5">
                <BarChart height={220} bars={data.funnel.map((item) => ({ label: item.label, value: item.value, display: String(item.value) }))} />
              </div>
            </Panel>
            <Panel>
              <PanelHeader title="Stuck tenants" caption="Needs follow-up" />
              <div className="divide-y divide-line px-5">
                {tenants
                  .filter((tenant) => tenant.onboardingProgress < 1 || !tenant.widgetPublished)
                  .slice(0, 4)
                  .map((tenant) => (
                    <div key={tenant.id} className="flex items-center justify-between gap-3 py-4">
                      <div>
                        <p className="text-[0.84rem] font-semibold text-ink">{tenant.name}</p>
                        <p className="mt-1 text-[0.76rem] text-ink-faint">{Math.round(tenant.onboardingProgress * 100)}% complete · last active {relativeDay(tenant.lastActiveAt)}</p>
                      </div>
                      <span className={pillClassName(SUPPORT_TONE[tenant.supportPriority])}>{tenant.supportPriority}</span>
                    </div>
                  ))}
              </div>
            </Panel>
          </div>
          <Panel>
            <PanelHeader title="Onboarding exceptions" caption="Activation blockers" />
            <TableWrap>
              <thead>
                <tr>
                  <Th>Tenant</Th>
                  <Th>Stage</Th>
                  <Th className="text-right">Days stuck</Th>
                  <Th>Recommended action</Th>
                </tr>
              </thead>
              <tbody>
                {data.onboardingExceptions.map((item) => (
                  <tr key={item.id} className="transition-colors hover:bg-surface-alt/60">
                    <Td>{item.tenant}</Td>
                    <Td>{item.stage}</Td>
                    <Td className="text-right font-instrument">{item.daysStuck}</Td>
                    <Td className="text-ink-muted">{item.recommendedAction}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </Panel>
        </div>
      )}

      {tab === "usage" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 min-[521px]:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Widget adoption" value={percent(data.metrics.activeWidgetRate)} caption="tenants published" />
            <StatCard label="Customer portal" value={String(tenants.filter((tenant) => tenant.bookings30d > 0).length)} caption="tenants with recent customer demand" />
            <StatCard label="Team portal" value={String(tenants.filter((tenant) => tenant.employees > 0).length)} caption="tenants with active team setup" />
            <StatCard label="Recurring bookings" value={percent(data.metrics.recurringAdoptionRate)} caption="recurring enabled in onboarding" />
          </div>
          <Panel>
            <PanelHeader title="Expansion opportunities" caption="Accounts with product upside" />
            <div className="divide-y divide-line px-5">
              {tenants
                .filter((tenant) => tenant.plan !== "elite" && tenant.bookings30d > 40)
                .slice(0, 4)
                .map((tenant) => (
                  <div key={tenant.id} className="flex items-center justify-between gap-3 py-4">
                    <div>
                      <p className="text-[0.84rem] font-semibold text-ink">{tenant.name}</p>
                      <p className="mt-1 text-[0.76rem] text-ink-faint">{tenant.bookings30d} bookings in 30 days · strong upgrade candidate</p>
                    </div>
                    <span className={pillClassName("bg-navy-50 text-navy-600")}>{PLAN_LABEL[tenant.plan]}</span>
                  </div>
                ))}
            </div>
          </Panel>
        </div>
      )}

      {tab === "flags" && (
        <Panel>
          <PanelHeader title="Feature flags" caption="Platform-wide toggles" />
          <ul className="divide-y divide-line px-5">
            {flags.map((f) => (
              <li key={f.key} className="py-4">
                <Toggle
                  id={f.key}
                  label={f.key}
                  description={f.description}
                  checked={f.enabled}
                  onChange={(v) => setFlags((prev) => prev.map((x) => (x.key === f.key ? { ...x, enabled: v } : x)))}
                />
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {tab === "support" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 min-[521px]:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Open issues" value={String(data.supportQueue.length)} caption="active cases" />
            <StatCard label="High priority" value={String(data.supportQueue.filter((item) => item.severity === "high").length)} caption="immediate outreach" />
            <StatCard label="Billing escalations" value={String(data.supportQueue.filter((item) => item.issue.toLowerCase().includes("billing")).length)} caption="collections risk" />
            <StatCard label="Onboarding follow-ups" value={String(data.onboardingExceptions.length)} caption="activation blockers" />
          </div>
          <Panel>
            <PanelHeader title="Support queue" caption="Tenants requiring follow-up" />
            <TableWrap>
              <thead>
                <tr>
                  <Th>Tenant</Th>
                  <Th>Issue</Th>
                  <Th>Owner</Th>
                  <Th>Next action</Th>
                  <Th>Severity</Th>
                </tr>
              </thead>
              <tbody>
                {data.supportQueue.map((item) => (
                  <tr key={item.id} className="transition-colors hover:bg-surface-alt/60">
                    <Td>{item.tenant}</Td>
                    <Td>{item.issue}</Td>
                    <Td className="text-ink-muted">{item.owner}</Td>
                    <Td className="text-ink-muted">{item.nextAction}</Td>
                    <Td>
                      <span className={pillClassName(item.severity === "high" ? "bg-[#fbeaea] text-[#a63d39]" : item.severity === "medium" ? "bg-gold-100 text-gold-700" : "bg-surface-alt text-ink-faint")}>
                        {item.severity}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </Panel>
        </div>
      )}

      {tab === "audit" && (
        <div className="space-y-5">
          <Panel>
            <PanelHeader title="Audit controls" caption="Filter sensitive activity" />
            <div className="px-5 py-5">
              <FilterTabs
                tabs={[
                  { key: "all", label: "All", count: data.audit.length },
                  { key: "impersonation", label: "Impersonation" },
                  { key: "billing", label: "Billing" },
                  { key: "security", label: "Security" },
                ]}
                value={auditFilter}
                onChange={setAuditFilter}
              />
            </div>
          </Panel>
          <Panel>
            <PanelHeader title="Audit log" caption="Recent platform events" action={<span className="text-[0.76rem] font-semibold text-ink-muted">{filteredAudit.length} events</span>} />
            <ul className="divide-y divide-line">
              {filteredAudit.map((a) => (
              <li key={a.id} className="flex items-start gap-3 px-5 py-3.5">
                <span className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-surface-alt text-ink-faint">
                  <Icon name="clock" className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[0.84rem] text-ink">
                    <span className="font-semibold">{a.action}</span>
                    <span className="text-ink-muted"> · {a.target}</span>
                  </p>
                  <p className="text-[0.72rem] text-ink-faint">by {a.actor}</p>
                </div>
                <span className="flex-none text-[0.72rem] text-ink-faint">{relativeDay(a.at)}</span>
              </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}

      {tab === "health" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 min-[521px]:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Webhook success" value="99.2%" caption="last 7 days" />
            <StatCard label="Queue backlog" value="14" caption="jobs waiting" />
            <StatCard label="Email delivery" value="98.7%" caption="platform average" />
            <StatCard label="Auth failures" value="1.4%" invertDelta delta={0.012} caption="sign-in attempts" />
          </div>
          <Panel>
            <PanelHeader title="Platform health notes" caption="Operational visibility" />
            <ul className="divide-y divide-line px-5">
              <li className="flex items-center justify-between gap-3 py-4 text-[0.82rem]">
                <span className="text-ink">Stripe webhooks are processing normally.</span>
                <span className={pillClassName("bg-success-50 text-success-700")}>healthy</span>
              </li>
              <li className="flex items-center justify-between gap-3 py-4 text-[0.82rem]">
                <span className="text-ink">Reminder queue is slightly elevated after weekend spike.</span>
                <span className={pillClassName("bg-gold-100 text-gold-700")}>watch</span>
              </li>
              <li className="flex items-center justify-between gap-3 py-4 text-[0.82rem]">
                <span className="text-ink">No active incidents affecting booking creation.</span>
                <span className={pillClassName("bg-success-50 text-success-700")}>clear</span>
              </li>
            </ul>
          </Panel>
        </div>
      )}

      {selectedTenant && (
        <Sheet
          open
          onClose={() => setSelectedTenantId(null)}
          eyebrow="Tenant detail"
          title={selectedTenant.name}
          footer={
            <>
              <GhostBtn onClick={() => setSelectedTenantId(null)}>Close</GhostBtn>
              <Link href={`/admin/tenant/${selectedTenant.id}`}>
                <ActionButton>Open full profile</ActionButton>
              </Link>
            </>
          }
        >
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={pillClassName(LIFECYCLE_TONE[selectedTenant.lifecycle])}>{selectedTenant.lifecycle.replace("_", " ")}</span>
              <span className={pillClassName(HEALTH_TONE[selectedTenant.healthTier])}>{selectedTenant.healthTier.replace("_", " ")}</span>
              <span className={pillClassName(SUPPORT_TONE[selectedTenant.supportPriority])}>{selectedTenant.supportPriority}</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <MiniStat label="MRR" value={money(selectedTenant.mrrCents)} />
              <MiniStat label="Bookings 30d" value={String(selectedTenant.bookings30d)} />
              <MiniStat label="Team size" value={String(selectedTenant.employees)} />
              <MiniStat label="Last active" value={relativeDay(selectedTenant.lastActiveAt)} />
            </div>

            <Panel>
              <PanelHeader title="Owner" />
              <div className="space-y-3 px-4 py-4 text-[0.82rem] text-ink-muted">
                <div>
                  <p className="font-semibold text-ink">{selectedTenant.ownerName}</p>
                  <p>{selectedTenant.ownerEmail}</p>
                </div>
                <DetailRow label="Joined" value={relativeDay(selectedTenant.joinedAt)} />
                <DetailRow label="Category" value={selectedTenant.businessCategory} />
                <DetailRow label="Timezone" value={selectedTenant.timezone} />
              </div>
            </Panel>

            <Panel>
              <PanelHeader title="Launch readiness" caption="Onboarding and widget state" />
              <div className="space-y-3 px-4 py-4">
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-[0.76rem] text-ink-muted">
                    <span>Onboarding progress</span>
                    <span>{Math.round(selectedTenant.onboardingProgress * 100)}%</span>
                  </div>
                  <Meter value={selectedTenant.onboardingProgress} color="var(--gold-500)" />
                </div>
                <div className="rounded-[12px] bg-surface-alt px-3.5 py-3 text-[0.78rem] text-ink-muted">
                  <p>
                    Widget status: <span className="font-semibold text-ink">{selectedTenant.launchReadiness.widgetPublished ? "Published" : "Not published"}</span>
                  </p>
                  <p className="mt-1">
                    First booking: <span className="font-semibold text-ink">{selectedTenant.launchReadiness.firstBookingAt ? relativeDay(selectedTenant.launchReadiness.firstBookingAt) : "No bookings yet"}</span>
                  </p>
                  <p className="mt-1">
                    Next follow-up: <span className="font-semibold text-ink">{selectedTenant.launchReadiness.nextFollowUpAt ? relativeDay(selectedTenant.launchReadiness.nextFollowUpAt) : "Not scheduled"}</span>
                  </p>
                </div>
                {selectedTenant.launchReadiness.blockers.length > 0 ? (
                  <ul className="space-y-2 text-[0.76rem] text-ink-muted">
                    {selectedTenant.launchReadiness.blockers.map((blocker) => (
                      <li key={blocker} className="rounded-[10px] border border-line bg-card px-3 py-2.5">{blocker}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="rounded-[10px] border border-success-200 bg-success-50 px-3 py-2.5 text-[0.76rem] font-medium text-success-700">
                    This tenant is launch-ready based on current live signals.
                  </div>
                )}
              </div>
            </Panel>

            <Panel>
              <PanelHeader title="Billing and risk" />
              <div className="space-y-3 px-4 py-4 text-[0.8rem] text-ink-muted">
                <DetailRow label="Billing status" value={selectedTenant.status.replace("_", " ")} />
                <DetailRow label="Payment health" value={selectedTenant.paymentStatus.replace("_", " ")} />
                <DetailRow label="Health score" value={`${selectedTenant.healthScore}/100`} />
              </div>
            </Panel>

            <Panel>
              <PanelHeader title="Recommended next actions" />
              <ul className="space-y-2 px-4 py-4 text-[0.8rem] text-ink-muted">
                <li className="rounded-[12px] bg-surface-alt px-3.5 py-3">Follow up on payments if billing remains in action-needed state.</li>
                <li className="rounded-[12px] bg-surface-alt px-3.5 py-3">Review launch blockers and confirm the booking page is customer-ready.</li>
                <li className="rounded-[12px] bg-surface-alt px-3.5 py-3">Use impersonation only after reviewing activity, billing, and onboarding signals.</li>
              </ul>
            </Panel>

            <Panel>
              <PanelHeader title="Internal notes" caption="Operator context" />
              <ul className="space-y-2 px-4 py-4 text-[0.8rem] text-ink-muted">
                {selectedTenant.notes.map((note) => (
                  <li key={note} className="rounded-[12px] bg-surface-alt px-3.5 py-3">
                    {note}
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel>
              <PanelHeader title="Recent tenant activity" caption="Latest operator and system events" />
              <ul className="divide-y divide-line px-4">
                {selectedTenant.activityTimeline.length === 0 ? (
                  <li className="py-4 text-[0.8rem] text-ink-faint">No recent activity captured yet.</li>
                ) : (
                  selectedTenant.activityTimeline.map((event) => (
                    <li key={event.id} className="py-3.5">
                      <p className="text-[0.8rem] font-semibold text-ink">{event.label}</p>
                      <p className="mt-1 text-[0.76rem] leading-[1.55] text-ink-muted">{event.detail}</p>
                      <p className="mt-1 text-[0.7rem] text-ink-faint">{relativeDay(event.at)}</p>
                    </li>
                  ))
                )}
              </ul>
            </Panel>
          </div>
        </Sheet>
      )}

      {draftTenant && actionDraft && (
        <Modal
          open
          onClose={() => setActionDraft(null)}
          size="sm"
          title={actionDraft.kind === "suspend" ? "Suspend tenant" : actionDraft.kind === "restore" ? "Restore tenant" : "Reset onboarding"}
          description={`Confirm the admin action for ${draftTenant.name}.`}
          footer={
            <>
              <GhostBtn onClick={() => setActionDraft(null)}>Cancel</GhostBtn>
              <ActionButton
                icon={actionDraft.kind === "suspend" ? "close" : "check"}
                type="submit"
                form="tenant-action-form"
                disabled={!actionReason.trim() || actionPending}
              >
                {actionPending ? "Saving..." : actionDraft.kind === "suspend" ? "Confirm suspend" : actionDraft.kind === "restore" ? "Confirm restore" : "Confirm reset"}
              </ActionButton>
            </>
          }
        >
          <form
            id="tenant-action-form"
            action={async (formData) => {
              if (!draftTenant) return;
              setActionMessage(null);
              formData.set("tenantId", draftTenant.id);
              formData.set("reason", actionReason);
              const result = ((actionDraft.kind === "suspend"
                ? await suspendAction(formData)
                : actionDraft.kind === "restore"
                  ? await restoreAction(formData)
                  : await resetOnboardingAction(formData)) ?? null) as unknown as AdminTenantMutationState;
              if (result && result.error) {
                setActionMessage(result.error);
                return;
              }
              setTenants((prev) =>
                prev.map((tenant) =>
                  tenant.id === draftTenant.id
                    ? {
                        ...tenant,
                        suspended: result?.suspended ?? tenant.suspended,
                        onboardingProgress: actionDraft.kind === "reset_onboarding" ? 0 : tenant.onboardingProgress,
                        launchReadiness:
                          actionDraft.kind === "reset_onboarding"
                            ? {
                                ...tenant.launchReadiness,
                                onboardingProgress: 0,
                                onboardingComplete: false,
                                blockers: ["Finish onboarding", ...tenant.launchReadiness.blockers.filter((item) => item !== "Finish onboarding")],
                                status: "not_ready",
                              }
                            : tenant.launchReadiness,
                        status: result?.suspended ? "suspended" : tenant.status === "suspended" ? "active" : tenant.status,
                        lifecycle: result?.suspended ? "suspended" : tenant.lifecycle === "suspended" ? "live" : tenant.lifecycle,
                      }
                    : tenant,
                ),
              );
              setActionMessage(actionDraft.kind === "suspend" ? "Tenant suspended." : actionDraft.kind === "restore" ? "Tenant restored." : "Onboarding reset.");
              setActionReason("");
              setActionDraft(null);
            }}
            className="space-y-3 text-[0.82rem] leading-[1.6] text-ink-muted"
          >
            <p>
              Review the tenant’s billing state, onboarding status, and support history before taking this action.
            </p>
            <div className="rounded-[12px] bg-surface-alt px-3.5 py-3">
              <p>
                Current status: <span className="font-semibold text-ink">{draftTenant.status.replace("_", " ")}</span>
              </p>
              <p className="mt-1">
                Health: <span className="font-semibold text-ink">{draftTenant.healthScore}/100</span>
              </p>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-[0.76rem] font-semibold text-ink">Reason required</span>
              <textarea
                name="reason"
                value={actionReason}
                onChange={(event) => setActionReason(event.target.value)}
                rows={3}
                placeholder={actionDraft.kind === "suspend" ? "Document why this tenant is being suspended." : actionDraft.kind === "restore" ? "Document why this tenant is being restored." : "Document why this tenant should restart onboarding."}
                className="w-full rounded-[12px] border border-line-strong bg-card px-3.5 py-2.5 text-[0.82rem] text-ink placeholder:text-ink-faint/80 focus:border-blue-600 focus:ring-[3px] focus:ring-blue-600/15 focus:outline-none"
              />
            </label>
          </form>
        </Modal>
      )}
    </div>
  );
}

function isTab(value: string | null | undefined): value is Tab {
  return TABS.some((tab) => tab.key === value);
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-line bg-surface-alt/50 px-3.5 py-3">
      <p className="text-[0.68rem] font-bold tracking-[0.08em] text-ink-faint uppercase">{label}</p>
      <p className="mt-1 text-[0.95rem] font-semibold text-ink">{value}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-[12px] bg-surface-alt px-3.5 py-3">
      <span className="text-[0.72rem] font-bold tracking-[0.08em] text-ink-faint uppercase">{label}</span>
      <span className="text-right text-[0.82rem] font-medium text-ink">{value}</span>
    </div>
  );
}

function PlatformEmailCard({ pe }: { pe: PlatformEmail }) {
  const label =
    pe.method === "smtp"
      ? `SMTP · ${pe.detail}`
      : pe.method === "resend"
        ? `Resend · ${pe.detail}`
        : "Not configured";
  const good = pe.method !== "none";
  return (
    <Panel>
      <PanelHeader
        title="Platform email"
        caption="Default sender for tenants without their own SMTP"
        action={
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] px-2.5 py-[3px] text-[0.66rem] font-bold tracking-wide uppercase",
              good ? "bg-success-50 text-success-700" : "bg-gold-100 text-gold-700",
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", good ? "bg-success-500" : "bg-gold-500")} />
            {good ? "Active" : "Off"}
          </span>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-surface-alt text-ink-muted">
            <Icon name="invoices" className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[0.88rem] font-semibold text-ink">{label}</p>
            <p className="text-[0.76rem] text-ink-faint">
              Set via <code className="rounded bg-surface-alt px-1">SMTP_*</code> or{" "}
              <code className="rounded bg-surface-alt px-1">RESEND_*</code> environment variables
            </p>
          </div>
        </div>
      </div>
    </Panel>
  );
}
