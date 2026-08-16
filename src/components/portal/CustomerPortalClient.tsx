"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { money, relativeDay, shortDate, timeRange } from "@/lib/format";
import type { CustomerPortal, CustBooking } from "@/lib/portal/data";
import { Icon } from "@/components/dashboard/icons";
import { Avatar, BookingStatusBadge, InvoiceStatusBadge, Panel, PanelHeader, EmptyState } from "@/components/dashboard/ui";
import { PreviewNotice } from "@/components/dashboard/sections/shared";

type Tab = "upcoming" | "history" | "invoices" | "profile";
const TABS: Array<{ key: Tab; label: string }> = [
  { key: "upcoming", label: "Upcoming" },
  { key: "history", label: "History" },
  { key: "invoices", label: "Invoices" },
  { key: "profile", label: "Profile" },
];

export function CustomerPortalClient({
  data,
  preview,
}: {
  data: CustomerPortal;
  preview: boolean;
}) {
  const [tab, setTab] = useState<Tab>("upcoming");
  const bookUrl = `/book/${data.publicKey}`;

  return (
    <div>
      {preview && <PreviewNotice>You&rsquo;re viewing a demo customer account. Connect Supabase to see your real bookings.</PreviewNotice>}

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[clamp(1.4rem,3.5vw,1.9rem)] font-bold tracking-[-0.03em] text-ink">
            Welcome back, {data.name.split(" ")[0]}.
          </h1>
          <p className="mt-1 text-[0.88rem] text-ink-muted">
            {data.upcoming.length} upcoming {data.upcoming.length === 1 ? "appointment" : "appointments"}.
          </p>
        </div>
        <a
          href={bookUrl}
          className="group inline-flex items-center gap-2 rounded-[10px] border border-transparent bg-[linear-gradient(180deg,var(--gold-400)_0%,var(--gold-500)_55%,var(--gold-600)_100%)] px-4 py-2.5 text-[0.84rem] font-semibold text-navy-950 shadow-[var(--shadow-gold)] transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[var(--shadow-gold-hover)]"
        >
          <Icon name="plus" className="h-4 w-4" />
          Book again
        </a>
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

      {tab === "upcoming" && (
        <Panel>
          <PanelHeader title="Upcoming appointments" />
          {data.upcoming.length === 0 ? (
            <EmptyState
              icon="calendar"
              title="No upcoming appointments"
              body="Book your next cleaning in a couple of taps."
            />
          ) : (
            <ul className="divide-y divide-line">
              {data.upcoming.map((b) => (
                <BookingRow key={b.id} b={b} actions />
              ))}
            </ul>
          )}
        </Panel>
      )}

      {tab === "history" && (
        <Panel>
          <PanelHeader title="Past appointments" />
          <ul className="divide-y divide-line">
            {data.past.map((b) => (
              <BookingRow key={b.id} b={b} />
            ))}
          </ul>
        </Panel>
      )}

      {tab === "invoices" && (
        <Panel>
          <PanelHeader title="Invoices & receipts" />
          <ul className="divide-y divide-line">
            {data.invoices.map((iv) => (
              <li key={iv.id} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <p className="text-[0.88rem] font-semibold text-ink">{iv.number}</p>
                  <p className="text-[0.76rem] text-ink-faint">Issued {shortDate(iv.issuedAt)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-instrument text-[0.95rem] font-semibold text-ink">{money(iv.totalCents)}</span>
                  <InvoiceStatusBadge status={iv.status} />
                  <button
                    type="button"
                    aria-label="Download receipt"
                    className="flex h-8 w-8 items-center justify-center rounded-[8px] text-ink-faint transition-colors hover:bg-surface-alt hover:text-ink"
                  >
                    <Icon name="download" className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {tab === "profile" && (
        <div className="space-y-5">
          <Panel>
            <PanelHeader title="Contact details" />
            <div className="flex items-center gap-4 px-5 py-5">
              <Avatar name={data.name} color="var(--navy-500)" size={52} />
              <div>
                <p className="text-[0.95rem] font-semibold text-ink">{data.name}</p>
                <p className="text-[0.82rem] text-ink-muted">{data.email}</p>
              </div>
            </div>
          </Panel>
          <Panel>
            <PanelHeader title="Saved addresses" action={<button type="button" className="text-[0.8rem] font-semibold text-blue-600">Add</button>} />
            <ul className="divide-y divide-line">
              {data.addresses.map((a) => (
                <li key={a.label} className="flex items-start gap-3 px-5 py-3.5">
                  <Icon name="mapPin" className="mt-0.5 h-4 w-4 flex-none text-ink-faint" />
                  <div>
                    <p className="text-[0.84rem] font-semibold text-ink">{a.label}</p>
                    <p className="text-[0.8rem] text-ink-muted">{a.line}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel>
            <PanelHeader title="Payment methods" />
            <div className="px-5 py-5">
              <p className="text-[0.83rem] text-ink-muted">
                No cards saved yet. You can add a card securely at checkout when a deposit is required.
              </p>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}

function BookingRow({ b, actions = false }: { b: CustBooking; actions?: boolean }) {
  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
      <div className="flex flex-1 items-center gap-4">
        <div className="flex-none text-center">
          <p className="text-[0.7rem] font-bold tracking-wide text-ink-faint uppercase">
            {new Date(b.startsAt).toLocaleDateString("en-US", { month: "short" })}
          </p>
          <p className="font-instrument text-[1.3rem] leading-none font-semibold text-ink">
            {new Date(b.startsAt).getDate()}
          </p>
        </div>
        <div className="min-w-0 flex-1 border-l border-line pl-4">
          <div className="flex items-center gap-2">
            <p className="truncate text-[0.9rem] font-semibold text-ink">{b.serviceName}</p>
            <BookingStatusBadge status={b.status} />
          </div>
          <p className="mt-0.5 text-[0.78rem] text-ink-muted">
            {relativeDay(b.startsAt)} · {timeRange(b.startsAt, b.endsAt)} · {b.employeeName}
          </p>
          {b.addressLine && <p className="text-[0.75rem] text-ink-faint">{b.addressLine}</p>}
        </div>
        <span className="hidden font-instrument text-[0.95rem] font-semibold text-ink sm:block">
          {money(b.priceCents)}
        </span>
      </div>
      {actions && (
        <div className="flex items-center gap-2 sm:flex-none">
          <button
            type="button"
            className="flex-1 rounded-[9px] border border-line-strong bg-card px-3.5 py-2 text-[0.8rem] font-semibold text-ink transition-colors hover:border-blue-600 hover:text-blue-600 sm:flex-none"
          >
            Reschedule
          </button>
          <button
            type="button"
            className="flex-1 rounded-[9px] border border-line-strong bg-card px-3.5 py-2 text-[0.8rem] font-semibold text-ink-faint transition-colors hover:border-[#c25450] hover:text-[#a63d39] sm:flex-none"
          >
            Cancel
          </button>
        </div>
      )}
    </li>
  );
}
