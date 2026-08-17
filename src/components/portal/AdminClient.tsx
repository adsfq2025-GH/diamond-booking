"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { money, moneyCompact, percent, shortDate, relativeDay } from "@/lib/format";
import type { AdminData, AdminTenant } from "@/lib/portal/data";
import { RevenueBarChart } from "@/components/dashboard/charts";
import { Icon } from "@/components/dashboard/icons";
import { Panel, PanelHeader, StatCard, DeltaChip } from "@/components/dashboard/ui";
import { Toggle } from "@/app/onboarding/wizard-ui";
import { PreviewNotice, TableWrap, Td, Th } from "@/components/dashboard/sections/shared";

type Tab = "overview" | "tenants" | "flags" | "audit";
const TABS: Array<{ key: Tab; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "tenants", label: "Tenants" },
  { key: "flags", label: "Feature flags" },
  { key: "audit", label: "Audit log" },
];

const PLAN_LABEL = { starter: "Starter", professional: "Professional", elite: "Elite" };
const STATUS_TONE: Record<AdminTenant["status"], string> = {
  active: "bg-success-50 text-success-700",
  trialing: "bg-blue-50 text-blue-700",
  past_due: "bg-gold-100 text-gold-700",
  suspended: "bg-[#fbeaea] text-[#a63d39]",
};

export interface PlatformEmail {
  method: "smtp" | "resend" | "none";
  detail: string;
}

export function AdminClient({
  data,
  platformEmail,
  preview,
}: {
  data: AdminData;
  platformEmail?: PlatformEmail;
  preview: boolean;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const pe: PlatformEmail = platformEmail ?? { method: preview ? "resend" : "none", detail: "notifications@demo" };
  const [tenants, setTenants] = useState(data.tenants);
  const [flags, setFlags] = useState(data.featureFlags);

  return (
    <div>
      {preview && <PreviewNotice>Super-admin console showing demo platform data.</PreviewNotice>}

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
            onClick={() => setTab(t.key)}
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
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <Panel className="lg:col-span-2">
              <PanelHeader title="Recurring revenue" caption="MRR, last 7 months" action={<span className="font-instrument text-[1.1rem] font-semibold text-ink">{money(data.metrics.mrrCents)}</span>} />
              <div className="px-5 py-5">
                <RevenueBarChart bars={data.mrrBars} height={188} />
              </div>
            </Panel>
            <Panel>
              <PanelHeader title="Trial conversion" />
              <div className="px-5 py-6 text-center">
                <p className="font-instrument text-[2.6rem] font-semibold text-ink">{percent(data.metrics.trialConversions)}</p>
                <p className="mt-1 text-[0.82rem] text-ink-faint">of trials convert to paid</p>
                <div className="mt-4 flex items-center justify-center gap-2">
                  <DeltaChip delta={0.04} />
                  <span className="text-[0.78rem] text-ink-muted">vs. last quarter</span>
                </div>
              </div>
            </Panel>
          </div>
          <PlatformEmailCard pe={pe} />
        </div>
      )}

      {tab === "tenants" && (
        <Panel>
          <PanelHeader title="Tenants" caption={`${tenants.length} businesses on the platform`} />
          <TableWrap>
            <thead>
              <tr>
                <Th>Business</Th>
                <Th>Plan</Th>
                <Th>Status</Th>
                <Th className="text-right">MRR</Th>
                <Th className="text-right">Bookings 30d</Th>
                <Th>Joined</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id} className="transition-colors hover:bg-surface-alt/60">
                  <Td>
                    <p className="font-semibold text-ink">{t.name}</p>
                    <p className="text-[0.72rem] text-ink-faint">{t.employees} team members</p>
                  </Td>
                  <Td className="text-ink-muted">{PLAN_LABEL[t.plan]}</Td>
                  <Td>
                    <span className={cn("inline-flex rounded-[var(--radius-pill)] px-2.5 py-[3px] text-[0.72rem] font-semibold capitalize", STATUS_TONE[t.status])}>
                      {t.status.replace("_", " ")}
                    </span>
                  </Td>
                  <Td className="text-right font-instrument font-semibold">{money(t.mrrCents)}</Td>
                  <Td className="text-right font-instrument">{t.bookings30d}</Td>
                  <Td className="text-ink-muted">{shortDate(t.joinedAt)}</Td>
                  <Td>
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        title="Impersonate"
                        className="rounded-[8px] border border-line-strong px-2.5 py-1.5 text-[0.72rem] font-semibold text-ink-muted transition-colors hover:border-blue-600 hover:text-blue-600"
                      >
                        Impersonate
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setTenants((prev) =>
                            prev.map((x) =>
                              x.id === t.id
                                ? { ...x, suspended: !x.suspended, status: x.suspended ? "active" : "suspended", mrrCents: x.suspended ? 5900 : 0 }
                                : x,
                            ),
                          )
                        }
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

      {tab === "audit" && (
        <Panel>
          <PanelHeader title="Audit log" caption="Recent platform events" />
          <ul className="divide-y divide-line">
            {data.audit.map((a) => (
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
      )}
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
