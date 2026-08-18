"use server";

/**
 * Onboarding wizard server actions. Every action runs as the signed-in
 * business owner through the cookie-bound SSR client — RLS scopes all
 * writes to their own tenant (owner policies on tenants, services,
 * employees, business_hours). No admin client needed here.
 *
 * Each step's save also advances tenants.settings.onboarding_step so the
 * wizard resumes where the owner left off.
 */

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import type {
  ActionResult,
  BrandingInput,
  BusinessInfoInput,
  FinishInput,
  HoursInput,
  ServiceInput,
  TeamInput,
  TenantBranding,
  TenantSettings,
} from "@/lib/onboarding/types";
import type { Json, TablesInsert } from "@/types/database";

type SaveIdsResult = ActionResult | { ok: true; ids: string[] };

const GENERIC_ERROR = "Couldn't save — please try again.";

async function ownerContext() {
  const profile = await requireRole("business_owner");
  if (!profile.tenant_id) throw new Error("owner profile has no tenant");
  const supabase = await createClient();
  return { profile, tenantId: profile.tenant_id, supabase };
}

type OwnerCtx = Awaited<ReturnType<typeof ownerContext>>;

/** Merge new keys into tenants.settings (jsonb) without dropping others. */
async function mergeSettings(
  ctx: OwnerCtx,
  patch: TenantSettings,
  minStep?: number,
): Promise<void> {
  const { data: tenant, error: readError } = await ctx.supabase
    .from("tenants")
    .select("settings")
    .eq("id", ctx.tenantId)
    .single();
  if (readError) throw readError;

  const current = (tenant.settings ?? {}) as TenantSettings;
  const next: TenantSettings = { ...current, ...patch };
  if (minStep !== undefined) {
    next.onboarding_step = Math.max(Number(current.onboarding_step ?? 1), minStep);
  }

  const { error } = await ctx.supabase
    .from("tenants")
    .update({ settings: next as unknown as Json })
    .eq("id", ctx.tenantId);
  if (error) throw error;
}

