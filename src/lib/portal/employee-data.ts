import { createClient } from "@/lib/supabase/server";
import type { EmployeePortal } from "@/lib/portal/types";
import type { Profile } from "@/types/domain";

export async function getEmployeePortalData(profile: Profile): Promise<EmployeePortal> {
  if (!profile.tenant_id) {
    throw new Error("Employee profile is missing tenant context.");
  }

  const supabase = await createClient();
  const { data: employee } = await supabase
    .from("employees")
    .select("id, title, color")
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (!employee) {
    return {
      name: profile.full_name,
      title: "Team member",
      color: "#2e86c1",
      today: [],
      week: [],
      upcoming: [],
      earnings: { monthCents: 0, lastMonthCents: 0, jobsMonth: 0, hoursMonth: 0 },
      payHistory: [],
      availability: [],
      timeOff: [],
      requests: [],
    };
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfToday);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  const [{ data: bookings }, { data: availability }, { data: timeOff }, { data: requests }, { data: serviceRows }, { data: customerRows }] = await Promise.all([
    supabase.from("bookings").select("id, customer_id, service_id, starts_at, ends_at, status, address, internal_notes, price_cents").eq("employee_id", employee.id).order("starts_at", { ascending: true }),
    supabase.from("availability").select("weekday, start_time, end_time").eq("employee_id", employee.id).order("weekday"),
    supabase.from("time_off").select("id, starts_at, ends_at, reason, status").eq("employee_id", employee.id).order("starts_at", { ascending: false }),
    supabase.from("employee_requests").select("id, kind, body, status, created_at").eq("employee_id", employee.id).order("created_at", { ascending: false }),
    supabase.from("services").select("id, name").eq("tenant_id", profile.tenant_id),
    supabase.from("customers").select("id, full_name").eq("tenant_id", profile.tenant_id),
  ]);

  const serviceNames = new Map((serviceRows ?? []).map((service) => [service.id, service.name]));
  const customerNames = new Map((customerRows ?? []).map((customer) => [customer.id, customer.full_name]));

  const jobs = (bookings ?? []).map((booking) => ({
    id: booking.id,
    customerName: customerNames.get(booking.customer_id) ?? "Customer",
    serviceName: serviceNames.get(booking.service_id) ?? "Service",
    startsAt: booking.starts_at,
    endsAt: booking.ends_at,
    status: booking.status,
    addressLine: formatAddress(booking.address),
    notes: booking.internal_notes,
    payCents: Math.round(booking.price_cents * 0.35),
  }));

  const today = jobs.filter((job) => isSameDay(job.startsAt, startOfToday));
  const week = jobs.filter((job) => new Date(job.startsAt).getTime() >= startOfToday.getTime() && new Date(job.startsAt).getTime() < endOfWeek.getTime());
  const upcoming = jobs.filter((job) => new Date(job.startsAt).getTime() >= startOfToday.getTime());
  const monthCents = upcoming.reduce((sum, job) => sum + job.payCents, 0);
  const hoursMonth = Math.round(upcoming.reduce((sum, job) => sum + (new Date(job.endsAt).getTime() - new Date(job.startsAt).getTime()) / 3600000, 0));

  return {
    name: profile.full_name,
    title: employee.title ?? "Team member",
    color: employee.color ?? "#2e86c1",
    today,
    week,
    upcoming,
    earnings: {
      monthCents,
      lastMonthCents: 0,
      jobsMonth: upcoming.length,
      hoursMonth,
    },
    payHistory: monthCents > 0 ? [{ period: "Current period", jobs: upcoming.length, hours: hoursMonth, amountCents: monthCents, status: "pending" }] : [],
    availability: (availability ?? []).map((slot) => ({ weekday: slot.weekday, start: slot.start_time, end: slot.end_time })),
    timeOff: (timeOff ?? []).map((entry) => ({ id: entry.id, from: entry.starts_at, to: entry.ends_at, reason: entry.reason ?? "Time off", status: entry.status === "approved" ? "approved" : "pending" })),
    requests: (requests ?? []).map((request) => ({ id: request.id, kind: request.kind, body: request.body, status: request.status === "approved" ? "approved" : request.status === "denied" ? "denied" : "pending", at: request.created_at })),
  };
}

function formatAddress(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const line = [row.line1, row.line2, row.city, row.state, row.postal_code].filter((part) => typeof part === "string" && part.length > 0).join(", ");
  return line || null;
}

function isSameDay(iso: string, day: Date) {
  const date = new Date(iso);
  return date.getFullYear() === day.getFullYear() && date.getMonth() === day.getMonth() && date.getDate() === day.getDate();
}
