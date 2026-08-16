"use client";

import { useState } from "react";
import { Em } from "@/components/ui/SectionHeading";
import { Label, SelectShell, inputBase } from "@/components/ui/Field";
import { StepHeader, StepFooter, InfoNote, WizardError } from "../wizard-ui";
import {
  WEEKDAY_LABELS,
  type HoursInput,
} from "@/lib/onboarding/types";
import { cn } from "@/lib/cn";

const BUFFER_OPTIONS = [0, 10, 15, 30, 45, 60];

export function HoursStep({
  value,
  busy,
  onSubmit,
  onBack,
}: {
  value: HoursInput;
  busy: boolean;
  onSubmit: (next: HoursInput) => void;
  onBack: () => void;
}) {
  const [hours, setHours] = useState<HoursInput>(value);
  const [error, setError] = useState<string | null>(null);

  const updateDay = (
    weekday: number,
    patch: Partial<HoursInput["days"][number]>,
  ) => {
    setHours((h) => ({
      ...h,
      days: h.days.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)),
    }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    for (const d of hours.days) {
      if (d.closed) continue;
      if (!d.open_time || !d.close_time) {
        setError(`${WEEKDAY_LABELS[d.weekday]} needs both opening and closing times.`);
        return;
      }
      if (d.close_time <= d.open_time) {
        setError(`${WEEKDAY_LABELS[d.weekday]}'s closing time must be after opening.`);
        return;
      }
    }
    if (hours.days.every((d) => d.closed)) {
      setError("You're closed every day — open at least one so customers can book.");
      return;
    }
    setError(null);
    onSubmit(hours);
  };

  // Render Monday-first (weekday 0 = Sunday goes last).
  const ordered = [...hours.days].sort(
    (a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7),
  );

  return (
    <form noValidate onSubmit={submit}>
      <StepHeader
        step={4}
        title={
          <>
            When are you <Em>open?</Em>
          </>
        }
        lede="The booking widget only offers slots inside these hours. Individual teammate schedules can be narrowed later."
      />

      <WizardError>{error}</WizardError>

      <div className="overflow-hidden rounded-[14px] border border-navy-900/8 bg-card shadow-[0_1px_3px_rgb(12_36_64/0.05)]">
        {ordered.map((d, i) => (
          <div
            key={d.weekday}
            className={cn(
              "flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 min-[521px]:px-5",
              i > 0 && "border-t border-line",
              d.closed && "bg-surface-alt/50",
            )}
          >
            <label className="flex w-[130px] min-w-0 flex-none cursor-pointer items-center gap-2.5 select-none">
              <input
                type="checkbox"
                checked={!d.closed}
                onChange={(e) => updateDay(d.weekday, { closed: !e.target.checked })}
                aria-label={`Open on ${WEEKDAY_LABELS[d.weekday]}`}
                className="h-4 w-4 cursor-pointer accent-[var(--blue-600)]"
              />
              <span
                className={cn(
                  "text-[0.86rem] font-semibold",
                  d.closed ? "text-ink-faint" : "text-ink",
                )}
              >
                {WEEKDAY_LABELS[d.weekday]}
              </span>
            </label>

            {d.closed ? (
              <span className="text-[0.8rem] font-medium tracking-[0.04em] text-ink-faint uppercase">
                Closed
              </span>
            ) : (
              <div className="flex min-w-0 items-center gap-2">
                <input
                  type="time"
                  value={d.open_time}
                  onChange={(e) => updateDay(d.weekday, { open_time: e.target.value })}
                  aria-label={`${WEEKDAY_LABELS[d.weekday]} opening time`}
                  className={cn(
                    inputBase,
                    "min-w-0 max-w-[104px] flex-none px-2 py-[8px] text-[0.85rem] min-[521px]:max-w-[136px] min-[521px]:px-2.5",
                  )}
                />
                <span aria-hidden className="flex-none text-[0.8rem] text-ink-faint">
                  to
                </span>
                <input
                  type="time"
                  value={d.close_time}
                  onChange={(e) => updateDay(d.weekday, { close_time: e.target.value })}
                  aria-label={`${WEEKDAY_LABELS[d.weekday]} closing time`}
                  className={cn(
                    inputBase,
                    "min-w-0 max-w-[104px] flex-none px-2 py-[8px] text-[0.85rem] min-[521px]:max-w-[136px] min-[521px]:px-2.5",
                  )}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-5 min-[521px]:grid-cols-2">
        <div>
          <Label htmlFor="hours-buffer">Default travel buffer between jobs</Label>
          <SelectShell>
            <select
              id="hours-buffer"
              value={hours.default_buffer_minutes}
              onChange={(e) =>
                setHours((h) => ({
                  ...h,
                  default_buffer_minutes: Number.parseInt(e.target.value, 10) || 0,
                }))
              }
              className={cn(inputBase, "cursor-pointer appearance-none pr-9")}
            >
              {BUFFER_OPTIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes === 0 ? "No buffer" : `${minutes} minutes`}
                </option>
              ))}
            </select>
          </SelectShell>
          <p className="mt-1.5 text-[0.75rem] text-ink-faint">
            Used when a service doesn&rsquo;t set its own buffers.
          </p>
        </div>

        <div className="min-[521px]:pt-[26px]">
          <InfoNote>
            <b className="font-semibold">Holidays &amp; one-off closures</b>{" "}
            live in the dashboard — block any date there and the widget stops
            offering it instantly.
          </InfoNote>
        </div>
      </div>

      <StepFooter busy={busy} onBack={onBack} />
    </form>
  );
}
