/**
 * App-level domain types for Diamond Booking.
 * Re-exports the DB enums under friendlier names and adds types that
 * only exist at the application layer (widget payloads, plan gates, ...).
 */

import type { Json, Tables } from "./database";

export type {
  UserRole as Role,
  BookingStatus,
  InvoiceStatus,
  PaymentStatus,
  PlanTier,
  SubscriptionStatus,
  RequestStatus,
} from "./database";

export type {
  Json,
  Tables,
  TablesInsert,
  TablesUpdate,
  Views,
  Enums,
  Database,
} from "./database";

// Row aliases used all over the app layer
export type Tenant = Tables<"tenants">;
export type Profile = Tables<"profiles">;
export type Service = Tables<"services">;
export type ServiceAddon = Tables<"service_addons">;
export type Employee = Tables<"employees">;
export type Availability = Tables<"availability">;
export type BusinessHours = Tables<"business_hours">;
export type TimeOff = Tables<"time_off">;
export type Customer = Tables<"customers">;
export type Booking = Tables<"bookings">;
export type BookingAddon = Tables<"booking_addons">;
export type Invoice = Tables<"invoices">;
export type Payment = Tables<"payments">;
export type Coupon = Tables<"coupons">;
export type WidgetConfig = Tables<"widget_configs">;
export type EmployeeRequest = Tables<"employee_requests">;
export type PlanLimits = Tables<"plan_limits">;
export type FeatureFlag = Tables<"feature_flags">;
export type AuditLog = Tables<"audit_logs">;

/** Where a booking was created. */
export type BookingSource = "widget" | "portal" | "admin";

/** payments.kind values. */
export type PaymentKind = "payment" | "deposit" | "refund";

/** One open slot returned by the get_available_slots RPC. */
export interface AvailableSlot {
  slot_start: string;
  slot_end: string;
  employee_id: string;
}

/** Result of the create_widget_booking RPC. */
export interface WidgetBookingResult {
  booking_id: string;
  status: "pending" | "confirmed";
  employee_id: string;
  starts_at: string;
  ends_at: string;
  price_cents: number;
  deposit_cents: number;
}

/** Shape of the get_widget_config RPC payload. */
export interface WidgetConfigPayload {
  tenant: {
    slug: string;
    name: string;
    industry: string | null;
    timezone: string;
    branding: Json;
  };
  theme: Json;
  custom_fields: Json;
  business_hours: Array<{
    weekday: number;
    open_time: string | null;
    close_time: string | null;
    closed: boolean;
  }>;
  services: Array<{
    id: string;
    name: string;
    description: string | null;
    category: string | null;
    duration_minutes: number;
    price_cents: number;
    deposit_cents: number;
    addons: Array<{
      id: string;
      name: string;
      price_cents: number;
      duration_minutes: number;
    }>;
  }>;
}
