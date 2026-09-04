"use client";

import { money, shortDate, timeOfDay } from "@/lib/format";
import { PLANS } from "@/lib/plans";
import type { PaymentsData } from "@/lib/dashboard/types";
import { Icon } from "../icons";
import { PaymentStatusBadge, Panel, PanelHeader, StatCard } from "../ui";
import { GhostBtn, TableWrap, Td, Th } from "./shared";

const KIND_LABEL = { payment: "Payment", deposit: "Deposit", refund: "Refund" } as const;

export function PaymentsClient({
  data,
}: {
  data: PaymentsData;
}) {
  const sub = data.subscription;
  const plan = PLANS[sub.plan];

  return (
    <div>
      {!sub.paymentsEnabled && (
        <div className="mb-5 flex flex-col gap-3 rounded-[16px] border border-gold-300 bg-gold-50 px-5 py-4 min-[561px]:flex-row min-[561px]:items-center min-[561px]:justify-between">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full bg-gold-500 text-navy-950">
              <Icon name="payments" className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[0.9rem] font-semibold text-ink">Connect Stripe to take payments</p>
              <p className="mt-0.5 text-[0.8rem] text-ink-muted">
                Accept deposits and card payments in your booking widget. Setup takes a few minutes.
              </p>
            </div>
          </div>
          <a
            href="/dashboard/settings#integrations"
            className="inline-flex flex-none items-center justify-center gap-2 rounded-[10px] bg-navy-900 px-4 py-2.5 text-[0.82rem] font-semibold text-white transition-colors hover:bg-navy-800"
          >
            Connect Stripe
            <Icon name="arrowRight" className="h-4 w-4" />
          </a>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <div className="grid grid-cols-1 gap-4 min-[521px]:grid-cols-3">
            <StatCard label="Gross volume" value={money(data.grossCents)} caption="succeeded" />
            <StatCard label="Deposits held" value={money(data.depositsHeldCents)} caption="pre-paid" />
            <StatCard label="Refunded" value={money(data.refundedCents)} caption="this period" />
          </div>

          <Panel>
            <PanelHeader title="Transactions" caption="Payments, deposits and refunds" />
            {data.payments.length === 0 ? (
              <p className="px-5 py-10 text-center text-[0.85rem] text-ink-faint">No payments yet.</p>
            ) : (
              <TableWrap>
                <thead>
                  <tr>
                    <Th>Customer</Th>
                    <Th>Type</Th>
                    <Th>Reference</Th>
                    <Th>When</Th>
                    <Th className="text-right">Amount</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.payments.map((p) => (
                    <tr key={p.id} className="transition-colors hover:bg-surface-alt/60">
                      <Td className="font-semibold text-ink">{p.customerName}</Td>
                      <Td className="text-ink-muted">{KIND_LABEL[p.kind]}</Td>
                      <Td className="text-ink-faint">{p.invoiceNumber ?? "—"}</Td>
                      <Td className="text-ink-muted">
                        {shortDate(p.at)} · {timeOfDay(p.at)}
                      </Td>
                      <Td className="text-right">
                        <span
                          className={
                            "font-instrument font-semibold " +
                            (p.kind === "refund" ? "text-[#a63d39]" : "text-ink")
                          }
                        >
                          {p.kind === "refund" ? "−" : ""}
                          {money(p.amountCents)}
                        </span>
                      </Td>
                      <Td>
                        <PaymentStatusBadge status={p.status} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </Panel>
        </div>

        {/* Subscription card */}
        <div className="space-y-5">
          <Panel>
            <PanelHeader title="Your subscription" />
            <div className="px-5 py-5">
              <div className="flex items-end justify-between">
                <div>
                  <p className="font-display text-[1.3rem] font-semibold text-ink">{plan.name}</p>
                  <p className="text-[0.8rem] text-ink-faint">{plan.description}</p>
                </div>
                <p className="font-instrument text-[1.5rem] font-semibold text-ink">
                  ${sub.priceMonthly}
                  <span className="text-[0.8rem] font-medium text-ink-faint">/mo</span>
                </p>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <StatusPill status={sub.status} />
                {sub.trialDaysLeft !== null && (
                  <span className="text-[0.78rem] text-ink-muted">
                    {sub.trialDaysLeft} days left in trial
                  </span>
                )}
              </div>

              <ul className="mt-5 space-y-2 border-t border-line pt-4">
                {plan.highlights.slice(0, 4).map((h) => (
                  <li key={h} className="flex items-start gap-2 text-[0.82rem] text-ink-muted">
                    <Icon name="check" className="mt-0.5 h-4 w-4 flex-none text-success-700" />
                    {h}
                  </li>
                ))}
              </ul>

              <div className="mt-5 flex flex-col gap-2">
                <a
                  href="/dashboard/settings#billing"
                  className="inline-flex items-center justify-center gap-2 rounded-[10px] border border-transparent bg-navy-900 px-4 py-2.5 text-[0.83rem] font-semibold text-white transition-colors hover:bg-navy-800"
                >
                  Manage plan
                </a>
                <GhostBtn>Billing history</GhostBtn>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: PaymentsData["subscription"]["status"] }) {
  const map: Record<string, { label: string; cls: string }> = {
    trialing: { label: "Trialing", cls: "bg-blue-50 text-blue-700" },
    active: { label: "Active", cls: "bg-success-50 text-success-700" },
    past_due: { label: "Past due", cls: "bg-[#fbeaea] text-[#a63d39]" },
    canceled: { label: "Canceled", cls: "bg-surface-alt text-ink-faint" },
    suspended: { label: "Suspended", cls: "bg-[#fbeaea] text-[#a63d39]" },
  };
  const cfg = map[status] ?? map.active;
  return (
    <span className={`inline-flex items-center rounded-[var(--radius-pill)] px-2.5 py-[3px] text-[0.72rem] font-semibold ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}
