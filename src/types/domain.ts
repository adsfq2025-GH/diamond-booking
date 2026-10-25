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
  /**
   * Null once the slot list has been collapsed for display: the RPC returns a
   * row per qualified employee, and the booking RPC re-picks a free one at
   * insert time so a single visible choice keeps the slot's full capacity.
   */
  employee_id: string | null;
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
  /** Coupon discount applied after creation, if any. */
  discount_cents?: number;
  /** What the price was calculated on: flat | hourly | square_foot | custom. */
  pricing_unit?: string;
  /** Units charged for — an hourly service bills at least its minimum (B06). */
  pricing_quantity?: number;
  /**
   * Whether the confirmation email was actually accepted by the provider.
   * The confirmation screen used to decide this from whether a sender was
   * configured, so a failed send still told the customer to check their inbox.
   * undefined means "no attempt was made".
   */
  confirmation_sent?: boolean;
  deposit_client_secret?: string | null;
  deposit_payment_intent_id?: string | null;
  /**
   * For a recurring request: what was actually reserved. Occurrences whose
   * time was already taken are skipped, and the customer is told which —
   * they used to be dropped silently.
   */
  recurrence?: {
    reserved: number;
    skipped: string[];
    /** The same dates with the reason each was refused, for an honest message. */
    skippedReasons?: Array<{ startsAt: string; reason: string }>;
    incomplete: boolean;
  };
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
  /** Whether this business offers repeat bookings (re-checked server-side). */
  recurring_enabled?: boolean;
  services: Array<{
    id: string;
    name: string;
    description: string | null;
    category: string | null;
    duration_minutes: number;
    price_cents: number;
    deposit_cents: number;
    /** flat | hourly | square_foot | custom. */
    pricing_unit?: string;
    /** e.g. "sq ft", shown next to a per-unit price. */
    pricing_unit_label?: string | null;
    minimum_hours?: number | null;
    /**
     * True when the price depends on a measurement nobody has yet, so the
     * service cannot be given an honest instant total and goes down the
     * enquiry path instead (B06).
     */
    quote_on_request?: boolean;
    addons: Array<{
      id: string;
      name: string;
      price_cents: number;
      duration_minutes: number;
    }>;
  }>;
}
