/**
 * Coherent PLACEHOLDER-ENV mock dataset for all dashboard sections. Mirrors
 * supabase/seed.sql (demo tenant "Clean Sweep Services") but fleshed out so
 * tables and reports read realistically. Dates are relative to today. Used
 * only when supabaseEnvConfigured() is false.
 */
import { MOCK, MOCK_EMPLOYEES } from "./mock";
import type {
  BookingView,
  BookingsData,
  CalendarData,
  CalendarEvent,
  CouponView,
  CustomerView,
  EmployeeView,
  InvoiceView,
  InvoicesData,
  PaymentView,
  PaymentsData,
  ReportsData,
  ServiceView,
  WidgetData,
} from "./types";
import type { BookingStatus } from "@/types/database";

function at(dayOffset: number, hh: number, mm = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
}
const plus = (iso: string, mins: number) =>
  new Date(new Date(iso).getTime() + mins * 60000).toISOString();

const EMP = MOCK_EMPLOYEES; // [Maria e1, James e2, Sarah e3]

// ---------- services ----------
const SERVICES: ServiceView[] = [
  {
    id: "s1",
    name: "Standard Home Cleaning",
    description: "Full clean of kitchen, bathrooms, bedrooms and living areas.",
    category: "Residential",
    durationMinutes: 120,
    priceCents: 12000,
    depositCents: 0,
    bufferBefore: 0,
    bufferAfter: 30,
    active: true,
    addons: [
      { id: "a1", name: "Inside fridge", priceCents: 2500, durationMinutes: 30 },
      { id: "a2", name: "Inside oven", priceCents: 2500, durationMinutes: 30 },
      { id: "a3", name: "Interior windows", priceCents: 3500, durationMinutes: 45 },
    ],
    employeeCount: 3,
    bookingCount: 18,
  },
  {
    id: "s2",
    name: "Deep Cleaning",
    description: "Top-to-bottom deep clean including baseboards, vents and fixtures.",
    category: "Residential",
    durationMinutes: 240,
    priceCents: 24000,
    depositCents: 5000,
    bufferBefore: 0,
    bufferAfter: 30,
    active: true,
    addons: [
      { id: "a4", name: "Laundry (2 loads)", priceCents: 3000, durationMinutes: 60 },
      { id: "a5", name: "Inside fridge + oven", priceCents: 4000, durationMinutes: 60 },
    ],
    employeeCount: 3,
    bookingCount: 11,
  },
  {
    id: "s3",
    name: "Move-In / Move-Out",
    description: "Empty-home cleaning for moves, inside cabinets and appliances.",
    category: "Residential",
    durationMinutes: 300,
    priceCents: 32000,
    depositCents: 5000,
    bufferBefore: 0,
    bufferAfter: 30,
    active: true,
    addons: [
      { id: "a6", name: "Garage sweep-out", priceCents: 4500, durationMinutes: 60 },
    ],
    employeeCount: 2,
    bookingCount: 6,
  },
  {
    id: "s4",
    name: "Office Cleaning",
    description: "After-hours cleaning for small offices up to 3,000 sq ft.",
    category: "Commercial",
    durationMinutes: 90,
    priceCents: 15000,
    depositCents: 0,
    bufferBefore: 0,
    bufferAfter: 15,
    active: true,
    addons: [],
    employeeCount: 2,
    bookingCount: 9,
  },
];

