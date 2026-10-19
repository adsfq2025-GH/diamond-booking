"use client";

import { useState } from "react";
import { createCoupon, deleteCoupon, setCouponActive } from "@/lib/actions/coupons";
import { cn } from "@/lib/cn";
import { money, shortDate } from "@/lib/format";
import type { CouponView } from "@/lib/dashboard/types";
import { Icon, type IconName } from "../icons";
import { Panel, PanelHeader, EmptyState } from "../ui";
import { Modal } from "../Modal";
import { inputBase, Label, SelectShell } from "@/components/ui/Field";
import { ActionButton, GhostBtn, TableWrap, Td, Th, Toolbar } from "./shared";

type Draft = {
  code: string;
  type: "pct" | "amount";
  value: number;
  maxRedemptions: string;
};

export function MarketingClient({
  initial,
}: {
  initial: CouponView[];
}) {
  const [coupons, setCoupons] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  /**
   * Persist the activate/pause change. This used to flip a boolean in local
   * state only: nothing reached the coupons table, and the code kept working
   * (or kept not working) regardless of what the badge said (A16).
   */
  async function toggle(id: string, next: boolean) {
    setBusyId(id);
    setNotice(null);
    const result = await setCouponActive(id, next);
    setBusyId(null);
    if (!result.ok) {
      setNotice({ tone: "error", text: result.error });
      return;
    }
    setCoupons((prev) => prev.map((c) => (c.id === id ? { ...c, active: result.active } : c)));
  }

  async function add(d: Draft): Promise<string | null> {
    const result = await createCoupon({
      code: d.code,
      type: d.type,
      value: d.value,
      maxRedemptions: d.maxRedemptions ? parseInt(d.maxRedemptions, 10) : null,
    });
    if (!result.ok) return result.error;
    setCoupons((prev) => [result.coupon, ...prev]);
    setCreating(false);
    setNotice({ tone: "ok", text: `${result.coupon.code} is live and will apply at checkout.` });
    return null;
  }

  async function remove(id: string) {
    setBusyId(id);
    setNotice(null);
    const result = await deleteCoupon(id);
    setBusyId(null);
    if (!result.ok) {
      setNotice({ tone: "error", text: result.error });
      return;
    }
    if (result.deleted) {
      setCoupons((prev) => prev.filter((c) => c.id !== id));
    } else {
      // Redeemed coupons are kept so the bookings that used them keep history.
      setCoupons((prev) => prev.map((c) => (c.id === id ? { ...c, active: false } : c)));
      setNotice({
        tone: "ok",
        text: "That code has been redeemed before, so it was paused rather than deleted.",
      });
    }
  }

  return (
    <div>
      <Toolbar action={<ActionButton onClick={() => setCreating(true)}>New coupon</ActionButton>}>
        <span className="text-[0.8rem] text-ink-faint">
          {coupons.filter((c) => c.active).length} active promotions
        </span>
      </Toolbar>

      {notice && (
        <div
          role="status"
          className={cn(
            "mb-4 rounded-[10px] border px-4 py-3 text-[0.82rem]",
            notice.tone === "error"
              ? "border-[#e8c0bd] bg-[#fdf6f5] text-[#a63d39]"
              : "border-success-500/40 bg-success-50 text-success-700",
          )}
        >
          {notice.text}
        </div>
      )}

      <Panel className="mb-6">
        <PanelHeader title="Coupons & promotions" caption="Discount codes customers can enter in your booking widget" />
        {coupons.length === 0 ? (
          <EmptyState icon="marketing" title="No coupons yet" body="Create a discount code to run a promotion." />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Code</Th>
                <Th>Discount</Th>
                <Th className="text-right">Redemptions</Th>
                <Th>Expires</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.id} className="transition-colors hover:bg-surface-alt/60">
                  <Td>
                    <span className="font-instrument rounded-[6px] bg-surface-alt px-2 py-1 text-[0.82rem] font-semibold tracking-wide text-ink">
                      {c.code}
                    </span>
                  </Td>
                  <Td className="font-semibold text-ink">
                    {c.pctOff != null ? `${c.pctOff}% off` : money(c.amountOffCents ?? 0) + " off"}
                  </Td>
                  <Td className="text-right text-ink-muted">
                    {c.redemptions}
                    {c.maxRedemptions ? ` / ${c.maxRedemptions}` : ""}
                  </Td>
                  <Td className="text-ink-muted">{c.expiresAt ? shortDate(c.expiresAt) : "No expiry"}</Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={busyId === c.id}
                        onClick={() => void toggle(c.id, !c.active)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] px-2.5 py-[3px] text-[0.72rem] font-semibold transition-colors disabled:opacity-50",
                          c.active ? "bg-success-50 text-success-700" : "bg-surface-alt text-ink-faint",
                        )}
                      >
                        <span className={cn("h-1.5 w-1.5 rounded-full", c.active ? "bg-success-500" : "bg-ink-faint")} />
                        {busyId === c.id ? "Saving…" : c.active ? "Active" : "Paused"}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === c.id}
                        onClick={() => void remove(c.id)}
                        aria-label={`Delete coupon ${c.code}`}
                        className="rounded-[8px] px-2 py-1 text-[0.72rem] font-semibold text-ink-faint transition-colors hover:bg-[#fdf6f5] hover:text-[#a63d39] disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-4 min-[641px]:grid-cols-2">
        <ComingCard
          icon="customers"
          title="Referral program"
          body="Reward customers for bringing in new business with automatic referral credits."
        />
        <ComingCard
          icon="marketing"
          title="Email campaigns"
          body="Send on-brand promotions and win-back emails to your customer list."
        />
      </div>

      {creating && <CouponModal onClose={() => setCreating(false)} onSave={add} />}
    </div>
  );
}

