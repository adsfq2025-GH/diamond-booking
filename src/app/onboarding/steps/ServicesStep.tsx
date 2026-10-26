"use client";

import { useState } from "react";
import { Em } from "@/components/ui/SectionHeading";
import { Label, inputBase } from "@/components/ui/Field";
import { StepHeader, StepFooter, GhostButton, WizardError } from "../wizard-ui";
import { templatesForIndustry } from "@/lib/onboarding/templates";
import type { GlobalAddonInput, ServiceInput } from "@/lib/onboarding/types";
import { cn } from "@/lib/cn";

let localSeq = 0;
function nextLocalId() {
  localSeq += 1;
  return `svc-${Date.now()}-${localSeq}`;
}
function nextAddonId() {
  localSeq += 1;
  return `addon-${Date.now()}-${localSeq}`;
}

function blankService(): ServiceInput {
  return {
    localId: nextLocalId(),
    name: "",
    category: "",
    duration_minutes: 120,
    price_cents: 0,
    deposit_cents: 0,
    buffer_before_minutes: 0,
    buffer_after_minutes: 15,
    // A new service is a flat total until the owner says otherwise. Starting
    // on "Per hour" meant the common case had to be corrected rather than
    // chosen, and nobody did.
    pricing_unit: "flat",
    custom_pricing_unit_label: "",
    minimum_hours: 2,
  };
}