// ---------- customers ----------
const CUSTOMERS: CustomerView[] = [
  {
    id: "c1",
    fullName: "Dana Whitfield",
    email: "dana@customer.demo",
    phone: "+1 (555) 010-0004",
    tags: ["repeat", "VIP"],
    addressLine: "12 Birch Ln, Springfield, IL",
    hasPortalAccount: true,
    bookingsCount: 7,
    ltvCents: 84000,
    lastBookingAt: at(2, 9),
    createdAt: at(-190, 10),
  },
  {
    id: "c2",
    fullName: "Robert Kim",
    email: "robert.kim@example.com",
    phone: "+1 (555) 010-0005",
    tags: ["repeat"],
    addressLine: "88 Cedar St, Springfield, IL",
    hasPortalAccount: false,
    bookingsCount: 5,
    ltvCents: 62000,
    lastBookingAt: at(1, 10),
    createdAt: at(-120, 10),
  },
  {
    id: "c3",
    fullName: "Priya Nair",
    email: "priya.nair@example.com",
    phone: null,
    tags: ["new"],
    addressLine: null,
    hasPortalAccount: false,
    bookingsCount: 2,
    ltvCents: 27000,
    lastBookingAt: at(2, 13),
    createdAt: at(-14, 10),
  },
  {
    id: "c4",
    fullName: "Marcus Bell",
    email: "marcus.bell@example.com",
    phone: "+1 (555) 010-0021",
    tags: ["repeat"],
    addressLine: "204 Elm St, Springfield, IL",
    hasPortalAccount: true,
    bookingsCount: 9,
    ltvCents: 108000,
    lastBookingAt: at(-3, 12),
    createdAt: at(-260, 10),
  },
  {
    id: "c5",
    fullName: "Elena Ruiz",
    email: "elena.ruiz@example.com",
    phone: "+1 (555) 010-0022",
    tags: [],
    addressLine: "17 Willow Way, Springfield, IL",
    hasPortalAccount: false,
    bookingsCount: 3,
    ltvCents: 39000,
    lastBookingAt: at(-8, 9),
    createdAt: at(-70, 10),
  },
  {
    id: "c6",
    fullName: "The Corner Office LLC",
    email: "ops@corneroffice.example",
    phone: "+1 (555) 010-0088",
    tags: ["commercial"],
    addressLine: "900 Market St, Springfield, IL",
    hasPortalAccount: false,
    bookingsCount: 6,
    ltvCents: 90000,
    lastBookingAt: at(-5, 18),
    createdAt: at(-150, 10),
  },
  {
    id: "c7",
    fullName: "Grace Okafor",
    email: "grace.okafor@example.com",
    phone: "+1 (555) 010-0034",
    tags: ["new"],
    addressLine: "42 Sunset Blvd, Springfield, IL",
    hasPortalAccount: false,
    bookingsCount: 1,
    ltvCents: 12000,
    lastBookingAt: at(-1, 14),
    createdAt: at(-6, 10),
  },
];

// ---------- employees ----------
const EMPLOYEES: EmployeeView[] = [
  {
    id: "e1",
    name: "Maria Lopez",
    title: "Senior Cleaner",
    email: "maria@cleansweep.demo",
    color: "#2e86c1",
    active: true,
    invited: false,
    hourlyRateCents: 2200,
    commissionPct: 5,
    jobsThisMonth: 22,
    utilization: 0.78,
    earningsMonthCents: 387200,
    serviceCount: 4,
  },
  {
    id: "e2",
    name: "James Carter",
    title: "Cleaner",
    email: "james@cleansweep.demo",
    color: "#f4b942",
    active: true,
    invited: false,
    hourlyRateCents: 1900,
    commissionPct: null,
    jobsThisMonth: 17,
    utilization: 0.64,
    earningsMonthCents: 258400,
    serviceCount: 4,
  },
  {
    id: "e3",
    name: "Sarah Johnson",
    title: "Owner",
    email: MOCK.ownerEmail,
    color: "#3fb68b",
    active: true,
    invited: false,
    hourlyRateCents: null,
    commissionPct: null,
    jobsThisMonth: 8,
    utilization: 0.31,
    earningsMonthCents: 0,
    serviceCount: 4,
  },
  {
    id: "e4",
    name: "Tom Nguyen",
    title: "Cleaner",
    email: "tom.nguyen@example.com",
    color: "#8e6bbf",
    active: false,
    invited: true,
    hourlyRateCents: 1900,
    commissionPct: null,
    jobsThisMonth: 0,
    utilization: 0,
    earningsMonthCents: 0,
    serviceCount: 0,
  },
];

// ---------- bookings ----------
type Raw = [
  cust: string,
  svc: string,
  emp: string,
  status: BookingStatus,
  day: number,
  hh: number,
  mins: number,
  price: number,
  deposit: number,
  source: string,
  notes: string | null,
];

