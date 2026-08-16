"use client";

import { useRef, useState } from "react";
import { Em } from "@/components/ui/SectionHeading";
import { Label, inputBase } from "@/components/ui/Field";
import { StepHeader, StepFooter, WizardError } from "../wizard-ui";
import { createClient } from "@/lib/supabase/client";
import type { BrandingInput } from "@/lib/onboarding/types";
import { cn } from "@/lib/cn";

const MAX_FILE_MB = 5;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function BrandingStep({
  value,
  mode,
  tenantId,
  busy,
  onSubmit,
  onBack,
}: {
  value: BrandingInput;
  mode: "live" | "mock";
  tenantId: string;
  busy: boolean;
  onSubmit: (next: BrandingInput) => void;
  onBack: () => void;
}) {
  const [branding, setBranding] = useState<BrandingInput>(value);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<"logo" | "photos" | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const photosInput = useRef<HTMLInputElement>(null);

  /**
   * Live mode: upload to the public `branding` bucket under the
   * tenant-scoped path RLS expects ({tenant_id}/...). Mock mode: preview
   * with an in-memory object URL — nothing leaves the browser.
   */
  const uploadFile = async (file: File, kind: "logo" | "photo") => {
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      throw new Error(`"${file.name}" is over ${MAX_FILE_MB}MB — resize it and retry.`);
    }
    if (mode === "mock") {
      return URL.createObjectURL(file);
    }
    const supabase = createClient();
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `${tenantId}/${kind}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 7)}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("branding")
      .upload(path, file, { upsert: true, contentType: file.type || undefined });
    if (uploadError) {
      throw new Error("Upload failed — check your connection and try again.");
    }
    return supabase.storage.from("branding").getPublicUrl(path).data.publicUrl;
  };

  const onLogoPick = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setUploading("logo");
    setError(null);
    try {
      const url = await uploadFile(file, "logo");
      setBranding((b) => ({ ...b, logo_url: url }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(null);
      if (logoInput.current) logoInput.current.value = "";
    }
  };

  const onPhotosPick = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading("photos");
    setError(null);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files).slice(0, 8)) {
        urls.push(await uploadFile(file, "photo"));
      }
      setBranding((b) => ({ ...b, photos: [...b.photos, ...urls].slice(0, 8) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(null);
      if (photosInput.current) photosInput.current.value = "";
    }
  };

  const setColor = (key: "primary_color" | "accent_color", raw: string) => {
    setBranding((b) => ({ ...b, [key]: raw }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!HEX_RE.test(branding.primary_color) || !HEX_RE.test(branding.accent_color)) {
      setError("Brand colors must be 6-digit hex values like #0c2440.");
      return;
    }
    onSubmit(branding);
  };

  const colorField = (
    key: "primary_color" | "accent_color",
    label: string,
    hint: string,
  ) => (
    <div>
      <Label htmlFor={`brand-${key}`}>{label}</Label>
      <div className="flex items-center gap-3">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={HEX_RE.test(branding[key]) ? branding[key] : "#000000"}
          onChange={(e) => setColor(key, e.target.value)}
          className="h-[46px] w-[56px] flex-none cursor-pointer rounded-[10px] border border-line-strong bg-card p-1"
        />
        <input
          id={`brand-${key}`}
          type="text"
          value={branding[key]}
          onChange={(e) => setColor(key, e.target.value)}
          spellCheck={false}
          className={cn(inputBase, "font-mono text-[0.85rem]")}
        />
      </div>
      <p className="mt-1.5 text-[0.75rem] text-ink-faint">{hint}</p>
    </div>
  );

  return (
    <form noValidate onSubmit={submit}>
      <StepHeader
        step={5}
        title={
          <>
            Make it look like <Em>your brand.</Em>
          </>
        }
        lede="Your logo and colors flow straight onto the booking widget and customer emails. All of this is optional — the Diamond defaults look sharp too."
      />

      <WizardError>{error}</WizardError>

      {/* Logo */}
      <div className="mb-6">
        <Label htmlFor="brand-logo" hint="PNG or SVG, up to 5MB">
          Logo
        </Label>
        <input
          ref={logoInput}
          id="brand-logo"
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => onLogoPick(e.target.files)}
        />
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => logoInput.current?.click()}
            disabled={uploading === "logo"}
            className={cn(
              "flex h-[92px] w-[180px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[14px] border border-dashed border-line-strong bg-surface-alt/60",
              "text-[0.78rem] font-semibold text-ink-muted",
              "transition-[border-color,color,background-color] duration-[var(--duration-fast)]",
              "hover:border-blue-600 hover:text-blue-600",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600",
              "disabled:cursor-wait disabled:opacity-70",
            )}
          >
            {uploading === "logo" ? (
              "Uploading…"
            ) : (
              <>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  className="h-5 w-5"
                  aria-hidden
                >
                  <path
                    d="M12 16V4m0 0l-4 4m4-4l4 4M4 17v2a1 1 0 001 1h14a1 1 0 001-1v-2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {branding.logo_url ? "Replace logo" : "Upload your logo"}
              </>
            )}
          </button>

          {branding.logo_url && (
            <div className="flex items-center gap-3">
              {/* Freshly uploaded blob/storage URL — next/image can't optimize these */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={branding.logo_url}
                alt="Logo preview"
                className="h-[64px] max-w-[200px] rounded-[10px] border border-line bg-card object-contain px-3 py-2"
              />
              <button
                type="button"
                onClick={() => setBranding((b) => ({ ...b, logo_url: null }))}
                className="cursor-pointer rounded-[8px] px-2 py-1 text-[0.78rem] font-semibold text-ink-faint transition-colors duration-[var(--duration-fast)] hover:bg-[#fdf6f5] hover:text-[#a63d39] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600"
              >
                Remove
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Colors */}
      <div className="mb-6 grid gap-5 min-[521px]:grid-cols-2">
        {colorField(
          "primary_color",
          "Primary color",
          "Headers and buttons on your booking page.",
        )}
        {colorField(
          "accent_color",
          "Accent color",
          "Highlights, confirmations and the “book now” moments.",
        )}
      </div>

      {/* Photos */}
      <div>
        <Label htmlFor="brand-photos" hint="Optional · up to 8">
          Business photos
        </Label>
        <input
          ref={photosInput}
          id="brand-photos"
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => onPhotosPick(e.target.files)}
        />
        <div className="flex flex-wrap gap-3">
          {branding.photos.map((url, index) => (
            <div key={url} className="group relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`Business photo ${index + 1}`}
                className="h-[76px] w-[76px] rounded-[12px] border border-line object-cover"
              />
              <button
                type="button"
                onClick={() =>
                  setBranding((b) => ({
                    ...b,
                    photos: b.photos.filter((p) => p !== url),
                  }))
                }
                aria-label={`Remove photo ${index + 1}`}
                className="absolute -top-1.5 -right-1.5 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-navy-900 text-[0.6rem] font-bold text-white shadow-[0_1px_3px_rgb(12_36_64/0.3)] transition-transform duration-[var(--duration-fast)] hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => photosInput.current?.click()}
            disabled={uploading === "photos" || branding.photos.length >= 8}
            className={cn(
              "flex h-[76px] w-[76px] cursor-pointer flex-col items-center justify-center gap-1 rounded-[12px] border border-dashed border-line-strong bg-surface-alt/60 text-[0.66rem] font-semibold text-ink-muted",
              "transition-[border-color,color] duration-[var(--duration-fast)] hover:border-blue-600 hover:text-blue-600",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600",
              "disabled:cursor-not-allowed disabled:opacity-60",
            )}
          >
            {uploading === "photos" ? (
              "…"
            ) : (
              <>
                <span aria-hidden className="text-[1rem] leading-none">
                  +
                </span>
                Add
              </>
            )}
          </button>
        </div>
        <p className="mt-2 text-[0.75rem] text-ink-faint">
          Before/after shots convert best — they appear on your booking page in
          a later phase.
        </p>
      </div>

      <StepFooter busy={busy} onBack={onBack} />
    </form>
  );
}
