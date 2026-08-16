"use client";

import { useState } from "react";
import { Em } from "@/components/ui/SectionHeading";
import { Label, inputBase } from "@/components/ui/Field";
import { StepHeader, StepFooter, GhostButton, WizardError } from "../wizard-ui";
import { templatesForIndustry } from "@/lib/onboarding/templates";
import type { ServiceInput } from "@/lib/onboarding/types";
import { cn } from "@/lib/cn";

let localSeq = 0;
function nextLocalId() {
  localSeq += 1;
  return `svc-${Date.now()}-${localSeq}`;
}

function blankService(): ServiceInput {
  return {
    localId: nextLocalId(),
    name: "",
    category: "",
    duration_minutes: 60,
    price_cents: 0,
    deposit_cents: 0,
    buffer_before_minutes: 0,
    buffer_after_minutes: 15,
  };
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
  industry,
  busy,
  onSubmit,
  onBack,
}: {
  value: ServiceInput[];
  industry: string;
  busy: boolean;
  onSubmit: (next: ServiceInput[]) => void;
  onBack: () => void;
}) {
  const [services, setServices] = useState<ServiceInput[]>(value);
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

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const named = services.filter((s) => s.name.trim());
    if (named.length === 0) {
      setError("Add at least one service — pick a template or create your own.");
      return;
    }
    if (named.some((s) => s.duration_minutes <= 0)) {
      setError("Every service needs a duration of at least 5 minutes.");
      return;
    }
    onSubmit(named);
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor={`${s.localId}-duration`}>Duration (min)</Label>
                  <input
                    id={`${s.localId}-duration`}
                    type="number"
                    min={5}
                    step={5}
                    value={s.duration_minutes || ""}
                    onChange={(e) =>
                      update(s.localId, {
                        duration_minutes: Number.parseInt(e.target.value, 10) || 0,
                      })
                    }
                    className={inputBase}
                  />
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
              </div>

              <div className="grid grid-cols-3 gap-4">
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

      <StepFooter busy={busy} onBack={onBack} />
    </form>
  );
}
