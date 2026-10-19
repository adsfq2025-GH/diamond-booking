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

import { unstable_rethrow } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { tenantPlanContext } from "@/lib/entitlements";
import { PLANS, withinEmployeeLimit } from "@/lib/plans";
import type {
  ActionResult,
  BrandingInput,
  BusinessInfoInput,
  FinishInput,
  HoursInput,
  GlobalAddonInput,
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

/**
 * Merge new keys into tenants.settings (jsonb) without dropping others.
 *
 * Done in SQL (merge_tenant_settings, 0010) rather than read-modify-write in
 * JS: the old version read the row, spread a patch over it here and wrote the
 * whole object back, so two concurrent saves lost one patch (A39).
 */
async function mergeSettings(
  ctx: OwnerCtx,
  patch: TenantSettings,
  minStep?: number,
): Promise<void> {
  const { error } = await ctx.supabase.rpc("merge_tenant_settings", {
    p_patch: patch as unknown as Json,
    p_min_step: minStep ?? null,
  });
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
    unstable_rethrow(err);
    console.error("saveBusinessInfo failed", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

// ============================================================
// Step 2 — Services
// ============================================================
/**
 * Persist the service catalog and the extras offered on it.
 *
 * Delegates to onboarding_save_catalog (0009), which upserts by service name
 * inside ONE transaction and keeps ids stable. The previous implementation
 * deleted every add-on and then every service: on a tenant with bookings the
 * services delete failed on the ON DELETE RESTRICT from bookings — after the
 * add-ons were already gone, with no rollback — and the add-ons were never
 * re-inserted in the first place (A13).
 *
 * A service the owner removes from the list is deactivated when a booking
 * references it and deleted only when nothing does, so history survives.
 */
export async function saveServices(
  services: ServiceInput[],
  addons: GlobalAddonInput[] = [],
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

    const payload = clean.map((s) => ({
      name: s.name,
      category: s.category || null,
      // Honour the duration the owner entered for BOTH pricing modes. Hourly
      // services derive it from the minimum billable hours; flat-rate ones use
      // the duration field directly instead of a hardcoded 60 (A14).
      duration_minutes:
        s.pricing_unit === "hourly"
          ? Math.max(15, Math.round((s.minimum_hours ?? 1) * 60))
          : Math.max(15, Math.round(s.duration_minutes) || 60),
      price_cents: Math.max(0, Math.round(s.price_cents) || 0),
      deposit_cents: Math.max(0, Math.round(s.deposit_cents) || 0),
      buffer_before_minutes: Math.max(0, Math.round(s.buffer_before_minutes) || 0),
      buffer_after_minutes: Math.max(0, Math.round(s.buffer_after_minutes) || 0),
      // Persisted so reopening the wizard shows the model the owner chose,
      // instead of re-presenting every service as hourly.
      pricing_unit: s.pricing_unit ?? "hourly",
      minimum_hours: s.minimum_hours ?? null,
      pricing_unit_label: s.custom_pricing_unit_label?.trim() || null,
    }));

    const addonPayload = addons
      .map((a) => ({
        name: a.name.trim(),
        price_cents: Math.max(0, Math.round(a.price_cents) || 0),
        // An add-on's duration is what makes availability honest: a 30-minute
        // extra must remove the start times that can no longer hold the job.
        duration_minutes: Math.max(0, Math.round(a.duration_minutes) || 0),
      }))
      .filter((a) => a.name.length > 0);

    const { data, error } = await ctx.supabase.rpc("onboarding_save_catalog", {
      p_services: payload as unknown as Json,
      p_addons: addonPayload as unknown as Json,
    });
    if (error) throw error;

    const result = (data ?? {}) as { service_ids?: string[] };
    await mergeSettings(ctx, {}, 3);
    return { ok: true, ids: result.service_ids ?? [] };
  } catch (err) {
    unstable_rethrow(err);
    console.error("saveServices failed", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

// ============================================================
// Step 3 — Team
// ============================================================
/**
 * Persist the team.
 *
 * Delegates to onboarding_save_team (0009): upsert by invite email (then by
 * display name) in one transaction. The previous implementation deleted every
 * employees row first — and employees is ON DELETE SET NULL from bookings, so
 * that silently unassigned every existing booking and released the slots the
 * no_double_booking constraint was holding (A13). Anyone with bookings is now
 * deactivated instead of deleted.
 */
export async function saveTeam(input: TeamInput): Promise<ActionResult> {
  try {
    const ctx = await ownerContext();

    const members = input.members
      .map((m) => ({
        name: m.name.trim(),
        email: m.email.trim().toLowerCase(),
        title: m.title.trim(),
        color: m.color || "#5a88a8",
      }))
      .filter((m) => m.name.length > 0 || m.email.length > 0);

    // Plan seat limit, enforced on the server (A19). The owner's own bookable
    // row counts as a seat, since it occupies a calendar.
    const seats = members.length + (input.ownerBookable ? 1 : 0);
    const planCtx = await tenantPlanContext();
    if (planCtx && !withinEmployeeLimit(planCtx.plan, seats)) {
      const limit = PLANS[planCtx.plan].maxEmployees;
      return {
        ok: false,
        error: `${PLANS[planCtx.plan].name} includes ${limit} team ${limit === 1 ? "member" : "members"} — you have listed ${seats}. Remove some, or upgrade your plan.`,
      };
    }

    const { error } = await ctx.supabase.rpc("onboarding_save_team", {
      p_owner_bookable: input.ownerBookable,
      p_owner_color: input.ownerColor || "#2e86c1",
      p_members: members as unknown as Json,
    });
    if (error) throw error;

    await mergeSettings(ctx, {}, 4);
    return { ok: true };
  } catch (err) {
    unstable_rethrow(err);
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
    unstable_rethrow(err);
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
    unstable_rethrow(err);
    console.error("saveBranding failed", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

// ============================================================
// Step 6 — Booking settings + finish
// ============================================================
/**
 * Human-readable text for each readiness blocker onboarding_readiness() can
 * report. Owners get told what is actually missing instead of a generic error.
 */
const READINESS_BLOCKERS: Record<string, string> = {
  no_active_services: "no active services",
  no_active_staff: "nobody is set up to do the work",
  no_open_days: "the business is closed every day of the week",
  no_staff_qualified_for_any_service: "no team member is linked to a service",
  no_staff_working_hours: "no team member has any working hours",
  deposits_configured_without_stripe_charges:
    "services require a deposit but Stripe cannot accept charges yet",
};

export async function finishOnboarding(input: FinishInput): Promise<ActionResult> {
  try {
    const ctx = await ownerContext();

    // Settings first, WITHOUT the completion flag. The flag is set at the end,
    // and only once the database can prove the tenant is bookable — it used to
    // be written before any of the work below, so a failure left a tenant
    // marked complete with a widget that could never offer a slot (A21).
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

    // Now ask the database whether this tenant can actually take a booking.
    const { data: readinessRow, error: readinessError } =
      await ctx.supabase.rpc("onboarding_readiness");
    if (readinessError) throw readinessError;

    const readiness = (readinessRow ?? {}) as {
      booking_ready?: boolean;
      blockers?: string[];
    };
    if (!readiness.booking_ready) {
      const reasons = (readiness.blockers ?? [])
        .map((b) => READINESS_BLOCKERS[b] ?? b)
        .join("; ");
      return {
        ok: false,
        error: reasons
          ? `Not quite ready to publish — ${reasons}. Fix that and finish again.`
          : "Not quite ready to publish: this business cannot take a booking yet.",
      };
    }

    // Proven bookable: only now is onboarding complete.
    await mergeSettings(ctx, { onboarding_complete: true }, 6);
    return { ok: true };
  } catch (err) {
    unstable_rethrow(err);
    console.error("finishOnboarding failed", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/** Readiness for the dashboard and the wizard's finish screen. */
export async function getOnboardingReadiness(): Promise<
  | { ok: true; bookingReady: boolean; paymentReady: boolean; blockers: string[] }
  | { ok: false; error: string }
> {
  try {
    const ctx = await ownerContext();
    const { data, error } = await ctx.supabase.rpc("onboarding_readiness");
    if (error) throw error;
    const r = (data ?? {}) as {
      booking_ready?: boolean;
      payment_ready?: boolean;
      blockers?: string[];
    };
    return {
      ok: true,
      bookingReady: Boolean(r.booking_ready),
      paymentReady: Boolean(r.payment_ready),
      blockers: (r.blockers ?? []).map((b) => READINESS_BLOCKERS[b] ?? b),
    };
  } catch (err) {
    // redirect()/notFound() and the dynamic-rendering bailout are control flow,
    // not failures: swallowing them would turn an unauthenticated visit into a
    // silent "not ready" instead of a redirect to /login.
    unstable_rethrow(err);
    console.error("getOnboardingReadiness failed", err);
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
    unstable_rethrow(err);
    console.error("setOnboardingStep failed", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}