function ComingCard({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return (
    <Panel className="flex items-start gap-4 p-5">
      <span className="flex h-11 w-11 flex-none items-center justify-center rounded-[12px] bg-surface-alt text-ink-faint">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <div>
        <div className="flex items-center gap-2">
          <h3 className="font-display text-[0.98rem] font-semibold text-ink">{title}</h3>
          <span className="rounded-[var(--radius-pill)] bg-blue-50 px-2 py-[1px] text-[0.62rem] font-bold tracking-wide text-blue-700 uppercase">
            Soon
          </span>
        </div>
        <p className="mt-1 text-[0.82rem] leading-[1.6] text-ink-faint">{body}</p>
      </div>
    </Panel>
  );
}

function CouponModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  /** Resolves to an error message, or null when the coupon was saved. */
  onSave: (d: Draft) => Promise<string | null>;
}) {
  const [d, setD] = useState<Draft>({ code: "", type: "pct", value: 10, maxRedemptions: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  async function save() {
    setSaving(true);
    setError(null);
    const message = await onSave(d);
    setSaving(false);
    // On success the parent closes this modal; on failure we stay open and say why.
    if (message) setError(message);
  }

  return (
    <Modal
      onClose={onClose}
      title="New coupon"
      description="Create a discount code"
      footer={
        <>
          <GhostBtn onClick={onClose}>Cancel</GhostBtn>
          <ActionButton icon="check" onClick={() => void save()}>
            {saving ? "Creating…" : "Create coupon"}
          </ActionButton>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <div
            role="alert"
            className="rounded-[10px] border border-[#e8c0bd] bg-[#fdf6f5] px-4 py-3 text-[0.82rem] text-[#a63d39]"
          >
            {error}
          </div>
        )}
        <div>
          <Label htmlFor="cp-code">Code</Label>
          <input
            id="cp-code"
            className={cn(inputBase, "uppercase")}
            value={d.code}
            onChange={(e) => set("code", e.target.value)}
            placeholder="SUMMER20"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="cp-type">Type</Label>
            <SelectShell>
              <select
                id="cp-type"
                className={cn(inputBase, "appearance-none pr-9")}
                value={d.type}
                onChange={(e) => set("type", e.target.value as Draft["type"])}
              >
                <option value="pct">Percentage off</option>
                <option value="amount">Amount off ($)</option>
              </select>
            </SelectShell>
          </div>
          <div>
            <Label htmlFor="cp-val">{d.type === "pct" ? "Percent" : "Amount ($)"}</Label>
            <input
              id="cp-val"
              type="number"
              min={0}
              className={inputBase}
              value={d.value}
              onChange={(e) => set("value", parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="cp-max" hint="Optional">Max redemptions</Label>
          <input
            id="cp-max"
            type="number"
            min={0}
            className={inputBase}
            value={d.maxRedemptions}
            onChange={(e) => set("maxRedemptions", e.target.value)}
            placeholder="Unlimited"
          />
        </div>
      </div>
    </Modal>
  );
}
