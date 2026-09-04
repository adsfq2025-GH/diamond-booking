import { createClient } from "@/lib/supabase/server";
import type { CustomerPortal } from "@/lib/portal/types";
import type { Profile } from "@/types/domain";

export async function getCustomerPortalData(profile: Profile): Promise<CustomerPortal> {
  if (!profile.tenant_id) {
    throw new Error("Customer profile is missing tenant context.");
  }

  const supabase = await createClient();

  const { data: customer } = await supabase
    .from("customers")
    .select("id, full_name, email, addresses")
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (!customer) {
    return {
      name: profile.full_name,
      email: profile.email,
      upcoming: [],
      past: [],
      invoices: [],
      addresses: [],
      publicKey: "",
    };
  }

  const [{ data: bookings }, { data: invoices }, { data: widgetConfig }, { data: serviceRows }, { data: employeeRows }] = await Promise.all([
    supabase.from("bookings").select("id, service_id, employee_id, starts_at, ends_at, status, price_cents, address").eq("customer_id", customer.id).order("starts_at", { ascending: true }),
    supabase.from("invoices").select("id, number, status, total_cents, created_at").eq("tenant_id", profile.tenant_id).order("created_at", { ascending: false }),
    supabase.from("widget_configs").select("public_key").eq("tenant_id", profile.tenant_id).maybeSingle(),
    supabase.from("services").select("id, name"),
    supabase.from("employee_directory").select("id, full_name"),
  ]);

  const serviceNames = new Map((serviceRows ?? []).map((service) => [service.id, service.name]));
  const employeeNames = new Map((employeeRows ?? []).map((employee) => [employee.id, employee.full_name ?? "Team member"]));

  const entries = (bookings ?? []).map((booking) => ({
    id: booking.id,
    serviceName: serviceNames.get(booking.service_id) ?? "Service",
    employeeName: booking.employee_id ? employeeNames.get(booking.employee_id) ?? "Unassigned" : "Unassigned",
    startsAt: booking.starts_at,
    endsAt: booking.ends_at,
    status: booking.status,
    priceCents: booking.price_cents,
    addressLine: formatAddress(booking.address),
  }));

  const now = Date.now();

  return {
    name: customer.full_name,
    email: customer.email,
    upcoming: entries.filter((booking) => new Date(booking.startsAt).getTime() >= now),
    past: entries.filter((booking) => new Date(booking.startsAt).getTime() < now).reverse(),
    invoices: (invoices ?? []).map((invoice) => ({
      id: invoice.id,
      number: invoice.number,
      status: invoice.status,
      totalCents: invoice.total_cents,
      issuedAt: invoice.created_at,
    })),
    addresses: parseAddresses(customer.addresses),
    publicKey: widgetConfig?.public_key ?? "",
  };
}

function parseAddresses(value: unknown): Array<{ label: string; line: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const line = [row.line1, row.line2, row.city, row.state, row.postal_code].filter((part) => typeof part === "string" && part.length > 0).join(", ");
      if (!line) return null;
      return { label: typeof row.label === "string" && row.label ? row.label : `Address ${index + 1}`, line };
    })
    .filter((item): item is { label: string; line: string } => Boolean(item));
}

function formatAddress(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const line = [row.line1, row.line2, row.city, row.state, row.postal_code].filter((part) => typeof part === "string" && part.length > 0).join(", ");
  return line || null;
}
