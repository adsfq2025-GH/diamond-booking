/**
 * Portal data (employee / customer / super-admin). Mock-first, mirroring the
 * seed, so all three portals are fully testable without a backend. The live
 * versions would read the same tenant-scoped tables under RLS (employees only
 * see their own assignments; customers only their own records; super-admin
 * reads platform-wide). Money is integer cents.
 */
import type { BookingStatus, InvoiceStatus } from "@/types/database";

function at(dayOffset: number, hh: number, mm = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
}
const plus = (iso: string, mins: number) =>
  new Date(new Date(iso).getTime() + mins * 60000).toISOString();

// ================= Employee (Maria) =================
export interface EmpJob {
  id: string;
  customerName: string;
  serviceName: string;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  addressLine: string | null;
  notes: string | null;
  payCents: number;
}
export interface EmpRequest {
  id: string;
  kind: string;
  body: string;
  status: "pending" | "approved" | "denied";
  at: string;
}
export interface EmployeePortal {
  name: string;
  title: string;
  color: string;
  today: EmpJob[];
  week: EmpJob[];
  upcoming: EmpJob[];
  earnings: { monthCents: number; lastMonthCents: number; jobsMonth: number; hoursMonth: number };
  payHistory: Array<{ period: string; jobs: number; hours: number; amountCents: number; status: "paid" | "pending" }>;
  availability: Array<{ weekday: number; start: string | null; end: string | null }>;
  timeOff: Array<{ id: string; from: string; to: string; reason: string; status: "approved" | "pending" }>;
  requests: EmpRequest[];
}

function empJob(
  id: string,
  customer: string,
  service: string,
  day: number,
  hh: number,
  mins: number,
  status: BookingStatus,
  addr: string | null,
  pay: number,
  notes: string | null = null,
): EmpJob {
  const startsAt = at(day, hh);
  return { id, customerName: customer, serviceName: service, startsAt, endsAt: plus(startsAt, mins), status, addressLine: addr, notes, payCents: pay };
}

export function getEmployeePortal(): EmployeePortal {
  const today: EmpJob[] = [
    empJob("j1", "Dana Whitfield", "Standard Home Cleaning", 0, 9, 120, "confirmed", "12 Birch Ln, Springfield", 4400, "Please use the side door."),
    empJob("j2", "Marcus Bell", "Deep Cleaning", 0, 13, 240, "confirmed", "204 Elm St, Springfield", 8800),
  ];
  const week: EmpJob[] = [
    ...today,
    empJob("j3", "Robert Kim", "Standard Home Cleaning", 1, 10, 120, "confirmed", "88 Cedar St, Springfield", 4400),
    empJob("j4", "Priya Nair", "Office Cleaning", 2, 13, 90, "confirmed", null, 3300),
    empJob("j5", "Elena Ruiz", "Deep Cleaning", 3, 9, 240, "confirmed", "17 Willow Way, Springfield", 8800),
  ];
  const upcoming: EmpJob[] = [
    ...week.filter((j) => j.id !== "j1" && j.id !== "j2"),
    empJob("j6", "Dana Whitfield", "Standard Home Cleaning", 5, 9, 120, "confirmed", "12 Birch Ln, Springfield", 4400),
    empJob("j7", "The Corner Office LLC", "Office Cleaning", 6, 18, 90, "confirmed", "900 Market St, Springfield", 3300),
  ];
  return {
    name: "Maria Lopez",
    title: "Senior Cleaner",
    color: "#2e86c1",
    today,
    week,
    upcoming,
    earnings: { monthCents: 387200, lastMonthCents: 341000, jobsMonth: 22, hoursMonth: 78 },
    payHistory: [
      { period: "This month (in progress)", jobs: 22, hours: 78, amountCents: 387200, status: "pending" },
      { period: "Last month", jobs: 26, hours: 92, amountCents: 341000, status: "paid" },
      { period: "Two months ago", jobs: 24, hours: 85, amountCents: 318000, status: "paid" },
    ],
    availability: [
      { weekday: 1, start: "08:00", end: "16:00" },
      { weekday: 2, start: "08:00", end: "16:00" },
      { weekday: 3, start: "08:00", end: "16:00" },
      { weekday: 4, start: "08:00", end: "16:00" },
      { weekday: 5, start: "08:00", end: "16:00" },
      { weekday: 6, start: null, end: null },
      { weekday: 0, start: null, end: null },
    ],
    timeOff: [
      { id: "t1", from: at(20, 0), to: at(22, 0), reason: "Long weekend", status: "pending" },
    ],
    requests: [
      { id: "r1", kind: "Equipment", body: "Vacuum in van #2 is losing suction — requesting a replacement.", status: "pending", at: at(-1, 9) },
      { id: "r2", kind: "Schedule change", body: "Could I swap Saturday for Monday availability next month?", status: "approved", at: at(-6, 14) },
    ],
  };
}

// ================= Customer (Dana) =================
export interface CustBooking {
  id: string;
  serviceName: string;
  employeeName: string;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  priceCents: number;
  addressLine: string | null;
}
export interface CustInvoice {
  id: string;
  number: string;
  status: InvoiceStatus;
  totalCents: number;
  issuedAt: string;
}
export interface CustomerPortal {
  name: string;
  email: string;
  upcoming: CustBooking[];
  past: CustBooking[];
  invoices: CustInvoice[];
  addresses: Array<{ label: string; line: string }>;
  publicKey: string;
}

