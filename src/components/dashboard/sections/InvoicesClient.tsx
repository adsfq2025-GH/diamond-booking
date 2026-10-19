"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import {
  invoiceDownloadUrl,
  markInvoicePaid,
  refundInvoice,
  sendInvoice,
} from "@/lib/actions/invoices";
import { money, shortDate } from "@/lib/format";
import type { InvoiceView, InvoicesData } from "@/lib/dashboard/types";
import type { InvoiceStatus } from "@/types/database";
import { InvoiceStatusBadge, Panel, StatCard, EmptyState } from "../ui";
import { Modal } from "../Modal";
import {
  ActionButton,
  FilterTabs,
  GhostBtn,
  TableWrap,
  Td,
  Th,
  Toolbar,
} from "./shared";

type Tab = InvoiceStatus | "all";
const TABS: Tab[] = ["all", "draft", "sent", "partially_paid", "paid", "overdue"];
const LABEL: Record<Tab, string> = {
  all: "All",
  draft: "Draft",
  sent: "Sent",
  partially_paid: "Partial",
  paid: "Paid",
  overdue: "Overdue",
  refunded: "Refunded",
  void: "Void",
};

export function InvoicesClient({
  data,
}: {
  data: InvoicesData;
}) {
  const [rows, setRows] = useState(data.invoices);
  const [busy, setBusy] = useState<"paid" | "refund" | "send" | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [open, setOpen] = useState<InvoiceView | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  const filtered = useMemo(
    () => (tab === "all" ? rows : rows.filter((r) => r.status === tab)),
    [rows, tab],
  );

  function update(id: string, patch: Partial<InvoiceView>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setOpen((o) => (o && o.id === id ? { ...o, ...patch } : o));
  }

  /** Run a real server action and reflect whatever it reports back. */
  async function run(id: string, kind: "paid" | "refund" | "send") {
    setBusy(kind);
    setNotice(null);
    const result =
      kind === "paid"
        ? await markInvoicePaid(id)
        : kind === "refund"
          ? await refundInvoice(id)
          : await sendInvoice(id);
    setBusy(null);

    if (!result.ok) {
      setNotice({ tone: "error", text: result.error });
      return;
    }
    update(id, { status: result.status, paidCents: result.paidCents });
    if (result.message) setNotice({ tone: "ok", text: result.message });
  }

  async function download(id: string) {
    setNotice(null);
    const result = await invoiceDownloadUrl(id);
    if (!result.ok) {
      setNotice({ tone: "error", text: result.error });
      return;
    }
    window.open(result.url, "_blank", "noopener");
  }

  return (
    <div>
      <div className="mb-5 grid grid-cols-1 gap-4 min-[521px]:grid-cols-3">
        <StatCard label="Outstanding" value={money(data.outstandingCents)} caption="awaiting payment" />
        <StatCard label="Collected this month" value={money(data.paidThisMonthCents)} caption="paid invoices" />
        <StatCard label="Overdue" value={String(data.overdueCount)} caption="need follow-up" />
      </div>

      <Toolbar action={<ActionButton>New invoice</ActionButton>} />
      <div className="mb-4">
        <FilterTabs
          value={tab}
          onChange={setTab}
          tabs={TABS.map((k) => ({ key: k, label: LABEL[k], count: counts[k] ?? 0 }))}
        />
      </div>

      <Panel>
        {filtered.length === 0 ? (
          <EmptyState icon="invoices" title="No invoices" body="Invoices you generate will appear here." />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Invoice</Th>
                <Th>Customer</Th>
                <Th>Issued</Th>
                <Th>Due</Th>
                <Th className="text-right">Total</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((iv) => (
                <tr
                  key={iv.id}
                  onClick={() => setOpen(iv)}
                  className="cursor-pointer transition-colors hover:bg-surface-alt/60"
                >
                  <Td className="font-semibold text-ink">{iv.number}</Td>
                  <Td className="text-ink-muted">{iv.customerName}</Td>
                  <Td className="text-ink-muted">{shortDate(iv.issuedAt)}</Td>
                  <Td className="text-ink-muted">{iv.dueAt ? shortDate(iv.dueAt) : "—"}</Td>
                  <Td className="text-right">
                    <span className="font-instrument font-semibold text-ink">{money(iv.totalCents)}</span>
                    {iv.paidCents > 0 && iv.paidCents < iv.totalCents && (
                      <div className="text-[0.7rem] text-ink-faint">{money(iv.paidCents)} paid</div>
                    )}
                  </Td>
                  <Td>
                    <InvoiceStatusBadge status={iv.status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Panel>

      {open && (
        <Modal
          onClose={() => setOpen(null)}
          title={open.number}
          description={open.customerName}
          size="lg"
          footer={
            <>
              <GhostBtn icon="download" onClick={() => void download(open.id)}>
                Download PDF
              </GhostBtn>
              {open.status === "draft" && (
                <GhostBtn onClick={() => void run(open.id, "send")}>
                  {busy === "send" ? "Sending…" : "Mark as sent"}
                </GhostBtn>
              )}
              {open.status !== "paid" && open.status !== "refunded" && (
                <ActionButton icon="check" onClick={() => void run(open.id, "paid")}>
                  {busy === "paid" ? "Saving…" : "Record as paid"}
                </ActionButton>
              )}
              {open.status === "paid" && (
                <GhostBtn onClick={() => void run(open.id, "refund")}>
                  {busy === "refund" ? "Refunding…" : "Refund"}
                </GhostBtn>
              )}
            </>
          }
        >
          {/*
            Every outcome is reported. These controls used to change local React
            state only, so an owner could believe a refund had been issued when
            no money had moved.
          */}
          {notice && (
            <div
              className={cn(
                "mb-4 rounded-[10px] border px-4 py-3 text-[0.82rem]",
                notice.tone === "error"
                  ? "border-[#e8c0bd] bg-[#fdf6f5] text-[#a63d39]"
                  : "border-success-500/40 bg-success-50 text-success-700",
              )}
              role="status"
            >
              {notice.text}
            </div>
          )}
          <InvoiceBody iv={open} />
        </Modal>
      )}
    </div>
  );
}

function InvoiceBody({ iv }: { iv: InvoiceView }) {
  const balance = iv.totalCents - iv.paidCents;
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <InvoiceStatusBadge status={iv.status} />
        <div className="text-right">
          <p className="text-[0.72rem] text-ink-faint">Issued {shortDate(iv.issuedAt)}</p>
          {iv.dueAt && <p className="text-[0.72rem] text-ink-faint">Due {shortDate(iv.dueAt)}</p>}
        </div>
      </div>

      <div className="overflow-hidden rounded-[12px] border border-line">
        <table className="w-full text-left text-[0.85rem]">
          <thead>
            <tr className="bg-surface-alt/60">
              <th className="px-4 py-2.5 text-[0.68rem] font-bold tracking-[0.08em] text-ink-faint uppercase">Item</th>
              <th className="px-4 py-2.5 text-center text-[0.68rem] font-bold tracking-[0.08em] text-ink-faint uppercase">Qty</th>
              <th className="px-4 py-2.5 text-right text-[0.68rem] font-bold tracking-[0.08em] text-ink-faint uppercase">Amount</th>
            </tr>
          </thead>
          <tbody>
            {iv.lineItems.map((li, i) => (
              <tr key={i} className="border-t border-line">
                <td className="px-4 py-2.5 text-ink">{li.description}</td>
                <td className="px-4 py-2.5 text-center text-ink-muted">{li.qty}</td>
                <td className="px-4 py-2.5 text-right font-instrument font-semibold text-ink">
                  {money(li.amountCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 ml-auto max-w-[240px] space-y-1.5 text-[0.85rem]">
        <Line label="Total" value={money(iv.totalCents)} bold />
        <Line label="Paid" value={money(iv.paidCents)} />
        <div className="border-t border-line pt-1.5">
          <Line label="Balance due" value={money(balance)} bold accent />
        </div>
      </div>
    </div>
  );
}

function Line({
  label,
  value,
  bold,
  accent,
}: {
  label: string;
  value: string;
  bold?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={bold ? "font-semibold text-ink" : "text-ink-muted"}>{label}</span>
      <span
        className={
          "font-instrument font-semibold " + (accent ? "text-blue-700" : "text-ink")
        }
      >
        {value}
      </span>
    </div>
  );
}
