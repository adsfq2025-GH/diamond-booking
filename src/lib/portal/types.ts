import type { BookingStatus, InvoiceStatus } from "@/types/database";

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
