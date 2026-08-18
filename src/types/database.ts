/**
 * Hand-written Supabase database types for Diamond Booking.
 * Mirrors supabase/migrations/0001-0003. If you change the schema,
 * update this file (or replace it with `supabase gen types typescript`).
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "super_admin" | "business_owner" | "employee" | "customer";

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "rescheduled"
  | "no_show";

export type InvoiceStatus =
  | "draft"
  | "sent"
  | "paid"
  | "partially_paid"
  | "overdue"
  | "refunded"
  | "void";

export type PaymentStatus =
  | "requires_payment"
  | "processing"
  | "succeeded"
  | "failed"
  | "refunded";

export type PlanTier = "starter" | "professional" | "elite";

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "suspended";

export type RequestStatus = "pending" | "approved" | "denied";

export interface Database {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string;
          slug: string;
          name: string;
          industry: string | null;
          email: string | null;
          phone: string | null;
          address: Json | null;
          timezone: string;
          branding: Json;
          settings: Json;
          plan: PlanTier;
          subscription_status: SubscriptionStatus;
          trial_ends_at: string | null;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          suspended: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          industry?: string | null;
          email?: string | null;
          phone?: string | null;
          address?: Json | null;
          timezone?: string;
          branding?: Json;
          settings?: Json;
          plan?: PlanTier;
          subscription_status?: SubscriptionStatus;
          trial_ends_at?: string | null;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          suspended?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          industry?: string | null;
          email?: string | null;
          phone?: string | null;
          address?: Json | null;
          timezone?: string;
          branding?: Json;
          settings?: Json;
          plan?: PlanTier;
          subscription_status?: SubscriptionStatus;
          trial_ends_at?: string | null;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          suspended?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          tenant_id: string | null;
          role: UserRole;
          full_name: string;
          email: string;
          phone: string | null;
          avatar_url: string | null;
          notification_prefs: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          tenant_id?: string | null;
          role: UserRole;
          full_name: string;
          email: string;
          phone?: string | null;
          avatar_url?: string | null;
          notification_prefs?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string | null;
          role?: UserRole;
          full_name?: string;
          email?: string;
          phone?: string | null;
          avatar_url?: string | null;
          notification_prefs?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      services: {
        Row: {
          id: string;
          tenant_id: string;
          name: string;
          description: string | null;
          category: string | null;
          duration_minutes: number;
          price_cents: number;
          deposit_cents: number;
          buffer_before_minutes: number;
          buffer_after_minutes: number;
          active: boolean;
          sort: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          name: string;
          description?: string | null;
          category?: string | null;
          duration_minutes: number;
          price_cents: number;
          deposit_cents?: number;
          buffer_before_minutes?: number;
          buffer_after_minutes?: number;
          active?: boolean;
          sort?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          name?: string;
          description?: string | null;
          category?: string | null;
          duration_minutes?: number;
          price_cents?: number;
          deposit_cents?: number;
          buffer_before_minutes?: number;
          buffer_after_minutes?: number;
          active?: boolean;
          sort?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      service_addons: {
        Row: {
          id: string;
          tenant_id: string;
          service_id: string;
          name: string;
          price_cents: number;
          duration_minutes: number;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          service_id: string;
          name: string;
          price_cents?: number;
          duration_minutes?: number;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          service_id?: string;
          name?: string;
          price_cents?: number;
          duration_minutes?: number;
        };
        Relationships: [];
      };
      employees: {
        Row: {
          id: string;
          tenant_id: string;
          profile_id: string | null;
          invite_email: string | null;
          /** Pre-invite display name; profiles.full_name wins once accepted (0004). */
          display_name: string | null;
          title: string | null;
          color: string | null;
          hourly_rate_cents: number | null;
          commission_pct: number | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          profile_id?: string | null;
          invite_email?: string | null;
          display_name?: string | null;
          title?: string | null;
          color?: string | null;
          hourly_rate_cents?: number | null;
          commission_pct?: number | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          profile_id?: string | null;
          invite_email?: string | null;
          display_name?: string | null;
          title?: string | null;
          color?: string | null;
          hourly_rate_cents?: number | null;
          commission_pct?: number | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      employee_services: {
        Row: {
          employee_id: string;
          service_id: string;
        };
        Insert: {
          employee_id: string;
          service_id: string;
        };
        Update: {
          employee_id?: string;
          service_id?: string;
        };
        Relationships: [];
      };
      availability: {
        Row: {
          id: string;
          tenant_id: string;
          employee_id: string;
          weekday: number;
          start_time: string;
          end_time: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          employee_id: string;
          weekday: number;
          start_time: string;
          end_time: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          employee_id?: string;
          weekday?: number;
          start_time?: string;
          end_time?: string;
        };
        Relationships: [];
      };
      business_hours: {
        Row: {
          tenant_id: string;
          weekday: number;
          open_time: string | null;
          close_time: string | null;
          closed: boolean;
        };
        Insert: {
          tenant_id: string;
          weekday: number;
          open_time?: string | null;
          close_time?: string | null;
          closed?: boolean;
        };
        Update: {
          tenant_id?: string;
          weekday?: number;
          open_time?: string | null;
          close_time?: string | null;
          closed?: boolean;
        };
        Relationships: [];
      };
      time_off: {
        Row: {
          id: string;
          tenant_id: string;
          employee_id: string | null;
          starts_at: string;
          ends_at: string;
          reason: string | null;
          status: RequestStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          employee_id?: string | null;
          starts_at: string;
          ends_at: string;
          reason?: string | null;
          status?: RequestStatus;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          employee_id?: string | null;
          starts_at?: string;
          ends_at?: string;
          reason?: string | null;
          status?: RequestStatus;
          created_at?: string;
        };
        Relationships: [];
      };
      customers: {
        Row: {
          id: string;
          tenant_id: string;
          profile_id: string | null;
          full_name: string;
          email: string;
          phone: string | null;
          addresses: Json;
          notes: string | null;
          tags: string[];
          stripe_customer_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          profile_id?: string | null;
          full_name: string;
          email: string;
          phone?: string | null;
          addresses?: Json;
          notes?: string | null;
          tags?: string[];
          stripe_customer_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          profile_id?: string | null;
          full_name?: string;
          email?: string;
          phone?: string | null;
          addresses?: Json;
          notes?: string | null;
          tags?: string[];
          stripe_customer_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      bookings: {
        Row: {
          id: string;
          tenant_id: string;
          customer_id: string;
          service_id: string;
          employee_id: string | null;
          status: BookingStatus;
          starts_at: string;
          ends_at: string;
          price_cents: number;
          deposit_cents: number;
          address: Json | null;
          customer_notes: string | null;
          internal_notes: string | null;
          source: string;
          cancellation_reason: string | null;
          recurrence_group_id: string | null;
          recurrence_rule: string | null;
          recurrence_until: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          customer_id: string;
          service_id: string;
          employee_id?: string | null;
          status?: BookingStatus;
          starts_at: string;
          ends_at: string;
          price_cents: number;
          deposit_cents?: number;
          address?: Json | null;
          customer_notes?: string | null;
          internal_notes?: string | null;
          source?: string;
          cancellation_reason?: string | null;
          recurrence_group_id?: string | null;
          recurrence_rule?: string | null;
          recurrence_until?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          customer_id?: string;
          service_id?: string;
          employee_id?: string | null;
          status?: BookingStatus;
          starts_at?: string;
          ends_at?: string;
          price_cents?: number;
          deposit_cents?: number;
          address?: Json | null;
          customer_notes?: string | null;
          internal_notes?: string | null;
          source?: string;
          cancellation_reason?: string | null;
          recurrence_group_id?: string | null;
          recurrence_rule?: string | null;
          recurrence_until?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      booking_addons: {
        Row: {
          booking_id: string;
          addon_id: string;
          price_cents: number;
        };
        Insert: {
          booking_id: string;
          addon_id: string;
          price_cents: number;
        };
        Update: {
          booking_id?: string;
          addon_id?: string;
          price_cents?: number;
        };
        Relationships: [];
      };
      invoices: {
        Row: {
          id: string;
          tenant_id: string;
          customer_id: string;
          booking_id: string | null;
          number: string;
          status: InvoiceStatus;
          line_items: Json;
          subtotal_cents: number;
          tax_cents: number;
          total_cents: number;
          paid_cents: number;
          due_at: string | null;
          pdf_path: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          customer_id: string;
          booking_id?: string | null;
          /** Omit to let the DB trigger assign INV-YYYY-NNNN. */
          number?: string;
          status?: InvoiceStatus;
          line_items?: Json;
          subtotal_cents?: number;
          tax_cents?: number;
          total_cents?: number;
          paid_cents?: number;
          due_at?: string | null;
          pdf_path?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          customer_id?: string;
          booking_id?: string | null;
          number?: string;
          status?: InvoiceStatus;
          line_items?: Json;
          subtotal_cents?: number;
          tax_cents?: number;
          total_cents?: number;
          paid_cents?: number;
          due_at?: string | null;
          pdf_path?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      invoice_counters: {
        Row: {
          tenant_id: string;
          year: number;
          counter: number;
        };
        Insert: {
          tenant_id: string;
          year: number;
          counter?: number;
        };
        Update: {
          tenant_id?: string;
          year?: number;
          counter?: number;
        };
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          tenant_id: string;
          invoice_id: string | null;
          booking_id: string | null;
          customer_id: string | null;
          stripe_payment_intent_id: string | null;
          amount_cents: number;
          status: PaymentStatus;
          kind: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          invoice_id?: string | null;
          booking_id?: string | null;
          customer_id?: string | null;
          stripe_payment_intent_id?: string | null;
          amount_cents: number;
          status: PaymentStatus;
          kind?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          invoice_id?: string | null;
          booking_id?: string | null;
          customer_id?: string | null;
          stripe_payment_intent_id?: string | null;
          amount_cents?: number;
          status?: PaymentStatus;
          kind?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      coupons: {
        Row: {
          id: string;
          tenant_id: string;
          code: string;
          pct_off: number | null;
          amount_off_cents: number | null;
          active: boolean;
          expires_at: string | null;
          max_redemptions: number | null;
          redemptions: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          code: string;
          pct_off?: number | null;
          amount_off_cents?: number | null;
          active?: boolean;
          expires_at?: string | null;
          max_redemptions?: number | null;
          redemptions?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          code?: string;
          pct_off?: number | null;
          amount_off_cents?: number | null;
          active?: boolean;
          expires_at?: string | null;
          max_redemptions?: number | null;
          redemptions?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      widget_configs: {
        Row: {
          id: string;
          tenant_id: string;
          public_key: string;
          theme: Json;
          custom_fields: Json;
          allowed_domains: string[];
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          public_key?: string;
          theme?: Json;
          custom_fields?: Json;
          allowed_domains?: string[];
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          public_key?: string;
          theme?: Json;
          custom_fields?: Json;
          allowed_domains?: string[];
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      employee_requests: {
        Row: {
          id: string;
          tenant_id: string;
          employee_id: string;
          kind: string;
          body: string;
          status: RequestStatus;
          response: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          employee_id: string;
          kind: string;
          body: string;
          status?: RequestStatus;
          response?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          employee_id?: string;
          kind?: string;
          body?: string;
          status?: RequestStatus;
          response?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      plan_limits: {
        Row: {
          plan: PlanTier;
          max_employees: number | null;
          max_services: number | null;
          features: Json;
        };
        Insert: {
          plan: PlanTier;
          max_employees?: number | null;
          max_services?: number | null;
          features?: Json;
        };
        Update: {
          plan?: PlanTier;
          max_employees?: number | null;
          max_services?: number | null;
          features?: Json;
        };
        Relationships: [];
      };
      feature_flags: {
        Row: {
          key: string;
          enabled: boolean;
          description: string | null;
        };
        Insert: {
          key: string;
          enabled?: boolean;
          description?: string | null;
        };
        Update: {
          key?: string;
          enabled?: boolean;
          description?: string | null;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: number;
          tenant_id: string | null;
          actor_id: string | null;
          action: string;
          entity: string | null;
          entity_id: string | null;
          meta: Json;
          created_at: string;
        };
        Insert: {
          tenant_id?: string | null;
          actor_id?: string | null;
          action: string;
          entity?: string | null;
          entity_id?: string | null;
          meta?: Json;
          created_at?: string;
        };
        Update: {
          tenant_id?: string | null;
          actor_id?: string | null;
          action?: string;
          entity?: string | null;
          entity_id?: string | null;
          meta?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      employee_directory: {
        Row: {
          id: string;
          tenant_id: string;
          profile_id: string | null;
          full_name: string | null;
          title: string | null;
          color: string | null;
          active: boolean;
        };
        Relationships: [];
      };
    };
    Functions: {
      auth_role: {
        Args: Record<string, never>;
        Returns: UserRole | null;
      };
      auth_tenant: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      auth_employee_id: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      auth_customer_id: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      get_widget_config: {
        Args: { p_public_key: string };
        Returns: Json;
      };
      get_available_slots: {
        Args: {
          p_public_key: string;
          p_service_id: string;
          p_date: string; // 'YYYY-MM-DD'
        };
        Returns: {
          slot_start: string;
          slot_end: string;
          employee_id: string;
        }[];
      };
      create_widget_booking: {
        Args: {
          p_public_key: string;
          p_service_id: string;
          p_starts_at: string; // ISO timestamptz
          p_customer_name: string;
          p_customer_email: string;
          p_customer_phone?: string | null;
          p_employee_id?: string | null;
          p_address?: Json | null;
          p_notes?: string | null;
          p_addon_ids?: string[];
        };
        Returns: Json;
      };
    };
    Enums: {
      user_role: UserRole;
      booking_status: BookingStatus;
      invoice_status: InvoiceStatus;
      payment_status: PaymentStatus;
      plan_tier: PlanTier;
      subscription_status: SubscriptionStatus;
      request_status: RequestStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}

// ---------- convenience aliases ----------
type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];
export type Views<T extends keyof PublicSchema["Views"]> =
  PublicSchema["Views"][T]["Row"];
export type Enums<T extends keyof PublicSchema["Enums"]> =
  PublicSchema["Enums"][T];
