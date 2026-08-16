"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import {
  deleteService,
  saveService,
  setServiceActive,
  type ServiceDraft,
} from "@/lib/actions/services";
import type { ServiceView } from "@/lib/dashboard/types";
import { Icon } from "../icons";
import { Panel, EmptyState } from "../ui";
import { Modal } from "../Modal";
import { inputBase, Label } from "@/components/ui/Field";
import { ActionButton, GhostBtn, PreviewNotice, Toolbar } from "./shared";

const emptyDraft: ServiceDraft = {
  name: "",
  category: "Residential",
  durationMinutes: 60,
  priceCents: 0,
  depositCents: 0,
  bufferAfter: 15,
  description: "",
  addons: [],
};

function viewToDraft(s: ServiceView): ServiceDraft {
  return {
    id: s.id,
    name: s.name,
    category: s.category ?? "Residential",
    durationMinutes: s.durationMinutes,
    priceCents: s.priceCents,
    depositCents: s.depositCents,
    bufferAfter: s.bufferAfter,
    description: s.description ?? "",
    addons: s.addons.map((a) => ({
      id: a.id,
      name: a.name,
      priceCents: a.priceCents,
      durationMinutes: a.durationMinutes,
    })),
  };
}

export function ServicesClient({
  initial,
  preview,
}: {
  initial: ServiceView[];
  preview: boolean;
}) {
  const router = useRouter();
  const [services, setServices] = useState(initial);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<ServiceDraft | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? services.filter(
          (s) => s.name.toLowerCase().includes(q) || (s.category ?? "").toLowerCase().includes(q),
        )
      : services;
  }, [services, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, ServiceView[]>();
    for (const s of filtered) {
      const key = s.category ?? "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return [...map.entries()];
  }, [filtered]);

  function optimisticApply(draft: ServiceDraft, id: string) {
    const view: ServiceView = {
      id,
      name: draft.name,
      description: draft.description || null,
      category: draft.category,
      durationMinutes: draft.durationMinutes,
      priceCents: draft.priceCents,
      depositCents: draft.depositCents,
      bufferBefore: 0,
      bufferAfter: draft.bufferAfter,
      active: services.find((s) => s.id === draft.id)?.active ?? true,
      addons: draft.addons.map((a, i) => ({
        id: a.id ?? `local-a-${i}`,
        name: a.name,
        priceCents: a.priceCents,
        durationMinutes: a.durationMinutes,
      })),
      employeeCount: services.find((s) => s.id === draft.id)?.employeeCount ?? 0,
      bookingCount: services.find((s) => s.id === draft.id)?.bookingCount ?? 0,
    };
    setServices((prev) =>
      draft.id ? prev.map((s) => (s.id === draft.id ? view : s)) : [...prev, view],
    );
  }

  async function toggle(id: string) {
    const next = !services.find((s) => s.id === id)?.active;
    setServices((prev) => prev.map((s) => (s.id === id ? { ...s, active: next } : s)));
    if (!preview) await setServiceActive(id, next);
  }

  async function remove(id: string) {
    const prev = services;
    setServices((p) => p.filter((s) => s.id !== id));
    if (!preview) {
      const res = await deleteService(id);
      if (!res.ok) {
        setServices(prev); // revert
        alert(res.error);
      } else {
        router.refresh();
      }
    }
  }

  const activeCount = services.filter((s) => s.active).length;

  return (
    <div>
      {preview && <PreviewNotice />}

      <Toolbar
        search={query}
        onSearch={setQuery}
        placeholder="Search services…"
        action={<ActionButton onClick={() => setEditing({ ...emptyDraft })}>New service</ActionButton>}
      >
        <span className="text-[0.8rem] text-ink-faint">
          {activeCount} active · {services.length} total
        </span>
      </Toolbar>

      {filtered.length === 0 ? (
        <Panel>
          <EmptyState
            icon="services"
            title="No services yet"
            body="Add the services customers can book — set duration, price, an optional deposit and add-ons."
            action={<ActionButton onClick={() => setEditing({ ...emptyDraft })}>New service</ActionButton>}
          />
        </Panel>
      ) : (
        <div className="space-y-7">
          {grouped.map(([category, items]) => (
            <section key={category}>
              <p className="mb-3 text-[0.7rem] font-bold tracking-[0.16em] text-ink-faint uppercase">
                {category}
              </p>
              <div className="grid grid-cols-1 gap-4 min-[641px]:grid-cols-2 xl:grid-cols-3">
                {items.map((s) => (
                  <ServiceCard
                    key={s.id}
                    service={s}
                    onEdit={() => setEditing(viewToDraft(s))}
                    onToggle={() => toggle(s.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {editing && (
        <ServiceModal
          draft={editing}
          preview={preview}
          onClose={() => setEditing(null)}
          onSaved={(draft, id) => {
            optimisticApply(draft, id);
            setEditing(null);
            if (!preview) router.refresh();
          }}
          onDelete={
            editing.id
              ? () => {
                  const id = editing.id!;
                  setEditing(null);
                  remove(id);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

function ServiceCard({
  service: s,
  onEdit,
  onToggle,
}: {
  service: ServiceView;
  onEdit: () => void;
  onToggle: () => void;
}) {
  const hours = Math.floor(s.durationMinutes / 60);
  const mins = s.durationMinutes % 60;
  const duration = [hours ? `${hours}h` : "", mins ? `${mins}m` : ""].filter(Boolean).join(" ");
  return (
    <Panel className={cn("flex flex-col p-5", !s.active && "opacity-70")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-display text-[1rem] font-semibold tracking-[-0.01em] text-ink">
            {s.name}
          </h3>
          <p className="mt-1 line-clamp-2 text-[0.79rem] leading-[1.5] text-ink-faint">
            {s.description}
          </p>
        </div>
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${s.name}`}
          className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] text-ink-faint transition-colors hover:bg-surface-alt hover:text-ink"
        >
          <Icon name="settings" className="h-[16px] w-[16px]" />
        </button>
      </div>

      <div className="mt-4 flex items-end justify-between">
        <div>
          <p className="font-instrument text-[1.4rem] leading-none font-semibold text-ink">
            {money(s.priceCents)}
          </p>
          {s.depositCents > 0 && (
            <p className="mt-1 text-[0.72rem] text-ink-faint">{money(s.depositCents)} deposit</p>
          )}
        </div>
        <div className="text-right text-[0.75rem] text-ink-muted">
          <p className="inline-flex items-center gap-1">
            <Icon name="clock" className="h-3.5 w-3.5 text-ink-faint" />
            {duration}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
        <div className="flex items-center gap-3 text-[0.72rem] text-ink-faint">
          <span>{s.addons.length} add-ons</span>
          <span>·</span>
          <span>{s.employeeCount} staff</span>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] px-2.5 py-[3px] text-[0.7rem] font-semibold transition-colors",
            s.active ? "bg-success-50 text-success-700" : "bg-surface-alt text-ink-faint",
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", s.active ? "bg-success-500" : "bg-ink-faint")} />
          {s.active ? "Active" : "Inactive"}
        </button>
      </div>
    </Panel>
  );
}

function ServiceModal({
  draft,
  preview,
  onClose,
  onSaved,
  onDelete,
}: {
  draft: ServiceDraft;
  preview: boolean;
  onClose: () => void;
  onSaved: (draft: ServiceDraft, id: string) => void;
  onDelete?: () => void;
}) {
  const [d, setD] = useState<ServiceDraft>(draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof ServiceDraft>(k: K, v: ServiceDraft[K]) => setD((p) => ({ ...p, [k]: v }));
  const dollars = (cents: number) => (cents ? (cents / 100).toString() : "");
  const toCents = (v: string) => Math.round((parseFloat(v) || 0) * 100);

  const setAddon = (i: number, patch: Partial<ServiceDraft["addons"][number]>) =>
    setD((p) => ({ ...p, addons: p.addons.map((a, j) => (j === i ? { ...a, ...patch } : a)) }));
  const addAddon = () =>
    setD((p) => ({ ...p, addons: [...p.addons, { name: "", priceCents: 0, durationMinutes: 0 }] }));
  const removeAddon = (i: number) =>
    setD((p) => ({ ...p, addons: p.addons.filter((_, j) => j !== i) }));

  async function submit() {
    setBusy(true);
    setError(null);
    if (preview) {
      onSaved(d, d.id ?? `local-${Date.now()}`);
      return;
    }
    const res = await saveService(d);
    if (res.ok) onSaved(d, res.id);
    else {
      setError(res.error);
      setBusy(false);
    }
  }

  return (
    <Modal
      onClose={onClose}
      title={draft.id ? "Edit service" : "New service"}
      description={preview ? "Preview mode — changes won't be saved." : undefined}
      size="lg"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          {onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              className="text-[0.82rem] font-semibold text-ink-faint transition-colors hover:text-[#a63d39]"
            >
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <GhostBtn onClick={onClose}>Cancel</GhostBtn>
            <ActionButton icon="check" onClick={submit}>
              {busy ? "Saving…" : draft.id ? "Save changes" : "Add service"}
            </ActionButton>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-[10px] border border-[#e4b7b5] bg-[#fdf6f5] px-3.5 py-2.5 text-[0.82rem] text-[#8c3531]">
            {error}
          </div>
        )}
        <div>
          <Label htmlFor="svc-name">Service name</Label>
          <input id="svc-name" className={inputBase} value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="Standard Home Cleaning" />
        </div>
        <div>
          <Label htmlFor="svc-desc" hint="Optional">Description</Label>
          <textarea id="svc-desc" className={cn(inputBase, "min-h-[64px] resize-y")} value={d.description} onChange={(e) => set("description", e.target.value)} placeholder="What's included…" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="svc-cat">Category</Label>
            <input id="svc-cat" className={inputBase} value={d.category} onChange={(e) => set("category", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="svc-dur">Duration (min)</Label>
            <input id="svc-dur" type="number" min={5} step={5} className={inputBase} value={d.durationMinutes} onChange={(e) => set("durationMinutes", parseInt(e.target.value) || 0)} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label htmlFor="svc-price">Price ($)</Label>
            <input id="svc-price" type="number" min={0} className={inputBase} defaultValue={dollars(d.priceCents)} onChange={(e) => set("priceCents", toCents(e.target.value))} />
          </div>
          <div>
            <Label htmlFor="svc-dep">Deposit ($)</Label>
            <input id="svc-dep" type="number" min={0} className={inputBase} defaultValue={dollars(d.depositCents)} onChange={(e) => set("depositCents", toCents(e.target.value))} />
          </div>
          <div>
            <Label htmlFor="svc-buf">Buffer (min)</Label>
            <input id="svc-buf" type="number" min={0} step={5} className={inputBase} value={d.bufferAfter} onChange={(e) => set("bufferAfter", parseInt(e.target.value) || 0)} />
          </div>
        </div>

        {/* Add-ons */}
        <div className="border-t border-line pt-4">
          <p className="mb-2.5 text-[0.82rem] font-semibold text-ink">
            Add-ons <span className="font-normal text-ink-faint">— optional extras (inside fridge, oven, blinds…)</span>
          </p>
          {d.addons.length > 0 && (
            <div className="mb-2.5 space-y-2">
              {d.addons.map((a, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    className={cn(inputBase, "flex-1")}
                    placeholder="Inside fridge"
                    value={a.name}
                    onChange={(e) => setAddon(i, { name: e.target.value })}
                    aria-label="Add-on name"
                  />
                  <div className="relative w-[110px] flex-none">
                    <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[0.85rem] text-ink-faint">$</span>
                    <input
                      className={cn(inputBase, "pl-7")}
                      type="number"
                      min={0}
                      placeholder="0"
                      defaultValue={a.priceCents ? a.priceCents / 100 : ""}
                      onChange={(e) => setAddon(i, { priceCents: toCents(e.target.value) })}
                      aria-label="Add-on price"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeAddon(i)}
                    aria-label="Remove add-on"
                    className="flex-none rounded-[8px] px-2.5 py-2 text-ink-faint transition-colors hover:bg-[#fdf6f5] hover:text-[#a63d39]"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          <button type="button" onClick={addAddon} className="text-[0.82rem] font-semibold text-blue-600 transition-colors hover:text-blue-700">
            + Add an add-on
          </button>
        </div>
      </div>
    </Modal>
  );
}