const RAW_BOOKINGS: Raw[] = [
  ["c2", "s1", "e2", "confirmed", 1, 10, 120, 12000, 0, "widget", null],
  ["c1", "s1", "e1", "confirmed", 2, 9, 120, 12000, 0, "portal", "Recurring bi-weekly clean."],
  ["c3", "s4", "e1", "confirmed", 2, 13, 90, 15000, 0, "admin", null],
  ["c1", "s2", "e2", "confirmed", 3, 9, 240, 24000, 5000, "widget", null],
  ["c2", "s2", "e1", "pending", 5, 10, 240, 24000, 5000, "widget", "Gate code 4482."],
  ["c3", "s1", "e2", "pending", 6, 13, 120, 12000, 0, "widget", null],
  ["c4", "s3", "e1", "pending", 9, 9, 300, 32000, 5000, "portal", "Keys at lockbox."],
  ["c1", "s1", "e1", "completed", -14, 9, 120, 12000, 0, "widget", "Please use the side door."],
  ["c2", "s3", "e2", "completed", -8, 9, 300, 32000, 5000, "admin", null],
  ["c4", "s2", "e1", "completed", -10, 10, 240, 24000, 5000, "widget", null],
  ["c3", "s1", "e2", "completed", -12, 10, 120, 12000, 0, "widget", "First-time customer."],
  ["c1", "s1", "e1", "completed", -7, 9, 120, 12000, 0, "portal", null],
  ["c5", "s4", "e1", "completed", -3, 12, 90, 15000, 0, "admin", null],
  ["c6", "s4", "e2", "completed", -5, 18, 90, 15000, 0, "widget", "After hours."],
  ["c4", "s1", "e1", "completed", -18, 9, 120, 12000, 0, "portal", null],
  ["c6", "s4", "e2", "completed", -20, 18, 90, 15000, 0, "widget", null],
  ["c7", "s1", "e2", "completed", -1, 14, 120, 12000, 0, "widget", null],
  ["c3", "s1", "e2", "no_show", -5, 11, 120, 12000, 0, "widget", null],
  ["c2", "s4", "e2", "cancelled", -2, 14, 90, 15000, 0, "portal", null],
  ["c5", "s2", "e1", "rescheduled", -4, 10, 240, 24000, 5000, "widget", null],
];

function buildBookings(): BookingView[] {
  const custName = (id: string) => CUSTOMERS.find((c) => c.id === id)?.fullName ?? "Customer";
  const svc = (id: string) => SERVICES.find((s) => s.id === id);
  const emp = (id: string) => EMP.find((e) => e.id === id);
  return RAW_BOOKINGS.map((r, i) => {
    const [cust, svcId, empId, status, day, hh, mins, price, deposit, source, notes] = r;
    const startsAt = at(day, hh, 0);
    const s = svc(svcId);
    const e = emp(empId);
    const c = CUSTOMERS.find((x) => x.id === cust);
    return {
      id: `b${i + 1}`,
      reference: `BK-${String(2481 + i)}`,
      customerName: custName(cust),
      serviceName: s?.name ?? "Service",
      employeeName: e?.name ?? "Unassigned",
      employeeColor: e?.color ?? "#7c8fa3",
      status,
      startsAt,
      endsAt: plus(startsAt, mins),
      priceCents: price,
      depositCents: deposit,
      addressLine: c?.addressLine ?? null,
      notes,
      source,
      // Demo: the first booking is a biweekly recurring series.
      recurrenceRule: i === 0 ? "biweekly" : null,
      recurrenceGroupId: i === 0 ? "grp-demo-1" : null,
    };
  });
}

const BOOKINGS = buildBookings();

// ---------- coupons ----------
const COUPONS: CouponView[] = [
  {
    id: "cp1",
    code: "WELCOME10",
    pctOff: 10,
    amountOffCents: null,
    active: true,
    expiresAt: at(90, 0),
    maxRedemptions: 100,
    redemptions: 23,
  },
  {
    id: "cp2",
    code: "SPRING25",
    pctOff: null,
    amountOffCents: 2500,
    active: false,
    expiresAt: null,
    maxRedemptions: null,
    redemptions: 41,
  },
];

