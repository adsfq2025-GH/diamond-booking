/**
 * PLACEHOLDER-ENV MOCK DATA for the dashboard. Mirrors supabase/seed.sql
 * (demo tenant "Clean Sweep Services") so every dashboard view is visually
 * testable without a live backend. Dates are computed relative to today so
 * "upcoming" and "recent" always read correctly. With real Supabase keys the
 * live provider in ./data.ts is used instead and this module is never called.
 */

import type { PlanTier } from "@/types/database";
import type {
  ActivityItem,
  OverviewData,
  RevenueBar,
  StatusCount,
  TrendStat,
  UpcomingJob,
  UtilizationRow,
} from "./types";

export const MOCK = {
  tenantName: "Clean Sweep Services",
  ownerName: "Sarah Johnson",
  ownerEmail: "sarah@cleansweep.com",
  plan: "professional" as PlanTier,
  publicKey: "demo000000000000000000ff",
};

/** Employees mirroring the seed (with display-ready names). */
export const MOCK_EMPLOYEES = [
  { id: "e1", name: "Maria Lopez", title: "Senior Cleaner", color: "#2e86c1" },
  { id: "e2", name: "James Carter", title: "Cleaner", color: "#f4b942" },
  { id: "e3", name: "Sarah Johnson", title: "Owner", color: "#3fb68b" },
] as const;

function atTime(dayOffset: number, hh: number, mm = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
}

function hoursLater(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 3600_000).toISOString();
}

const UPCOMING: UpcomingJob[] = [
  {
    id: "u1",
    customerName: "Robert Kim",
    serviceName: "Standard Home Cleaning",
    employeeName: "James Carter",
    employeeColor: "#f4b942",
    startsAt: atTime(1, 10),
    endsAt: atTime(1, 12),
    status: "confirmed",
    priceCents: 12000,
    addressLine: "88 Cedar St, Springfield",
  },
  {
    id: "u2",
    customerName: "Dana Whitfield",
    serviceName: "Standard Home Cleaning",
    employeeName: "Maria Lopez",
    employeeColor: "#2e86c1",
    startsAt: atTime(2, 9),
    endsAt: atTime(2, 11),
    status: "confirmed",
    priceCents: 12000,
    addressLine: "12 Birch Ln, Springfield",
  },
  {
    id: "u3",
    customerName: "Priya Nair",
    serviceName: "Office Cleaning",
    employeeName: "Maria Lopez",
    employeeColor: "#2e86c1",
    startsAt: atTime(2, 13),
    endsAt: hoursLater(atTime(2, 13), 1.5),
    status: "confirmed",
    priceCents: 15000,
    addressLine: null,
  },
  {
    id: "u4",
    customerName: "Dana Whitfield",
    serviceName: "Deep Cleaning",
    employeeName: "James Carter",
    employeeColor: "#f4b942",
    startsAt: atTime(3, 9),
    endsAt: atTime(3, 13),
    status: "confirmed",
    priceCents: 24000,
    addressLine: "12 Birch Ln, Springfield",
  },
  {
    id: "u5",
    customerName: "Robert Kim",
    serviceName: "Deep Cleaning",
    employeeName: "Maria Lopez",
    employeeColor: "#2e86c1",
    startsAt: atTime(5, 10),
    endsAt: atTime(5, 14),
    status: "pending",
    priceCents: 24000,
    addressLine: null,
  },
];

const ACTIVITY: ActivityItem[] = [
  {
    id: "a1",
    kind: "booking_created",
    title: "New booking request",
    detail: "Robert Kim · Deep Cleaning · $240",
    at: atTime(0, 8, 42),
  },
  {
    id: "a2",
    kind: "payment",
    title: "Payment received",
    detail: "Dana Whitfield · $170 · Inv-2026-0001",
    at: atTime(0, 7, 15),
  },
  {
    id: "a3",
    kind: "booking_confirmed",
    title: "Booking confirmed",
    detail: "Priya Nair · Office Cleaning",
    at: atTime(-1, 16, 30),
  },
  {
    id: "a4",
    kind: "cancellation",
    title: "Booking cancelled",
    detail: "Robert Kim · Office Cleaning",
    at: atTime(-2, 14, 5),
  },
  {
    id: "a5",
    kind: "invoice",
    title: "Invoice sent",
    detail: "Robert Kim · $320 · due in 7 days",
    at: atTime(-2, 9, 20),
  },
];

const UTILIZATION: UtilizationRow[] = [
  {
    employeeId: "e1",
    name: "Maria Lopez",
    color: "#2e86c1",
    utilization: 0.78,
    jobsThisWeek: 9,
  },
  {
    employeeId: "e2",
    name: "James Carter",
    color: "#f4b942",
    utilization: 0.64,
    jobsThisWeek: 7,
  },
  {
    employeeId: "e3",
    name: "Sarah Johnson",
    color: "#3fb68b",
    utilization: 0.31,
    jobsThisWeek: 3,
  },
];

const REVENUE_BARS: RevenueBar[] = [
  { label: "Jan", cents: 812000 },
  { label: "Feb", cents: 905000 },
  { label: "Mar", cents: 1034000 },
  { label: "Apr", cents: 988000 },
  { label: "May", cents: 1156000 },
  { label: "Jun", cents: 1240000 },
  { label: "Jul", cents: 1318000 },
  { label: "Aug", cents: 1024000 },
];

const STATUS_COUNTS: StatusCount[] = [
  { status: "confirmed", count: 5 },
  { status: "pending", count: 3 },
  { status: "completed", count: 6 },
  { status: "cancelled", count: 1 },
  { status: "no_show", count: 1 },
];

const STATS: TrendStat[] = [
  {
    label: "Revenue this month",
    value: "$10,240",
    delta: 0.128,
    caption: "vs. $9,080 last month",
  },
  {
    label: "Bookings",
    value: "42",
    delta: 0.09,
    caption: "16 this week",
  },
  {
    label: "Widget conversion",
    value: "34%",
    delta: 0.041,
    caption: "views → bookings",
  },
  {
    label: "Active customers",
    value: "128",
    delta: 0.062,
    caption: "8 new this month",
  },
];

export function getMockOverview(): OverviewData {
  return {
    stats: STATS,
    revenueBars: REVENUE_BARS,
    statusCounts: STATUS_COUNTS,
    upcoming: UPCOMING,
    activity: ACTIVITY,
    utilization: UTILIZATION,
    revenueTotalCents: REVENUE_BARS.reduce((sum, b) => sum + b.cents, 0),
  };
}
