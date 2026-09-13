"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import { fetchSlots, submitBooking } from "@/lib/actions/widget";
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete";
import { RECURRENCE_OPTIONS, recurrenceLabel, type RecurrenceRule } from "@/lib/recurrence";
import type {
  AvailableSlot,
  WidgetBookingResult,
  WidgetConfigPayload,
} from "@/types/domain";

type Service = WidgetConfigPayload["services"][number];
type CustomField = { key: string; label: string; type: string; required: boolean };

const STEPS = ["Service", "Time", "Details", "Done"] as const;

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function BookingFlow({
  publicKey,
  config,
  embedded,
  emailWillSend,
  recurringEnabled,
}: {
  publicKey: string;
  config: WidgetConfigPayload;
  embedded: boolean;
  emailWillSend: boolean;
  recurringEnabled: boolean;
}) {
  const accent = (config.theme as { primary_color?: string })?.primary_color ?? "#2e86c1";
  const customFields = (config.custom_fields as CustomField[]) ?? [];
  // Times display in the business's timezone so the widget and the owner's
  // dashboard always agree on when an appointment is.
  const tz = config.tenant.timezone || undefined;

  const [step, setStep] = useState(0);
  const [service, setService] = useState<Service | null>(null);
  const [addons, setAddons] = useState<Set<string>>(new Set());
  const [date, setDate] = useState<Date>(() => new Date());
  const [slot, setSlot] = useState<AvailableSlot | null>(null);
  const [details, setDetails] = useState({ name: "", email: "", phone: "", address: "", notes: "" });
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [recurrence, setRecurrence] = useState<RecurrenceRule>("none");
  const [result, setResult] = useState<WidgetBookingResult | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Auto-height: report content height to the embedding iframe parent.
  useEffect(() => {
    if (!embedded) return;
    const report = () => {
      const h = rootRef.current?.scrollHeight ?? document.body.scrollHeight;
      window.parent?.postMessage({ type: "diamond-booking:height", height: h }, "*");
    };
    report();
    const ro = new ResizeObserver(report);
    if (rootRef.current) ro.observe(rootRef.current);
    return () => ro.disconnect();
  }, [embedded, step]);

  const addonTotal = useMemo(() => {
    if (!service) return 0;
    return service.addons
      .filter((a) => addons.has(a.id))
      .reduce((s, a) => s + a.price_cents, 0);
  }, [service, addons]);
  const priceTotal = (service?.price_cents ?? 0) + addonTotal;

  return (
    <div
      ref={rootRef}
      className="mx-auto w-full max-w-[460px]"
      style={{ ["--wc" as string]: accent }}
    >
      <div className="overflow-hidden rounded-[16px] border border-line bg-card shadow-lift">
        {/* Header */}
        <div className="px-5 py-4 text-white" style={{ backgroundColor: accent }}>
          <p className="text-[0.68rem] font-semibold tracking-[0.12em] uppercase opacity-80">
            Book online
          </p>
          <p className="font-display text-[1.2rem] font-semibold">{config.tenant.name}</p>
        </div>

        {/* Stepper */}
        {step < 3 && (
          <div className="flex items-center gap-1.5 border-b border-line px-5 py-3">
            {STEPS.slice(0, 3).map((label, i) => (
              <div key={label} className="flex flex-1 items-center gap-1.5">
                <span
                  className={cn(
                    "flex h-6 w-6 flex-none items-center justify-center rounded-full text-[0.72rem] font-bold",
                    i <= step ? "text-white" : "bg-surface-alt text-ink-faint",
                  )}
                  style={i <= step ? { backgroundColor: accent } : undefined}
                >
                  {i < step ? "✓" : i + 1}
                </span>
                <span className={cn("text-[0.75rem] font-semibold", i <= step ? "text-ink" : "text-ink-faint")}>
                  {label}
                </span>
                {i < 2 && <span className="mx-1 h-px flex-1 bg-line" />}
              </div>
            ))}
          </div>
        )}

        <div className="px-5 py-5">
          {step < 3 && (
            <div className="mb-4 rounded-[12px] border border-line bg-surface-alt/50 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[0.72rem] font-bold tracking-[0.14em] text-ink-faint uppercase">Why customers book here</p>
                  <p className="mt-1 text-[0.82rem] leading-[1.55] text-ink-muted">
                    Real-time availability, instant confirmation rules, and no double bookings.
                  </p>
                </div>
                {tz && <span className="rounded-[var(--radius-pill)] bg-card px-2.5 py-1 text-[0.68rem] font-semibold text-ink-faint">Times shown in {tz}</span>}
              </div>
            </div>
          )}

          {step === 0 && (
            <ServiceStep
              services={config.services}
              selected={service}
              addons={addons}
              accent={accent}
              onSelect={(s) => {
                setService(s);
                setAddons(new Set());
              }}
              onToggleAddon={(id) =>
                setAddons((prev) => {
                  const n = new Set(prev);
                  if (n.has(id)) n.delete(id);
                  else n.add(id);
                  return n;
                })
              }
              onNext={() => setStep(1)}
              priceTotal={priceTotal}
            />
          )}

          {step === 1 && service && (
            <TimeStep
              publicKey={publicKey}
              service={service}
              date={date}
              slot={slot}
              accent={accent}
              tz={tz}
              onDate={(d) => {
                setDate(d);
                setSlot(null);
              }}
              onSlot={setSlot}
              onBack={() => setStep(0)}
              onNext={() => setStep(2)}
            />
          )}

          {step === 2 && service && slot && (
            <DetailsStep
              service={service}
              slot={slot}
              accent={accent}
              tz={tz}
              recurringEnabled={recurringEnabled}
              recurrence={recurrence}
              onRecurrence={setRecurrence}
              details={details}
              custom={custom}
              customFields={customFields}
              addonNames={service.addons.filter((a) => addons.has(a.id))}
              priceTotal={priceTotal}
              onChange={setDetails}
              onCustom={(k, v) => setCustom((p) => ({ ...p, [k]: v }))}
              onBack={() => setStep(1)}
              onSubmit={async () => {
                const res = await submitBooking({
                  publicKey,
                  serviceId: service.id,
                  startsAt: slot.slot_start,
                  customerName: details.name,
                  customerEmail: details.email,
                  customerPhone: details.phone || null,
                  employeeId: slot.employee_id,
                  address: details.address ? { line1: details.address } : null,
                  notes: [details.notes, ...Object.entries(custom).map(([k, v]) => `${k}: ${v}`)]
                    .filter(Boolean)
                    .join(" · ") || null,
                  addonIds: [...addons],
                  recurrence,
                  recurrenceUntil: null,
                });
                if (res.ok) {
                  setResult(res.result);
                  setStep(3);
                }
                return res;
              }}
            />
          )}

          {step === 3 && result && service && (
            <DoneStep
              result={result}
              service={service}
              accent={accent}
              tz={tz}
              email={details.email}
              emailWillSend={emailWillSend}
            />
          )}
        </div>
      </div>
      <p className="mt-3 text-center text-[0.7rem] text-ink-faint">
        Powered by <span className="font-semibold">Diamond Booking</span>
      </p>
    </div>
  );
}