// ============================================================
// Step 1 — Business info
// ============================================================
export async function saveBusinessInfo(
  input: BusinessInfoInput,
): Promise<ActionResult> {
  try {
    const ctx = await ownerContext();
    const name = input.name.trim();
    if (!name) return { ok: false, error: "The business needs a name." };

    const { error } = await ctx.supabase
      .from("tenants")
      .update({
        name,
        industry: input.industry.trim() || null,
        phone: input.phone.trim() || null,
        email: input.email.trim() || null,
        address: {
          street: input.street.trim(),
          city: input.city.trim(),
          state: input.state.trim(),
          zip: input.zip.trim(),
        } as unknown as Json,
        timezone: input.timezone || "America/New_York",
      })
      .eq("id", ctx.tenantId);
    if (error) throw error;

    await mergeSettings(ctx, {}, 2);
    return { ok: true };
  } catch (err) {
    console.error("saveBusinessInfo failed", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

// ============================================================
// Step 2 — Services
// ============================================================
export async function saveServices(
  services: ServiceInput[],
): Promise<SaveIdsResult> {
  try {
    const ctx = await ownerContext();
    const clean = services
      .map((s) => ({
        ...s,
        name: s.name.trim(),
        category: s.category.trim(),
      }))
      .filter((s) => s.name.length > 0);
    if (clean.length === 0) {
      return { ok: false, error: "Add at least one service before continuing." };
    }

    // Pre-launch reconcile: replace the tenant's catalog wholesale. Safe
    // during onboarding (no bookings can reference these rows yet). Delete
    // add-ons first (they reference services).
    await ctx.supabase.from("service_addons").delete().eq("tenant_id", ctx.tenantId);
    const { error: deleteError } = await ctx.supabase
      .from("services")
      .delete()
      .eq("tenant_id", ctx.tenantId);
    if (deleteError) throw deleteError;

    const rows: TablesInsert<"services">[] = clean.map((s, i) => ({
      tenant_id: ctx.tenantId,
      name: s.name,
      category: s.category || null,
      duration_minutes: Math.max(5, Math.round(s.duration_minutes) || 60),
      price_cents: Math.max(0, Math.round(s.price_cents) || 0),
      deposit_cents: Math.max(0, Math.round(s.deposit_cents) || 0),
      buffer_before_minutes: Math.max(0, Math.round(s.buffer_before_minutes) || 0),
      buffer_after_minutes: Math.max(0, Math.round(s.buffer_after_minutes) || 0),
      active: true,
      sort: i + 1,
    }));
    const { data: inserted, error: insertError } = await ctx.supabase
      .from("services")
      .insert(rows)
      .select("id");
    if (insertError || !inserted) throw insertError ?? new Error("insert failed");

    // Insert add-ons per service (inserted[] is parallel to clean[]).
    const addonRows: TablesInsert<"service_addons">[] = [];
    clean.forEach((s, i) => {
      const serviceId = inserted[i]?.id;
      if (!serviceId) return;
      for (const a of s.addons ?? []) {
        const name = a.name.trim();
        if (!name) continue;
        addonRows.push({
          tenant_id: ctx.tenantId,
          service_id: serviceId,
          name,
          price_cents: Math.max(0, Math.round(a.price_cents) || 0),
          duration_minutes: Math.max(0, Math.round(a.duration_minutes) || 0),
        });
      }
    });
    if (addonRows.length > 0) {
      const { error: addonError } = await ctx.supabase
        .from("service_addons")
        .insert(addonRows);
      if (addonError) throw addonError;
    }

    await mergeSettings(ctx, {}, 3);
    return { ok: true, ids: inserted.map((r) => r.id) };
  } catch (err) {
    console.error("saveServices failed", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

// ============================================================
// Step 3 — Team
// ============================================================
export async function saveTeam(input: TeamInput): Promise<ActionResult> {
  try {
    const ctx = await ownerContext();

    // Pre-launch reconcile: replace employee rows wholesale (no bookings yet).
    const { error: deleteError } = await ctx.supabase
      .from("employees")
      .delete()
      .eq("tenant_id", ctx.tenantId);
    if (deleteError) throw deleteError;

    const rows: TablesInsert<"employees">[] = [];
    if (input.ownerBookable) {
      rows.push({
        tenant_id: ctx.tenantId,
        profile_id: ctx.profile.id,
        display_name: ctx.profile.full_name,
        title: "Owner",
        color: input.ownerColor || "#2e86c1",
        active: true,
      });
    }
    for (const member of input.members) {
      const name = member.name.trim();
      const email = member.email.trim().toLowerCase();
      if (!name && !email) continue;
      rows.push({
        tenant_id: ctx.tenantId,
        invite_email: email || null,
        display_name: name || null,
        title: member.title.trim() || null,
        color: member.color || "#5a88a8",
        active: true,
      });
    }

    if (rows.length > 0) {
      const { error: insertError } = await ctx.supabase
        .from("employees")
        .insert(rows);
      if (insertError) throw insertError;
    }

    await mergeSettings(ctx, {}, 4);
    return { ok: true };
  } catch (err) {
    console.error("saveTeam failed", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

// ============================================================
// Step 4 — Hours
// ============================================================
export async function saveHours(input: HoursInput): Promise<ActionResult> {
  try {
    const ctx = await ownerContext();

    const rows: TablesInsert<"business_hours">[] = input.days.map((d) => ({
      tenant_id: ctx.tenantId,
      weekday: d.weekday,
      closed: d.closed,
      open_time: d.closed ? null : d.open_time || null,
      close_time: d.closed ? null : d.close_time || null,
    }));

    for (const d of input.days) {
      if (!d.closed && d.open_time && d.close_time && d.close_time <= d.open_time) {
        return {
          ok: false,
          error: "Closing time must be after opening time on every open day.",
        };
      }
    }

    const { error } = await ctx.supabase
      .from("business_hours")
      .upsert(rows, { onConflict: "tenant_id,weekday" });
    if (error) throw error;

    await mergeSettings(
      ctx,
      { default_buffer_minutes: Math.max(0, Math.round(input.default_buffer_minutes) || 0) },
      5,
    );
    return { ok: true };
  } catch (err) {
    console.error("saveHours failed", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

// ============================================================
// Step 5 — Branding
// ============================================================
export async function saveBranding(input: BrandingInput): Promise<ActionResult> {
  try {
    const ctx = await ownerContext();

    const { data: tenant, error: readError } = await ctx.supabase
      .from("tenants")
      .select("branding")
      .eq("id", ctx.tenantId)
      .single();
    if (readError) throw readError;

    const current = (tenant.branding ?? {}) as TenantBranding;
    const branding: TenantBranding = {
      ...current,
      logo_url: input.logo_url,
      primary_color: input.primary_color,
      accent_color: input.accent_color,
      photos: input.photos,
    };

    const { error } = await ctx.supabase
      .from("tenants")
      .update({ branding: branding as unknown as Json })
      .eq("id", ctx.tenantId);
    if (error) throw error;

    await mergeSettings(ctx, {}, 6);
    return { ok: true };
  } catch (err) {
    console.error("saveBranding failed", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

// ============================================================
// Step 6 — Booking settings + finish
// ============================================================
export async function finishOnboarding(input: FinishInput): Promise<ActionResult> {
  try {
    const ctx = await ownerContext();

    await mergeSettings(ctx, {
      auto_confirm: input.auto_confirm,
      cancellation_policy: input.cancellation_policy.trim(),
      cancellation_window_hours: Math.max(
        0,
        Math.round(input.cancellation_window_hours) || 24,
      ),
      deposit_required: input.deposit_required,
      payments_enabled: input.payments_enabled,
      recurring_enabled: input.recurring_enabled,
      onboarding_complete: true,
      onboarding_step: 6,
    });

    // Bookability defaults so the widget can offer slots on day one:
    //  - every employee without weekly availability gets rows mirroring the
    //    tenant's open business hours
    //  - every employee is linked to every service
    // Owners refine both later in the dashboard.
    const [{ data: employees }, { data: services }, { data: hours }] =
      await Promise.all([
        ctx.supabase.from("employees").select("id").eq("tenant_id", ctx.tenantId),
        ctx.supabase.from("services").select("id").eq("tenant_id", ctx.tenantId),
        ctx.supabase
          .from("business_hours")
          .select("weekday, open_time, close_time, closed")
          .eq("tenant_id", ctx.tenantId),
      ]);

    const openDays = (hours ?? []).filter(
      (h) => !h.closed && h.open_time && h.close_time,
    );

    if (employees && employees.length > 0) {
      const { data: existing } = await ctx.supabase
        .from("availability")
        .select("employee_id")
        .eq("tenant_id", ctx.tenantId);
      const covered = new Set((existing ?? []).map((a) => a.employee_id));

      const availabilityRows: TablesInsert<"availability">[] = [];
      for (const employee of employees) {
        if (covered.has(employee.id)) continue;
        for (const day of openDays) {
          availabilityRows.push({
            tenant_id: ctx.tenantId,
            employee_id: employee.id,
            weekday: day.weekday,
            start_time: day.open_time!,
            end_time: day.close_time!,
          });
        }
      }
      if (availabilityRows.length > 0) {
        const { error } = await ctx.supabase
          .from("availability")
          .insert(availabilityRows);
        if (error) throw error;
      }

      if (services && services.length > 0) {
        const links: TablesInsert<"employee_services">[] = [];
        for (const employee of employees) {
          for (const service of services) {
            links.push({ employee_id: employee.id, service_id: service.id });
          }
        }
        const { error } = await ctx.supabase
          .from("employee_services")
          .upsert(links, { onConflict: "employee_id,service_id" });
        if (error) throw error;
      }
    }

    return { ok: true };
  } catch (err) {
    console.error("finishOnboarding failed", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

// ============================================================
// Step persistence for back-navigation (resume support)
// ============================================================
export async function setOnboardingStep(step: number): Promise<ActionResult> {
  try {
    const ctx = await ownerContext();
    const clamped = Math.min(6, Math.max(1, Math.round(step)));
    await mergeSettings(ctx, { onboarding_step: clamped });
    return { ok: true };
  } catch (err) {
    console.error("setOnboardingStep failed", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}
