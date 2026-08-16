"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { money, shortDate, relativeDay } from "@/lib/format";
import type { CustomerView } from "@/lib/dashboard/types";
import { Icon } from "../icons";
import { Avatar, Panel, EmptyState } from "../ui";
import { Sheet } from "../Modal";
import { ActionButton, PreviewNotice, TableWrap, Td, Th, Toolbar } from "./shared";

export function CustomersClient({
  initial,
  preview,
}: {
  initial: CustomerView[];
  preview: boolean;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CustomerView | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? initial.filter(
          (c) =>
            c.fullName.toLowerCase().includes(q) ||
            (c.email ?? "").toLowerCase().includes(q) ||
            c.tags.some((t) => t.toLowerCase().includes(q)),
        )
      : initial;
  }, [initial, query]);

  const totalLtv = initial.reduce((s, c) => s + c.ltvCents, 0);

  return (
    <div>
      {preview && <PreviewNotice />}
      <Toolbar
        search={query}
        onSearch={setQuery}
        placeholder="Search customers…"
        action={<ActionButton>Add customer</ActionButton>}
      >
        <span className="text-[0.8rem] text-ink-faint">
          {initial.length} customers · {money(totalLtv)} lifetime value
        </span>
      </Toolbar>

      <Panel>
        {filtered.length === 0 ? (
          <EmptyState icon="customers" title="No customers found" body="Try a different search." />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Customer</Th>
                <Th>Contact</Th>
                <Th className="text-right">Bookings</Th>
                <Th className="text-right">Lifetime value</Th>
                <Th>Last booking</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setSelected(c)}
                  className="cursor-pointer transition-colors hover:bg-surface-alt/60"
                >
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar name={c.fullName} color="var(--navy-500)" size={34} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-ink">{c.fullName}</span>
                          {c.hasPortalAccount && (
                            <span
                              title="Has portal account"
                              className="inline-flex h-4 items-center rounded-full bg-blue-50 px-1.5 text-[0.6rem] font-bold tracking-wide text-blue-700 uppercase"
                            >
                              Portal
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {c.tags.map((t) => (
                            <Tag key={t} label={t} />
                          ))}
                        </div>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <div className="text-[0.82rem] text-ink-muted">{c.email ?? "—"}</div>
                    <div className="text-[0.76rem] text-ink-faint">{c.phone ?? ""}</div>
                  </Td>
                  <Td className="text-right font-instrument font-semibold">{c.bookingsCount}</Td>
                  <Td className="text-right font-instrument font-semibold">{money(c.ltvCents)}</Td>
                  <Td className="text-ink-muted">
                    {c.lastBookingAt ? relativeDay(c.lastBookingAt) : "—"}
                  </Td>
                  <Td>
                    <Icon name="chevronRight" className="h-4 w-4 text-ink-faint" />
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Panel>

      {selected && (
        <Sheet
          onClose={() => setSelected(null)}
          eyebrow="Customer"
          title={selected.fullName}
        >
          <CustomerDetail c={selected} />
        </Sheet>
      )}
    </div>
  );
}

function Tag({ label }: { label: string }) {
  const tone =
    label === "VIP"
      ? "bg-gold-100 text-gold-700"
      : label === "new"
        ? "bg-blue-50 text-blue-700"
        : label === "commercial"
          ? "bg-navy-50 text-navy-600"
          : "bg-surface-alt text-ink-faint";
  return (
    <span className={cn("rounded-[var(--radius-pill)] px-2 py-[1px] text-[0.64rem] font-semibold", tone)}>
      {label}
    </span>
  );
}

function CustomerDetail({ c }: { c: CustomerView }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Avatar name={c.fullName} color="var(--navy-500)" size={52} />
        <div>
          <div className="flex flex-wrap gap-1">
            {c.tags.map((t) => (
              <Tag key={t} label={t} />
            ))}
          </div>
          <p className="mt-1 text-[0.8rem] text-ink-faint">
            Customer since {shortDate(c.createdAt)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Bookings" value={String(c.bookingsCount)} />
        <Stat label="Lifetime value" value={money(c.ltvCents)} />
      </div>

      <DetailBlock title="Contact">
        <Row icon="customers" label="Email" value={c.email ?? "—"} />
        <Row icon="bell" label="Phone" value={c.phone ?? "—"} />
        <Row icon="mapPin" label="Address" value={c.addressLine ?? "—"} />
        <Row
          icon="user"
          label="Portal access"
          value={c.hasPortalAccount ? "Active" : "Not invited"}
        />
      </DetailBlock>

      <DetailBlock title="Notes">
        <p className="text-[0.82rem] leading-[1.6] text-ink-muted">
          {c.lastBookingAt
            ? `Most recent booking ${relativeDay(c.lastBookingAt).toLowerCase()}.`
            : "No bookings yet."}{" "}
          Add private notes about access, preferences or special instructions here.
        </p>
      </DetailBlock>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-line bg-surface-alt/40 px-4 py-3">
      <p className="text-[0.72rem] font-semibold text-ink-faint">{label}</p>
      <p className="font-instrument mt-1 text-[1.3rem] font-semibold text-ink">{value}</p>
    </div>
  );
}

function DetailBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2.5 text-[0.68rem] font-bold tracking-[0.14em] text-ink-faint uppercase">
        {title}
      </p>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function Row({
  icon,
  label,
  value,
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon name={icon} className="mt-0.5 h-4 w-4 flex-none text-ink-faint" />
      <div className="min-w-0">
        <p className="text-[0.7rem] text-ink-faint">{label}</p>
        <p className="text-[0.85rem] break-words text-ink">{value}</p>
      </div>
    </div>
  );
}