// ---------- step 1: service ----------
function ServiceStep({
  services,
  selected,
  addons,
  accent,
  onSelect,
  onToggleAddon,
  onNext,
  priceTotal,
}: {
  services: Service[];
  selected: Service | null;
  addons: Set<string>;
  accent: string;
  onSelect: (s: Service) => void;
  onToggleAddon: (id: string) => void;
  onNext: () => void;
  priceTotal: number;
}) {
  return (
    <div>
      <p className="mb-3 text-[0.8rem] font-semibold text-ink">Choose a service</p>
      <div className="space-y-2.5">
        {services.map((s) => {
          const active = selected?.id === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s)}
              className="flex w-full items-start justify-between gap-3 rounded-[12px] border px-3.5 py-3 text-left transition-colors"
              style={{
                borderColor: active ? accent : "var(--line-strong)",
                backgroundColor: active ? `${accent}0f` : "transparent",
              }}
            >
              <div className="min-w-0">
                <p className="text-[0.9rem] font-semibold text-ink">{s.name}</p>
                {s.description && (
                  <p className="mt-0.5 line-clamp-2 text-[0.76rem] text-ink-faint">{s.description}</p>
                )}
                <p className="mt-1 text-[0.72rem] text-ink-faint">{formatDuration(s.duration_minutes)}</p>
              </div>
              <div className="flex-none text-right">
                <p className="font-instrument text-[1rem] font-semibold text-ink">{money(s.price_cents)}</p>
                {s.deposit_cents > 0 && (
                  <p className="text-[0.68rem] text-ink-faint">{money(s.deposit_cents)} deposit</p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {selected && selected.addons.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-[0.8rem] font-semibold text-ink">Add-ons</p>
          <div className="space-y-2">
            {selected.addons.map((a) => {
              const on = addons.has(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onToggleAddon(a.id)}
                  className="flex w-full items-center justify-between rounded-[10px] border px-3.5 py-2.5 text-left"
                  style={{ borderColor: on ? accent : "var(--line)" }}
                >
                  <span className="flex items-center gap-2.5">
                    <span
                      className="flex h-4.5 w-4.5 items-center justify-center rounded-[5px] border text-[0.6rem] text-white"
                      style={{
                        width: 18,
                        height: 18,
                        backgroundColor: on ? accent : "transparent",
                        borderColor: on ? accent : "var(--line-strong)",
                      }}
                    >
                      {on ? "✓" : ""}
                    </span>
                    <span className="text-[0.83rem] text-ink">{a.name}</span>
                  </span>
                  <span className="text-[0.8rem] font-semibold text-ink">+{money(a.price_cents)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {selected && (
        <div className="mt-5 flex items-center justify-between rounded-[12px] border border-line bg-surface-alt/60 px-4 py-3">
          <div>
            <p className="text-[0.7rem] font-semibold tracking-wide text-ink-faint uppercase">Total</p>
            {addons.size > 0 && (
              <p className="text-[0.72rem] text-ink-faint">
                {money(selected.price_cents)}
                {" + "}
                {money(priceTotal - selected.price_cents)} add-ons
              </p>
            )}
          </div>
          <p className="font-instrument text-[1.5rem] leading-none font-semibold text-ink" aria-live="polite">
            {money(priceTotal)}
          </p>
        </div>
      )}

      {selected && (
        <div className="mt-3 rounded-[12px] border border-line bg-card px-4 py-3 text-[0.76rem] leading-[1.6] text-ink-muted">
          {selected.deposit_cents > 0
            ? `A ${money(selected.deposit_cents)} deposit may be collected after confirmation, depending on this business's payment setup.`
            : "No deposit is required for this service unless the business updates its payment policy later."}
        </div>
      )}

      <PrimaryBtn accent={accent} disabled={!selected} onClick={onNext} className="mt-3">
        Continue
      </PrimaryBtn>
    </div>
  );
}

// ---------- step 2: time ----------
function TimeStep({
  publicKey,
  service,
  date,
  slot,
  accent,
  tz,
  onDate,
  onSlot,
  onBack,
  onNext,
}: {
  publicKey: string;
  service: Service;
  date: Date;
  slot: AvailableSlot | null;
  accent: string;
  tz?: string;
  onDate: (d: Date) => void;
  onSlot: (s: AvailableSlot) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  // Keyed by date so `loading` is derived (no setState in the effect body).
  const [loaded, setLoaded] = useState<{ key: string; slots: AvailableSlot[] } | null>(null);

  const days = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      return d;
    });
  }, []);

  const dateKey = isoDate(date);
  useEffect(() => {
    let alive = true;
    fetchSlots(publicKey, service.id, dateKey).then((s) => {
      if (alive) setLoaded({ key: dateKey, slots: s });
    });
    return () => {
      alive = false;
    };
  }, [publicKey, service.id, dateKey]);

  const loading = loaded?.key !== dateKey;
  const slots = loaded?.key === dateKey ? loaded.slots : [];

  return (
    <div>
      <p className="mb-3 text-[0.8rem] font-semibold text-ink">Pick a date</p>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {days.map((d) => {
          const active = isoDate(d) === isoDate(date);
          return (
            <button
              key={isoDate(d)}
              type="button"
              onClick={() => onDate(d)}
              className="flex flex-none flex-col items-center rounded-[10px] border px-3 py-2 transition-colors"
              style={{
                borderColor: active ? accent : "var(--line-strong)",
                backgroundColor: active ? accent : "transparent",
              }}
            >
              <span className={cn("text-[0.62rem] font-bold uppercase", active ? "text-white/80" : "text-ink-faint")}>
                {d.toLocaleDateString("en-US", { weekday: "short" })}
              </span>
              <span className={cn("font-instrument text-[1rem] font-semibold", active ? "text-white" : "text-ink")}>
                {d.getDate()}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-5 mb-3 text-[0.8rem] font-semibold text-ink">Available times</p>
      {tz && <p className="mb-3 text-[0.74rem] text-ink-faint">All appointment times are shown in {tz}.</p>}
      {loading ? (
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-9 animate-pulse rounded-[9px] bg-surface-alt" />
          ))}
        </div>
      ) : slots.length === 0 ? (
        <p className="rounded-[10px] border border-dashed border-line-strong px-4 py-6 text-center text-[0.82rem] text-ink-faint">
          No openings this day. Try another date.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {slots.map((s) => {
            const active = slot?.slot_start === s.slot_start;
            return (
              <button
                key={s.slot_start}
                type="button"
                onClick={() => onSlot(s)}
                className="rounded-[9px] border py-2 text-[0.82rem] font-semibold transition-colors"
                style={{
                  borderColor: active ? accent : "var(--line-strong)",
                  backgroundColor: active ? accent : "transparent",
                  color: active ? "#fff" : "var(--ink)",
                }}
              >
                {new Date(s.slot_start).toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" })}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-5 flex items-center gap-3">
        <SecondaryBtn onClick={onBack}>Back</SecondaryBtn>
        <PrimaryBtn accent={accent} disabled={!slot} onClick={onNext} className="flex-1">
          Continue
        </PrimaryBtn>
      </div>
    </div>
  );
}

// ---------- step 3: details ----------
function DetailsStep({
  service,
  slot,
  accent,
  tz,
  recurringEnabled,
  recurrence,
  onRecurrence,
  details,
  custom,
  customFields,
  addonNames,
  priceTotal,
  onChange,
  onCustom,
  onBack,
  onSubmit,
}: {
  service: Service;
  slot: AvailableSlot;
  accent: string;
  tz?: string;
  recurringEnabled: boolean;
  recurrence: RecurrenceRule;
  onRecurrence: (r: RecurrenceRule) => void;
  details: { name: string; email: string; phone: string; address: string; notes: string };
  custom: Record<string, string>;
  customFields: CustomField[];
  addonNames: Service["addons"];
  priceTotal: number;
  onChange: (d: typeof details) => void;
  onCustom: (k: string, v: string) => void;
  onBack: () => void;
  onSubmit: () => Promise<{ ok: boolean; error?: string }>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requiredCustomOk = customFields
    .filter((f) => f.required)
    .every((f) => (custom[f.key] ?? "").trim().length > 0);
  const valid =
    details.name.trim() &&
    /.+@.+\..+/.test(details.email) &&
    details.phone.trim().length > 0 &&
    details.address.trim().length > 0 &&
    requiredCustomOk;

  const input =
    "w-full rounded-[10px] border border-line-strong bg-card px-3.5 py-2.5 text-[0.88rem] text-ink placeholder:text-ink-faint/80 focus:outline-none";

  return (
    <div>
      {/* Summary */}
      <div className="mb-4 rounded-[12px] border border-line bg-surface-alt/50 px-4 py-3">
        <p className="text-[0.9rem] font-semibold text-ink">{service.name}</p>
        <p className="mt-0.5 text-[0.78rem] text-ink-muted">
          {new Date(slot.slot_start).toLocaleDateString("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" })}
          {" · "}
          {new Date(slot.slot_start).toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" })}
        </p>
        {addonNames.length > 0 && (
          <p className="mt-1 text-[0.72rem] text-ink-faint">+ {addonNames.map((a) => a.name).join(", ")}</p>
        )}
        <p className="mt-2 font-instrument text-[1.05rem] font-semibold text-ink">{money(priceTotal)}</p>
      </div>

      {recurringEnabled && (
        <div className="mb-4">
          <p className="mb-2 text-[0.8rem] font-semibold text-ink">Repeat this booking?</p>
          <div className="grid grid-cols-2 gap-2 min-[380px]:grid-cols-3">
            {RECURRENCE_OPTIONS.map((o) => {
              const on = recurrence === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => onRecurrence(o.value)}
                  className="rounded-[9px] border px-2.5 py-2 text-[0.78rem] font-semibold transition-colors"
                  style={{
                    borderColor: on ? accent : "var(--line-strong)",
                    backgroundColor: on ? `${accent}14` : "transparent",
                    color: on ? "var(--ink)" : "var(--ink-muted)",
                  }}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
          {recurrence !== "none" && (
            <p className="mt-2 text-[0.72rem] leading-[1.5] text-ink-faint">
              We&rsquo;ll reserve this same time {recurrenceLabel(recurrence).toLowerCase()} going forward, so it stays yours. Cancel anytime.
            </p>
          )}
        </div>
      )}

      <div className="space-y-2.5">
        <input
          className={input}
          style={focusRing(accent)}
          placeholder="Full name *"
          value={details.name}
          onChange={(e) => onChange({ ...details, name: e.target.value })}
        />
        <input
          className={input}
          style={focusRing(accent)}
          type="email"
          placeholder="Email *"
          value={details.email}
          onChange={(e) => onChange({ ...details, email: e.target.value })}
        />
        <input
          className={input}
          style={focusRing(accent)}
          type="tel"
          placeholder="Phone *"
          value={details.phone}
          onChange={(e) => onChange({ ...details, phone: e.target.value })}
        />
        <AddressAutocomplete
          value={details.address}
          onChange={(v) => onChange({ ...details, address: v })}
          placeholder="Service address *"
          inputClassName={input}
          inputStyle={focusRing(accent)}
          ariaLabel="Service address"
        />
        {customFields.map((f) => (
          <div key={f.key}>
            <label className="mb-1 block text-[0.76rem] font-semibold text-ink">
              {f.label}
              {f.required ? " *" : ""}
            </label>
            {f.type === "textarea" ? (
              <textarea
                className={cn(input, "min-h-[64px] resize-y")}
                style={focusRing(accent)}
                value={custom[f.key] ?? ""}
                onChange={(e) => onCustom(f.key, e.target.value)}
              />
            ) : f.type === "checkbox" ? (
              <label className="flex items-center gap-2 rounded-[10px] border border-line-strong px-3.5 py-2.5 text-[0.84rem] text-ink">
                <input
                  type="checkbox"
                  checked={custom[f.key] === "yes"}
                  onChange={(e) => onCustom(f.key, e.target.checked ? "yes" : "")}
                />
                Yes
              </label>
            ) : (
              <input
                className={input}
                style={focusRing(accent)}
                type={f.type === "phone" ? "tel" : "text"}
                placeholder={f.label + (f.required ? " *" : "")}
                value={custom[f.key] ?? ""}
                onChange={(e) => onCustom(f.key, e.target.value)}
              />
            )}
          </div>
        ))}
        <textarea
          className={cn(input, "min-h-[64px] resize-y")}
          style={focusRing(accent)}
          placeholder="Notes (optional)"
          value={details.notes}
          onChange={(e) => onChange({ ...details, notes: e.target.value })}
        />
      </div>

      {service.deposit_cents > 0 && (
        <div className="mt-3 flex items-start gap-2 rounded-[10px] border px-3.5 py-2.5" style={{ borderColor: `${accent}44`, backgroundColor: `${accent}0a` }}>
          <span className="text-[0.78rem] leading-[1.5] text-ink-muted">
            A {money(service.deposit_cents)} deposit secures your booking. You&rsquo;ll be prompted to pay securely after confirming.
          </span>
        </div>
      )}

      <div className="mt-3 rounded-[10px] border border-line bg-surface-alt/40 px-3.5 py-3 text-[0.76rem] leading-[1.55] text-ink-muted">
        By confirming, you agree to the business cancellation and rescheduling policy shown on the booking page.
      </div>

      {error && <p className="mt-3 text-[0.8rem] font-medium text-[#a63d39]">{error}</p>}

      <div className="mt-4 flex items-center gap-3">
        <SecondaryBtn onClick={onBack} disabled={busy}>Back</SecondaryBtn>
        <PrimaryBtn
          accent={accent}
          disabled={!valid || busy}
          className="flex-1"
          onClick={async () => {
            setBusy(true);
            setError(null);
            const res = await onSubmit();
            if (!res.ok) {
              setError(res.error ?? "Something went wrong.");
              setBusy(false);
            }
          }}
        >
          {busy ? "Booking…" : "Confirm booking"}
        </PrimaryBtn>
      </div>
    </div>
  );
}

// ---------- step 4: done ----------
function DoneStep({
  result,
  service,
  accent,
  tz,
  email,
  emailWillSend,
}: {
  result: WidgetBookingResult;
  service: Service;
  accent: string;
  tz?: string;
  email: string;
  emailWillSend: boolean;
}) {
  return (
    <div className="py-4 text-center">
      <span
        className="mx-auto flex h-14 w-14 items-center justify-center rounded-full text-white"
        style={{ backgroundColor: accent }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-7 w-7">
          <path d="M4 12l5 5L20 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <p className="mt-4 font-display text-[1.3rem] font-semibold text-ink">You&rsquo;re booked!</p>
      <p className="mt-1.5 text-[0.85rem] text-ink-muted">
        {service.name} on{" "}
        {new Date(result.starts_at).toLocaleDateString("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" })}
        {" at "}
        {new Date(result.starts_at).toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" })}.
      </p>
      <div className="mt-5 rounded-[12px] border border-line bg-surface-alt/50 px-4 py-3 text-left">
        <Row label="Confirmation" value={result.status === "confirmed" ? "Confirmed" : "Pending review"} />
        <Row label="Total" value={money(result.price_cents)} />
        {result.deposit_cents > 0 && <Row label="Deposit due" value={money(result.deposit_cents)} />}
      </div>
      {result.deposit_cents > 0 && (
        <div className="mt-4 rounded-[12px] border border-gold-300 bg-gold-50 px-4 py-3 text-left text-[0.82rem] text-ink-muted">
          {result.deposit_client_secret
            ? "Stripe deposit intent created successfully. Payment capture UI is the next step to wire into this screen."
            : "Your booking was created. If online payments are enabled for this business, the deposit will be collected in the next payment step."}
        </div>
      )}
      <p className="mt-4 text-[0.8rem] text-ink-faint">
        {emailWillSend ? (
          <>
            A confirmation has been sent to{" "}
            <span className="font-semibold text-ink-muted">{email}</span>.
          </>
        ) : (
          <>Please save these details for your records.</>
        )}
      </p>
      <div className="mt-5 grid gap-2 text-left min-[420px]:grid-cols-2">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-[10px] border border-line-strong px-4 py-2.5 text-[0.82rem] font-semibold text-ink transition-colors hover:border-blue-600 hover:text-blue-600"
        >
          Book another service
        </button>
        <a
          href={`mailto:${email}`}
          className="rounded-[10px] bg-surface-alt px-4 py-2.5 text-center text-[0.82rem] font-semibold text-ink transition-colors hover:bg-surface-alt/80"
        >
          Email these details to me
        </a>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 text-[0.83rem]">
      <span className="text-ink-faint">{label}</span>
      <span className="font-semibold text-ink">{value}</span>
    </div>
  );
}

// ---------- shared bits ----------
function PrimaryBtn({
  accent,
  children,
  onClick,
  disabled,
  className,
}: {
  accent: string;
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-[10px] px-5 py-3 text-center text-[0.88rem] font-semibold text-white transition-[opacity,transform] disabled:opacity-45",
        !disabled && "hover:brightness-105 active:scale-[0.99]",
        className,
      )}
      style={{ backgroundColor: accent, width: className?.includes("flex-1") ? undefined : "100%" }}
    >
      {children}
    </button>
  );
}

function SecondaryBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-[10px] border border-line-strong bg-card px-4 py-3 text-[0.85rem] font-semibold text-ink transition-colors hover:border-ink-faint disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function focusRing(accent: string): React.CSSProperties {
  return { ["--tw-ring-color" as string]: accent, borderColor: undefined };
}
function formatDuration(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h ? `${h} hr` : "", m ? `${m} min` : ""].filter(Boolean).join(" ");
}