// ================= section getters =================

export function getMockServices(): ServiceView[] {
  return SERVICES;
}
export function getMockCustomers(): CustomerView[] {
  return CUSTOMERS;
}
export function getMockTeam(): EmployeeView[] {
  return EMPLOYEES;
}

export function getMockBookings(): BookingsData {
  const counts = { all: BOOKINGS.length } as BookingsData["counts"];
  (["pending", "confirmed", "completed", "cancelled", "rescheduled", "no_show"] as BookingStatus[]).forEach(
    (st) => {
      counts[st] = BOOKINGS.filter((b) => b.status === st).length;
    },
  );
  const order = { pending: 0, confirmed: 1, rescheduled: 2, completed: 3, no_show: 4, cancelled: 5 };
  const bookings = [...BOOKINGS].sort(
    (a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime(),
  ).sort((a, b) => order[a.status] - order[b.status]);
  return { bookings, counts };
}

export function getMockCalendar(): CalendarData {
  const events: CalendarEvent[] = BOOKINGS.filter(
    (b) => b.status !== "cancelled" && b.status !== "rescheduled",
  ).map((b) => ({
    id: b.id,
    title: b.serviceName,
    customerName: b.customerName,
    serviceName: b.serviceName,
    employeeId: EMP.find((e) => e.name === b.employeeName)?.id ?? "e1",
    employeeName: b.employeeName,
    employeeColor: b.employeeColor,
    status: b.status,
    startsAt: b.startsAt,
    endsAt: b.endsAt,
    recurrenceRule: b.recurrenceRule,
  }));
  return {
    events,
    employees: EMP.map((e) => ({ id: e.id, name: e.name, color: e.color })),
  };
}

export function getMockInvoices(): InvoicesData {
  const invoices: InvoiceView[] = [
    {
      id: "i1",
      number: "INV-2026-0001",
      customerName: "Dana Whitfield",
      status: "paid",
      totalCents: 17000,
      paidCents: 17000,
      issuedAt: at(-7, 10),
      dueAt: at(0, 10),
      lineItems: [
        { description: "Standard Home Cleaning", qty: 1, amountCents: 12000 },
        { description: "Inside fridge", qty: 1, amountCents: 2500 },
        { description: "Inside oven", qty: 1, amountCents: 2500 },
      ],
    },
    {
      id: "i2",
      number: "INV-2026-0002",
      customerName: "Robert Kim",
      status: "partially_paid",
      totalCents: 32000,
      paidCents: 5000,
      issuedAt: at(-2, 10),
      dueAt: at(7, 10),
      lineItems: [{ description: "Move-In / Move-Out", qty: 1, amountCents: 32000 }],
    },
    {
      id: "i3",
      number: "INV-2026-0003",
      customerName: "The Corner Office LLC",
      status: "overdue",
      totalCents: 15000,
      paidCents: 0,
      issuedAt: at(-40, 10),
      dueAt: at(-12, 10),
      lineItems: [{ description: "Office Cleaning", qty: 1, amountCents: 15000 }],
    },
    {
      id: "i4",
      number: "INV-2026-0004",
      customerName: "Marcus Bell",
      status: "sent",
      totalCents: 24000,
      paidCents: 0,
      issuedAt: at(-1, 10),
      dueAt: at(13, 10),
      lineItems: [{ description: "Deep Cleaning", qty: 1, amountCents: 24000 }],
    },
    {
      id: "i5",
      number: "INV-2026-0005",
      customerName: "Elena Ruiz",
      status: "draft",
      totalCents: 12000,
      paidCents: 0,
      issuedAt: at(0, 9),
      dueAt: null,
      lineItems: [{ description: "Standard Home Cleaning", qty: 1, amountCents: 12000 }],
    },
  ];
  const outstandingCents = invoices.reduce((s, i) => s + (i.totalCents - i.paidCents), 0);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const paidThisMonthCents = invoices
    .filter((i) => new Date(i.issuedAt).getTime() >= monthStart)
    .reduce((s, i) => s + i.paidCents, 0);
  const overdueCount = invoices.filter((i) => i.status === "overdue").length;
  return { invoices, outstandingCents, paidThisMonthCents, overdueCount };
}

export function getMockPayments(): PaymentsData {
  const payments: PaymentView[] = [
    { id: "p1", customerName: "Dana Whitfield", kind: "payment", status: "succeeded", amountCents: 17000, invoiceNumber: "INV-2026-0001", at: at(0, 7, 15) },
    { id: "p2", customerName: "Robert Kim", kind: "deposit", status: "succeeded", amountCents: 5000, invoiceNumber: "INV-2026-0002", at: at(-1, 12) },
    { id: "p3", customerName: "Priya Nair", kind: "deposit", status: "succeeded", amountCents: 5000, invoiceNumber: null, at: at(-2, 9) },
    { id: "p4", customerName: "Marcus Bell", kind: "payment", status: "processing", amountCents: 24000, invoiceNumber: "INV-2026-0004", at: at(-1, 16) },
    { id: "p5", customerName: "Elena Ruiz", kind: "refund", status: "refunded", amountCents: 15000, invoiceNumber: null, at: at(-4, 11) },
    { id: "p6", customerName: "The Corner Office LLC", kind: "payment", status: "failed", amountCents: 15000, invoiceNumber: "INV-2026-0003", at: at(-5, 18) },
  ];
  const gross = payments.filter((p) => p.status === "succeeded" && p.kind !== "refund").reduce((s, p) => s + p.amountCents, 0);
  const refunded = payments.filter((p) => p.kind === "refund").reduce((s, p) => s + p.amountCents, 0);
  const deposits = payments.filter((p) => p.kind === "deposit" && p.status === "succeeded").reduce((s, p) => s + p.amountCents, 0);
  return {
    payments,
    grossCents: gross,
    refundedCents: refunded,
    depositsHeldCents: deposits,
    subscription: {
      plan: "professional",
      status: "trialing",
      priceMonthly: 59,
      trialDaysLeft: 7,
      paymentsEnabled: false,
    },
  };
}

export function getMockReports(): ReportsData {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"];
  const rev = [812000, 905000, 1034000, 988000, 1156000, 1240000, 1318000, 1024000];
  const bkg = [38, 41, 47, 44, 52, 56, 61, 42];
  const completed = BOOKINGS.filter((b) => b.status === "completed");
  const revenueCents = completed.reduce((s, b) => s + b.priceCents, 0);
  return {
    revenueBars: months.map((m, i) => ({ label: m, cents: rev[i] })),
    bookingsBars: months.map((m, i) => ({ label: m, cents: bkg[i] })),
    servicePopularity: SERVICES.map((s) => ({
      name: s.name,
      count: s.bookingCount,
      revenueCents: s.bookingCount * s.priceCents,
    })).sort((a, b) => b.count - a.count),
    employeePerformance: EMPLOYEES.filter((e) => e.active).map((e) => ({
      name: e.name,
      color: e.color,
      jobs: e.jobsThisMonth,
      revenueCents: e.jobsThisMonth * 14000,
      utilization: e.utilization,
    })),
    retention: { returning: 5, newCustomers: 2, repeatRate: 0.71 },
    totals: {
      revenueCents,
      bookings: BOOKINGS.length,
      avgTicketCents: Math.round(revenueCents / Math.max(1, completed.length)),
      noShowRate: BOOKINGS.filter((b) => b.status === "no_show").length / BOOKINGS.length,
    },
  };
}

export function getMockCoupons(): CouponView[] {
  return COUPONS;
}

export function getMockWidget(appUrl: string): WidgetData {
  return {
    publicKey: MOCK.publicKey,
    primaryColor: "#2e86c1",
    radius: "12px",
    layout: "vertical",
    active: true,
    allowedDomains: ["cleansweep.com", "www.cleansweep.com"],
    customFields: [
      { key: "pets", label: "Any pets we should know about?", type: "text", required: false },
    ],
    appUrl,
  };
}
