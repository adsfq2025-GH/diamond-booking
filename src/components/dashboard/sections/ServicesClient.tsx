"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import type { ServiceView } from "@/lib/dashboard/types";
import { Icon } from "../icons";
import { Panel, EmptyState } from "../ui";
import { Modal } from "../Modal";
import { inputBase, Label } from "@/components/ui/Field";
import { ActionButton, GhostBtn, PreviewNotice, Toolbar } from "./shared";

type Draft = {
  id?: string;
  name: string;
  category: string;
  durationMinutes: number;
  priceCents: number;
  depositCents: number;
  bufferAfter: number;
  description: string;
};

const emptyDraft: Draft = {
  name: "",
  category: "Residential",
  durationMinutes: 60,
  priceCents: 0,
  depositCents: 0,
  bufferAfter: 15,
  description: "",
};

export function ServicesClient({
  initial,
  preview,
}: {
  initial: ServiceView[];
  preview: boolean;
}) {
  const [services, setServices] = useState(initial);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Draft | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? services.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            (s.category ?? "").toLowerCase().includes(q),
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

  function save(draft: Draft) {
    if (draft.id) {
      setServices((prev) =>
        prev.map((s) =>
          s.id === draft.id
            ? { ...s, ...toView(draft, s) }
            : s,
        ),
      );
    } else {
      setServices((prev) => [
        ...prev,
        {
          ...toView(draft),
          id: `local-${Date.now()}`,
          active: true,
          addons: [],
          employeeCount: 0,
          bookingCount: 0,
        } as ServiceView,
      ]);
    }
    setEditing(null);
  }

  function toggleActive(id: string) {
    setServices((prev) =>
      prev.map((s) => (s.id === id ? { ...s, active: !s.active } : s)),
    );
  }

  const activeCount = services.filter((s) => s.active).length;

  return (
    <div>
      {preview && <PreviewNotice />}

      <Toolbar
        search={query}
        onSearch={setQuery}
        placeholder="Search services…"
        action={
          <ActionButton onClick={() => setEditing({ ...emptyDraft })}>
            New service
          </ActionButton>
        }
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
            body="Add the services customers can book — set duration, price and an optional deposit."
            action={
              <ActionButton onClick={() => setEditing({ ...emptyDraft })}>
                New service
              </ActionButton>
            }
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
                    onEdit={() =>
                      setEditing({
                        id: s.id,
                        name: s.name,
                        category: s.category ?? "Residential",
                        durationMinutes: s.durationMinutes,
                        priceCents: s.priceCents,
                        depositCents: s.depositCents,
                        bufferAfter: s.bufferAfter,
                        description: s.description ?? "",
                      })
                    }
                    onToggle={() => toggleActive(s.id)}
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
          onSave={save}
        />
      )}
    </div>
  );
}

function toView(d: Draft, base?: ServiceView): Partial<ServiceView> {
  return {
    name: d.name,
    category: d.category,
    durationMinutes: d.durationMinutes,
    priceCents: d.priceCents,
    depositCents: d.depositCents,
    bufferAfter: d.bufferAfter,
    description: d.description || null,
    bufferBefore: base?.bufferBefore ?? 0,
  };
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
            <p className="mt-1 text-[0.72rem] text-ink-faint">
              {money(s.depositCents)} deposit
            </p>
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
  onSave,
}: {
  draft: Draft;
  preview: boolean;
  onClose: () => void;
  onSave: (d: Draft) => void;
}) {
  const [d, setD] = useState(draft);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const dollars = (cents: number) => (cents / 100).toString();
  const toCents = (v: string) => Math.round((parseFloat(v) || 0) * 100);

  return (
    <Modal
      onClose={onClose}
      title={draft.id ? "Edit service" : "New service"}
      description={preview ? "Preview mode — changes won't be saved." : undefined}
      footer={
        <>
          <GhostBtn onClick={onClose}>Cancel</GhostBtn>
          <ActionButton icon="check" onClick={() => onSave(d)}>
            {draft.id ? "Save changes" : "Add service"}
          </ActionButton>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="svc-name">Service name</Label>
          <input
            id="svc-name"
            className={inputBase}
            value={d.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Standard Home Cleaning"
          />
        </div>
        <div>
          <Label htmlFor="svc-desc" hint="Optional">Description</Label>
          <textarea
            id="svc-desc"
            className={cn(inputBase, "min-h-[70px] resize-y")}
            value={d.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="What's included…"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="svc-cat">Category</Label>
            <input
              id="svc-cat"
              className={inputBase}
              value={d.category}
              onChange={(e) => set("category", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="svc-dur">Duration (min)</Label>
            <input
              id="svc-dur"
              type="number"
              min={15}
              step={15}
              className={inputBase}
              value={d.durationMinutes}
              onChange={(e) => set("durationMinutes", parseInt(e.target.value) || 0)}
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label htmlFor="svc-price">Price ($)</Label>
            <input
              id="svc-price"
              type="number"
              min={0}
              className={inputBase}
              defaultValue={dollars(d.priceCents)}
              onChange={(e) => set("priceCents", toCents(e.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="svc-dep">Deposit ($)</Label>
            <input
              id="svc-dep"
              type="number"
              min={0}
              className={inputBase}
              defaultValue={dollars(d.depositCents)}
              onChange={(e) => set("depositCents", toCents(e.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="svc-buf">Buffer (min)</Label>
            <input
              id="svc-buf"
              type="number"
              min={0}
              step={5}
              className={inputBase}
              value={d.bufferAfter}
              onChange={(e) => set("bufferAfter", parseInt(e.target.value) || 0)}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
