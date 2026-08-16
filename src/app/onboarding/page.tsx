import type { Metadata } from "next";
import { supabaseEnvConfigured } from "@/lib/env";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_ACCENT_COLOR,
  DEFAULT_PRIMARY_COLOR,
  defaultHours,
  type TenantBranding,
  type TenantSettings,
  type WizardData,
} from "@/lib/onboarding/types";
import { OnboardingWizard } from "./OnboardingWizard";
import { MOCK_OWNER_NAME, MOCK_PUBLIC_KEY, mockWizardData } from "./mock";

export const metadata: Metadata = {
  title: "Set up your business",
  description: "Six quick steps from signup to a live booking widget.",
};

interface TenantAddress {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // ---------- PLACEHOLDER-ENV PREVIEW MODE ----------
  // No real Supabase keys: render the wizard against an in-memory mock
  // tenant so every step is visually testable. ?step=N jumps straight to a
  // step (7 = the finished widget panel). Gated on supabaseEnvConfigured —
  // with real keys this branch is unreachable.
  if (!supabaseEnvConfigured()) {
    const { step } = await searchParams;
    const parsed = Number.parseInt(step ?? "1", 10);
    const initialStep = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 7) : 1;

    return (
      <OnboardingWizard
        mode="mock"
        initialStep={initialStep}
        initialData={mockWizardData()}
        tenantId=""
        publicKey={MOCK_PUBLIC_KEY}
        appUrl={appUrl}
        ownerName={MOCK_OWNER_NAME}
      />
    );
  }

  // ---------- LIVE MODE ----------
  const profile = await requireRole("business_owner");
  const supabase = await createClient();
  const tenantId = profile.tenant_id!;

  const [
    { data: tenant },
    { data: services },
    { data: addons },
    { data: employees },
    { data: hours },
    { data: widget },
  ] = await Promise.all([
    supabase.from("tenants").select("*").eq("id", tenantId).single(),
    supabase
      .from("services")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("sort"),
    supabase.from("service_addons").select("*").eq("tenant_id", tenantId),
    supabase.from("employees").select("*").eq("tenant_id", tenantId),
    supabase.from("business_hours").select("*").eq("tenant_id", tenantId),
    supabase
      .from("widget_configs")
      .select("public_key")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
  ]);

  const settings = (tenant?.settings ?? {}) as TenantSettings;
  const branding = (tenant?.branding ?? {}) as TenantBranding;
  const address = (tenant?.address ?? {}) as TenantAddress;

  const ownerRow = (employees ?? []).find((e) => e.profile_id === profile.id);
  const memberRows = (employees ?? []).filter((e) => e.profile_id !== profile.id);

  const hoursByWeekday = new Map((hours ?? []).map((h) => [h.weekday, h]));
  const days = defaultHours().map((fallback) => {
    const row = hoursByWeekday.get(fallback.weekday);
    if (!row) return fallback;
    return {
      weekday: fallback.weekday,
      closed: row.closed,
      open_time: (row.open_time ?? fallback.open_time).slice(0, 5),
      close_time: (row.close_time ?? fallback.close_time).slice(0, 5),
    };
  });

  const data: WizardData = {
    business: {
      name: tenant?.name ?? "",
      industry: tenant?.industry ?? "",
      phone: tenant?.phone ?? "",
      email: tenant?.email ?? "",
      street: address.street ?? "",
      city: address.city ?? "",
      state: address.state ?? "",
      zip: address.zip ?? "",
      timezone: tenant?.timezone ?? "America/New_York",
    },
    services: (services ?? []).map((s) => ({
      localId: s.id,
      name: s.name,
      category: s.category ?? "",
      duration_minutes: s.duration_minutes,
      price_cents: s.price_cents,
      deposit_cents: s.deposit_cents,
      buffer_before_minutes: s.buffer_before_minutes,
      buffer_after_minutes: s.buffer_after_minutes,
      addons: (addons ?? [])
        .filter((a) => a.service_id === s.id)
        .map((a) => ({
          localId: a.id,
          name: a.name,
          price_cents: a.price_cents,
          duration_minutes: a.duration_minutes,
        })),
    })),
    team: {
      ownerBookable: Boolean(ownerRow),
      ownerColor: ownerRow?.color ?? "#2e86c1",
      members: memberRows.map((m) => ({
        localId: m.id,
        name: m.display_name ?? "",
        email: m.invite_email ?? "",
        title: m.title ?? "",
        color: m.color ?? "#5a88a8",
      })),
    },
    hours: {
      days,
      default_buffer_minutes: Number(settings.default_buffer_minutes ?? 15),
    },
    branding: {
      logo_url: branding.logo_url ?? null,
      primary_color: branding.primary_color ?? DEFAULT_PRIMARY_COLOR,
      accent_color: branding.accent_color ?? DEFAULT_ACCENT_COLOR,
      photos: branding.photos ?? [],
    },
    finish: {
      auto_confirm:
        settings.auto_confirm === true || settings.auto_confirm === "true",
      cancellation_policy:
        settings.cancellation_policy ??
        "Free cancellation up to 24 hours before your appointment. Later cancellations may forfeit the deposit.",
      cancellation_window_hours: Number(settings.cancellation_window_hours ?? 24),
      deposit_required: Boolean(settings.deposit_required),
      payments_enabled: Boolean(settings.payments_enabled),
    },
  };

  // Resume where they left off; completed onboarding opens the widget panel.
  const initialStep = settings.onboarding_complete
    ? 7
    : Math.min(Math.max(Number(settings.onboarding_step ?? 1), 1), 6);

  return (
    <OnboardingWizard
      mode="live"
      initialStep={initialStep}
      initialData={data}
      tenantId={tenantId}
      publicKey={widget?.public_key ?? ""}
      appUrl={appUrl}
      ownerName={profile.full_name}
    />
  );
}
