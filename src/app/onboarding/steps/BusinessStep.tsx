"use client";

import { useEffect, useMemo, useState } from "react";
import { Em } from "@/components/ui/SectionHeading";
import {
  Label,
  FieldError,
  SelectShell,
  inputBase,
  inputInvalid,
} from "@/components/ui/Field";
import { StepHeader, StepFooter } from "../wizard-ui";
import {
  COMMON_TIMEZONES,
  type BusinessInfoInput,
} from "@/lib/onboarding/types";
import { cn } from "@/lib/cn";

const INDUSTRIES = [
  "Cleaning",
  "HVAC",
  "Plumbing",
  "Roofing",
  "Landscaping",
  "Electrical",
  "Pest Control",
  "Pool Care",
  "Window Washing",
  "Appliance Repair",
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function BusinessStep({
  value,
  busy,
  onSubmit,
}: {
  value: BusinessInfoInput;
  busy: boolean;
  onSubmit: (next: BusinessInfoInput) => void;
}) {
  const [draft, setDraft] = useState<BusinessInfoInput>(value);
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});

  // Auto-detect the timezone once, but never override a saved choice:
  // only when the draft still holds the signup default. Deferred a tick so
  // the browser-only detection never runs during render/hydration.
  useEffect(() => {
    if (value.timezone !== "America/New_York") return;
    const id = window.setTimeout(() => {
      try {
        const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (detected) {
          setDraft((d) =>
            d.timezone === "America/New_York" ? { ...d, timezone: detected } : d,
          );
        }
      } catch {
        // keep the default
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [value.timezone]);

  const timezones = useMemo(() => {
    const zones = new Set<string>(COMMON_TIMEZONES);
    zones.add(draft.timezone);
    return Array.from(zones);
  }, [draft.timezone]);

  const set = <K extends keyof BusinessInfoInput>(
    key: K,
    val: BusinessInfoInput[K],
  ) => setDraft((d) => ({ ...d, [key]: val }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!draft.name.trim()) next.name = "The business needs a name.";
    if (draft.email.trim() && !EMAIL_RE.test(draft.email.trim()))
      next.email = "That email doesn't look complete.";
    setErrors(next);
    if (Object.keys(next).length === 0) onSubmit(draft);
  };

  const industryInList = INDUSTRIES.some(
    (i) => i.toLowerCase() === draft.industry.trim().toLowerCase(),
  );

  return (
    <form noValidate onSubmit={submit}>
      <StepHeader
        step={1}
        title={
          <>
            Tell us about <Em>your business.</Em>
          </>
        }
        lede="This shows up on your booking page, confirmations and invoices. You can change any of it later."
      />

      <div className="grid gap-5 min-[521px]:grid-cols-2">
        <div className="min-[521px]:col-span-2">
          <Label htmlFor="biz-name">Business name</Label>
          <input
            id="biz-name"
            type="text"
            autoComplete="organization"
            value={draft.name}
            onChange={(e) => {
              set("name", e.target.value);
              if (errors.name) setErrors((er) => ({ ...er, name: undefined }));
            }}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? "biz-name-error" : undefined}
            className={cn(inputBase, errors.name && inputInvalid)}
          />
          <FieldError id="biz-name-error">{errors.name}</FieldError>
        </div>

        <div>
          <Label htmlFor="biz-industry">Industry</Label>
          <SelectShell>
            <select
              id="biz-industry"
              value={industryInList ? draft.industry : ""}
              onChange={(e) => set("industry", e.target.value)}
              className={cn(inputBase, "cursor-pointer appearance-none pr-9")}
            >
              {!industryInList && (
                <option value="" disabled>
                  {draft.industry || "Select your vertical…"}
                </option>
              )}
              {INDUSTRIES.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </SelectShell>
        </div>

        <div>
          <Label htmlFor="biz-timezone">Timezone</Label>
          <SelectShell>
            <select
              id="biz-timezone"
              value={draft.timezone}
              onChange={(e) => set("timezone", e.target.value)}
              className={cn(inputBase, "cursor-pointer appearance-none pr-9")}
            >
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </SelectShell>
        </div>

        <div>
          <Label htmlFor="biz-phone" hint="Optional">
            Business phone
          </Label>
          <input
            id="biz-phone"
            type="tel"
            autoComplete="tel"
            placeholder="(555) 010-0000"
            value={draft.phone}
            onChange={(e) => set("phone", e.target.value)}
            className={inputBase}
          />
        </div>

        <div>
          <Label htmlFor="biz-email">Business email</Label>
          <input
            id="biz-email"
            type="email"
            autoComplete="email"
            placeholder="hello@yourbusiness.com"
            value={draft.email}
            onChange={(e) => {
              set("email", e.target.value);
              if (errors.email) setErrors((er) => ({ ...er, email: undefined }));
            }}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "biz-email-error" : undefined}
            className={cn(inputBase, errors.email && inputInvalid)}
          />
          <FieldError id="biz-email-error">{errors.email}</FieldError>
        </div>

        <div className="min-[521px]:col-span-2">
          <Label htmlFor="biz-street" hint="Optional">
            Street address
          </Label>
          <input
            id="biz-street"
            type="text"
            autoComplete="street-address"
            placeholder="482 Maple Ave"
            value={draft.street}
            onChange={(e) => set("street", e.target.value)}
            className={inputBase}
          />
        </div>

        <div>
          <Label htmlFor="biz-city">City</Label>
          <input
            id="biz-city"
            type="text"
            autoComplete="address-level2"
            placeholder="Springfield"
            value={draft.city}
            onChange={(e) => set("city", e.target.value)}
            className={inputBase}
          />
        </div>

        <div className="grid grid-cols-2 gap-5">
          <div>
            <Label htmlFor="biz-state">State</Label>
            <input
              id="biz-state"
              type="text"
              autoComplete="address-level1"
              placeholder="IL"
              value={draft.state}
              onChange={(e) => set("state", e.target.value)}
              className={inputBase}
            />
          </div>
          <div>
            <Label htmlFor="biz-zip">ZIP</Label>
            <input
              id="biz-zip"
              type="text"
              inputMode="numeric"
              autoComplete="postal-code"
              placeholder="62704"
              value={draft.zip}
              onChange={(e) => set("zip", e.target.value)}
              className={inputBase}
            />
          </div>
        </div>
      </div>

      <StepFooter busy={busy} showBack={false} />
    </form>
  );
}