function blankAddon(): GlobalAddonInput {
  return { localId: nextAddonId(), name: "", price_cents: 0, duration_minutes: 0 };
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function formatPrice(cents: number): string {
  return cents === 0
    ? "Free quote"
    : `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

/** "120" -> 12000 cents; tolerant of blank/partial input. */
function dollarsToCents(raw: string): number {
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
}

export function ServicesStep({
  value,
  savedAddons,
  industry,
  busy,
  onSubmit,
  onBack,
}: {
  value: ServiceInput[];
  /** Saved extras, so resuming the wizard does not drop them. */
  savedAddons?: GlobalAddonInput[];
  industry: string;
  busy: boolean;
  onSubmit: (next: ServiceInput[], addons: GlobalAddonInput[]) => void;
  onBack: () => void;
}) {
  const [services, setServices] = useState<ServiceInput[]>(value);
  const [addons, setAddons] = useState<GlobalAddonInput[]>(savedAddons ?? []);
  const [error, setError] = useState<string | null>(null);

  const templates = templatesForIndustry(industry);
  const addedNames = new Set(services.map((s) => s.name.trim().toLowerCase()));

  const addTemplate = (index: number) => {
    const t = templates[index];
    setServices((list) => [
      ...list,
      {
        localId: nextLocalId(),
        name: t.name,
        category: t.category,
        duration_minutes: t.duration_minutes,
        price_cents: t.price_cents,
        deposit_cents: t.deposit_cents,
        buffer_before_minutes: t.buffer_before_minutes,
        buffer_after_minutes: t.buffer_after_minutes,
        pricing_unit: "flat",
        custom_pricing_unit_label: "",
        minimum_hours: Math.max(1, Math.round((t.duration_minutes / 60) * 2) / 2),
      },
    ]);
    setError(null);
  };

  const update = (localId: string, patch: Partial<ServiceInput>) => {
    setServices((list) =>
      list.map((s) => (s.localId === localId ? { ...s, ...patch } : s)),
    );
  };

  const remove = (localId: string) => {
    setServices((list) => list.filter((s) => s.localId !== localId));
  };

  const addAddon = () => {
    setAddons((list) => [...list, blankAddon()]);
  };
  const updateAddon = (addonId: string, patch: Partial<GlobalAddonInput>) => {
    setAddons((list) => list.map((a) => (a.localId === addonId ? { ...a, ...patch } : a)));
  };
  const removeAddon = (addonId: string) => {
    setAddons((list) => list.filter((a) => a.localId !== addonId));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const named = services.filter((s) => s.name.trim());
    if (named.length === 0) {
      setError("Add at least one service — pick a template or create your own.");
      return;
    }
    if (named.some((s) => s.pricing_unit === "hourly" && (s.minimum_hours ?? 0) <= 0)) {
      setError("Hourly services need a minimum hours value greater than 0.");
      return;
    }
    onSubmit(
      named,
      addons.filter((a) => a.name.trim().length > 0),
    );
  };

  return (
    <form noValidate onSubmit={submit}>
      <StepHeader
        step={2}
        title={
          <>
            What do you <Em>offer?</Em>
          </>
        }
        lede={
          templates.length > 0
            ? `We drafted the usual ${industry.toLowerCase()} services — one click adds them, and everything stays editable.`
            : "Add the services customers can book. Everything stays editable later."
        }
      />

      <WizardError>{error}</WizardError>

      {templates.length > 0 && (
        <div className="mb-6">
          <p className="mb-2.5 text-[0.8rem] font-semibold text-ink">
            Quick add for {industry}
          </p>
          <div className="flex flex-wrap gap-2">
            {templates.map((t, i) => {
              const added = addedNames.has(t.name.toLowerCase());
              return (
                <button
                  key={t.name}
                  type="button"
                  disabled={added}
                  onClick={() => addTemplate(i)}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-2 rounded-[var(--radius-pill)] border px-3.5 py-2 text-[0.78rem] font-semibold",
                    "transition-[border-color,background-color,color,transform] duration-[var(--duration-fast)] ease-[var(--ease-out-expo)]",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600",
                    added
                      ? "cursor-default border-success-500/40 bg-success-50 text-success-700"
                      : "border-line-strong bg-card text-ink hover:-translate-y-0.5 hover:border-blue-600 hover:text-blue-600",
                  )}
                >
                  <span aria-hidden>{added ? "✓" : "+"}</span>
                  {t.name}
                  <span className={cn("font-normal", added ? "text-success-700/80" : "text-ink-faint")}>
                    {formatDuration(t.duration_minutes)} · {formatPrice(t.price_cents)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {services.length === 0 && (
          <div className="rounded-[14px] border border-dashed border-line-strong bg-surface-alt/60 px-5 py-8 text-center text-[0.85rem] text-ink-faint">
            No services yet — add a template above or create one below.
          </div>
        )}

        {services.map((s, index) => (
          <div
            key={s.localId}
            className="rounded-[14px] border border-navy-900/8 bg-card p-4 shadow-[0_1px_3px_rgb(12_36_64/0.05)] min-[521px]:p-5"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <span className="rounded-[var(--radius-pill)] bg-surface-alt px-2.5 py-1 text-[0.66rem] font-bold tracking-[0.08em] text-ink-faint uppercase">
                Service {index + 1}
              </span>
              <button
                type="button"
                onClick={() => remove(s.localId)}
                aria-label={`Remove ${s.name || `service ${index + 1}`}`}
                className="cursor-pointer rounded-[8px] px-2 py-1 text-[0.78rem] font-semibold text-ink-faint transition-colors duration-[var(--duration-fast)] hover:bg-[#fdf6f5] hover:text-[#a63d39] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600"
              >
                Remove
              </button>
            </div>

            <div className="grid gap-4 min-[641px]:grid-cols-2">
              <div>
                <Label htmlFor={`${s.localId}-name`}>Service name</Label>
                <input
                  id={`${s.localId}-name`}
                  type="text"
                  placeholder="Standard Home Cleaning"
                  value={s.name}
                  onChange={(e) => update(s.localId, { name: e.target.value })}
                  className={inputBase}
                />
              </div>
              <div>
                <Label htmlFor={`${s.localId}-category`} hint="Optional">
                  Category
                </Label>
                <input
                  id={`${s.localId}-category`}
                  type="text"
                  placeholder="Residential"
                  value={s.category}
                  onChange={(e) => update(s.localId, { category: e.target.value })}
                  className={inputBase}
                />
              </div>

              <div className="min-[641px]:col-span-2 rounded-[12px] border border-line bg-surface-alt/45 px-4 py-3">
                <p className="text-[0.82rem] font-semibold text-ink">Base service</p>
                <p className="mt-1 text-[0.76rem] leading-[1.55] text-ink-faint">
                  This is the main service customers book. Add-ons stay separate below as optional extras.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 min-[641px]:col-span-2 min-[641px]:grid-cols-3">
                <div>
                  <Label htmlFor={`${s.localId}-pricing-type`}>Pricing unit</Label>
                  <select
                    id={`${s.localId}-pricing-type`}
                    className={inputBase}
                    value={s.pricing_unit ?? "flat"}
                    onChange={(e) => update(s.localId, { pricing_unit: e.target.value as ServiceInput["pricing_unit"] })}
                  >
                    <option value="flat">Flat rate</option>
                    <option value="hourly">Per hour</option>
                    <option value="square_foot">Per square foot</option>
                    <option value="custom">Other unit</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor={`${s.localId}-price`}>Price ($)</Label>
                  <input
                    id={`${s.localId}-price`}
                    type="number"
                    min={0}
                    step={0.01}
                    value={s.price_cents ? s.price_cents / 100 : ""}
                    placeholder="0"
                    onChange={(e) =>
                      update(s.localId, { price_cents: dollarsToCents(e.target.value) })
                    }
                    className={inputBase}
                  />
                </div>
                <div>
                  <Label htmlFor={`${s.localId}-min-hours`}>Minimum hours</Label>
                  <input
                    id={`${s.localId}-min-hours`}
                    type="number"
                    min={0}
                    step={0.5}
                    value={s.minimum_hours ?? ""}
                    placeholder="2"
                    onChange={(e) => update(s.localId, { minimum_hours: Number.parseFloat(e.target.value) || 0 })}
                    className={inputBase}
                  />
                </div>
                <div>
                  <Label
                    htmlFor={`${s.localId}-duration`}
                    hint={s.pricing_unit === "hourly" ? "From minimum hours" : "Minutes"}
                  >
                    Time on site
                  </Label>
                  <input
                    id={`${s.localId}-duration`}
                    type="number"
                    min={15}
                    step={15}
                    disabled={s.pricing_unit === "hourly"}
                    value={
                      s.pricing_unit === "hourly"
                        ? Math.max(15, Math.round((s.minimum_hours ?? 1) * 60))
                        : (s.duration_minutes ?? "")
                    }
                    placeholder="120"
                    onChange={(e) =>
                      update(s.localId, {
                        duration_minutes: Number.parseInt(e.target.value, 10) || 0,
                      })
                    }
                    className={inputBase}
                  />
                  <p className="mt-1 text-[0.72rem] leading-[1.45] text-ink-faint">
                    How long the job blocks the calendar. This is what availability
                    is calculated from.
                  </p>
                </div>
                <div>
                  <Label htmlFor={`${s.localId}-custom-unit`} hint="Optional">
                    Custom unit label
                  </Label>
                  <input
                    id={`${s.localId}-custom-unit`}
                    type="text"
                    placeholder="Per room"
                    value={s.custom_pricing_unit_label ?? ""}
                    onChange={(e) => update(s.localId, { custom_pricing_unit_label: e.target.value })}
                    className={inputBase}
                  />
                </div>
              </div>

              <div className="min-[641px]:col-span-2 rounded-[12px] border border-dashed border-line bg-card px-4 py-3">
                <p className="text-[0.82rem] font-semibold text-ink">Pricing setup</p>
                <p className="mt-1 text-[0.76rem] leading-[1.55] text-ink-faint">
                  Set how this service is priced. Use minimum hours for hourly jobs, or switch to square-foot or a custom unit when the niche needs it.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-4 min-[641px]:col-span-2">
                <div>
                  <Label htmlFor={`${s.localId}-deposit`}>Deposit ($)</Label>
                  <input
                    id={`${s.localId}-deposit`}
                    type="number"
                    min={0}
                    step={0.01}
                    value={s.deposit_cents ? s.deposit_cents / 100 : ""}
                    placeholder="0"
                    onChange={(e) =>
                      update(s.localId, { deposit_cents: dollarsToCents(e.target.value) })
                    }
                    className={inputBase}
                  />
                </div>
                <div>
                  <Label htmlFor={`${s.localId}-buf-before`}>Buffer before</Label>
                  <input
                    id={`${s.localId}-buf-before`}
                    type="number"
                    min={0}
                    step={5}
                    value={s.buffer_before_minutes || ""}
                    placeholder="0"
                    onChange={(e) =>
                      update(s.localId, {
                        buffer_before_minutes:
                          Number.parseInt(e.target.value, 10) || 0,
                      })
                    }
                    className={inputBase}
                  />
                </div>
                <div>
                  <Label htmlFor={`${s.localId}-buf-after`}>Buffer after</Label>
                  <input
                    id={`${s.localId}-buf-after`}
                    type="number"
                    min={0}
                    step={5}
                    value={s.buffer_after_minutes || ""}
                    placeholder="0"
                    onChange={(e) =>
                      update(s.localId, {
                        buffer_after_minutes:
                          Number.parseInt(e.target.value, 10) || 0,
                      })
                    }
                    className={inputBase}
                  />
                </div>
              </div>
            </div>

          </div>
        ))}
      </div>

      <div className="mt-4">
        <GhostButton
          onClick={() => {
            setServices((list) => [...list, blankService()]);
            setError(null);
          }}
        >
          + Add a custom service
        </GhostButton>
      </div>

      <div className="mt-8 rounded-[16px] border border-line bg-card p-4 shadow-[0_1px_3px_rgb(12_36_64/0.05)] min-[521px]:p-5">
        <div className="mb-4">
          <p className="text-[0.82rem] font-semibold text-ink">
            Add-ons <span className="font-normal text-ink-faint">— separate optional extras customers can add to any service</span>
          </p>
          <p className="mt-1 text-[0.76rem] leading-[1.55] text-ink-faint">
            Customers pick a main service first, then choose from these available extras if they want them.
          </p>
        </div>

        {addons.length === 0 ? (
          <div className="rounded-[12px] border border-dashed border-line-strong bg-surface-alt/50 px-4 py-5 text-[0.82rem] text-ink-faint">
            No add-ons yet — add optional extras like inside fridge, oven cleaning, blinds, or pet hair treatment. Give each one the extra minutes it takes so availability stays accurate.
          </div>
        ) : (
          <div className="space-y-2.5">
            {addons.map((a, index) => (
              <div key={a.localId} className="rounded-[12px] border border-line bg-surface-alt/20 p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-[0.72rem] font-bold tracking-[0.08em] text-ink-faint uppercase">Add-on {index + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeAddon(a.localId)}
                    className="cursor-pointer rounded-[8px] px-2 py-1 text-[0.78rem] font-semibold text-ink-faint transition-colors hover:bg-[#fdf6f5] hover:text-[#a63d39] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600"
                  >
                    Remove
                  </button>
                </div>
                <div className="grid gap-3 min-[641px]:grid-cols-[minmax(0,1fr),120px,120px]">
                  <input
                    type="text"
                    placeholder="Inside fridge"
                    value={a.name}
                    onChange={(e) => updateAddon(a.localId, { name: e.target.value })}
                    className={inputBase}
                    aria-label="Add-on name"
                  />
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    placeholder="Price $"
                    value={a.price_cents ? a.price_cents / 100 : ""}
                    onChange={(e) => updateAddon(a.localId, { price_cents: dollarsToCents(e.target.value) })}
                    className={inputBase}
                    aria-label="Add-on price in dollars"
                  />
                  {/*
                    Extra minutes. Without this the extra was free in TIME: the
                    booking extended the job but availability did not, so
                    customers were offered start times that no longer fitted.
                    Zero is legitimate — plenty of extras take no longer.
                  */}
                  <input
                    type="number"
                    min={0}
                    step={5}
                    placeholder="Extra min"
                    value={a.duration_minutes ? a.duration_minutes : ""}
                    onChange={(e) =>
                      updateAddon(a.localId, {
                        duration_minutes: Number.parseInt(e.target.value, 10) || 0,
                      })
                    }
                    className={inputBase}
                    aria-label="Extra minutes this add-on takes"
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={addAddon}
          className="mt-3 cursor-pointer text-[0.82rem] font-semibold text-blue-600 transition-colors hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          + Add an add-on
        </button>
      </div>

      <StepFooter busy={busy} onBack={onBack} />
    </form>
  );
}