export function getCustomerPortal(): CustomerPortal {
  const mk = (id: string, svc: string, emp: string, day: number, hh: number, mins: number, status: BookingStatus, price: number, addr: string | null): CustBooking => {
    const startsAt = at(day, hh);
    return { id, serviceName: svc, employeeName: emp, startsAt, endsAt: plus(startsAt, mins), status, priceCents: price, addressLine: addr };
  };
  return {
    name: "Dana Whitfield",
    email: "dana@customer.demo",
    publicKey: "demo000000000000000000ff",
    upcoming: [
      mk("cb1", "Standard Home Cleaning", "Maria Lopez", 2, 9, 120, "confirmed", 12000, "12 Birch Ln, Springfield"),
      mk("cb2", "Deep Cleaning", "James Carter", 9, 9, 240, "pending", 24000, "12 Birch Ln, Springfield"),
    ],
    past: [
      mk("cb3", "Standard Home Cleaning", "Maria Lopez", -14, 9, 120, "completed", 12000, "12 Birch Ln, Springfield"),
      mk("cb4", "Standard Home Cleaning", "Maria Lopez", -28, 9, 120, "completed", 12000, "12 Birch Ln, Springfield"),
      mk("cb5", "Deep Cleaning", "Maria Lopez", -45, 10, 240, "completed", 24000, "12 Birch Ln, Springfield"),
    ],
    invoices: [
      { id: "ci1", number: "INV-2026-0001", status: "paid", totalCents: 17000, issuedAt: at(-14, 10) },
      { id: "ci2", number: "INV-2025-0087", status: "paid", totalCents: 12000, issuedAt: at(-28, 10) },
    ],
    addresses: [{ label: "Home", line: "12 Birch Ln, Springfield, IL 62704" }],
  };
}

// ================= Super admin =================
export interface AdminTenant {
  id: string;
  name: string;
  plan: "starter" | "professional" | "elite";
  status: "active" | "trialing" | "past_due" | "suspended";
  mrrCents: number;
  employees: number;
  bookings30d: number;
  joinedAt: string;
  suspended: boolean;
}
export interface AdminData {
  metrics: { mrrCents: number; arrCents: number; tenants: number; activeTenants: number; churnRate: number; trialConversions: number };
  mrrBars: Array<{ label: string; cents: number }>;
  tenants: AdminTenant[];
  featureFlags: Array<{ key: string; description: string; enabled: boolean }>;
  audit: Array<{ id: string; actor: string; action: string; target: string; at: string }>;
}

export function getAdminData(): AdminData {
  const tenants: AdminTenant[] = [
    { id: "t1", name: "Clean Sweep Services", plan: "professional", status: "trialing", mrrCents: 5900, employees: 3, bookings30d: 42, joinedAt: at(-6, 10), suspended: false },
    { id: "t2", name: "Polished HVAC Co.", plan: "elite", status: "active", mrrCents: 11900, employees: 9, bookings30d: 118, joinedAt: at(-190, 10), suspended: false },
    { id: "t3", name: "GreenLeaf Landscaping", plan: "starter", status: "active", mrrCents: 2900, employees: 2, bookings30d: 27, joinedAt: at(-95, 10), suspended: false },
    { id: "t4", name: "Metro Plumbing", plan: "professional", status: "past_due", mrrCents: 5900, employees: 6, bookings30d: 64, joinedAt: at(-140, 10), suspended: false },
    { id: "t5", name: "BrightHome Roofing", plan: "starter", status: "suspended", mrrCents: 0, employees: 4, bookings30d: 0, joinedAt: at(-260, 10), suspended: true },
    { id: "t6", name: "Sparkle Maids", plan: "professional", status: "active", mrrCents: 5900, employees: 5, bookings30d: 88, joinedAt: at(-70, 10), suspended: false },
  ];
  const mrr = tenants.reduce((s, t) => s + t.mrrCents, 0);
  return {
    metrics: {
      mrrCents: mrr,
      arrCents: mrr * 12,
      tenants: tenants.length,
      activeTenants: tenants.filter((t) => !t.suspended).length,
      churnRate: 0.021,
      trialConversions: 0.62,
    },
    mrrBars: [
      { label: "Feb", cents: 1800000 },
      { label: "Mar", cents: 2140000 },
      { label: "Apr", cents: 2460000 },
      { label: "May", cents: 2790000 },
      { label: "Jun", cents: 3020000 },
      { label: "Jul", cents: 3240000 },
      { label: "Aug", cents: mrr * 100 },
    ],
    tenants,
    featureFlags: [
      { key: "customer_portal", description: "Customer self-service portal (/portal)", enabled: true },
      { key: "stripe_payments", description: "Stripe checkout + deposits", enabled: true },
      { key: "sms_reminders", description: "Twilio SMS reminders", enabled: true },
      { key: "widget_v2", description: "Next-gen embeddable widget", enabled: false },
    ],
    audit: [
      { id: "a1", actor: "system", action: "subscription.trial_started", target: "Clean Sweep Services", at: at(0, 8) },
      { id: "a2", actor: "admin@diamond", action: "tenant.suspended", target: "BrightHome Roofing", at: at(-2, 15) },
      { id: "a3", actor: "system", action: "payment.failed", target: "Metro Plumbing", at: at(-3, 11) },
      { id: "a4", actor: "admin@diamond", action: "feature_flag.updated", target: "widget_v2", at: at(-5, 9) },
    ],
  };
}
