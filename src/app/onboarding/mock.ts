import {
  DEFAULT_ACCENT_COLOR,
  DEFAULT_PRIMARY_COLOR,
  defaultHours,
  type WizardData,
} from "@/lib/onboarding/types";

/**
 * PLACEHOLDER-ENV MOCK TENANT. Used ONLY when supabaseEnvConfigured() is
 * false (no real Supabase keys in .env.local) so the wizard is visually
 * testable without a backend. With real keys this module is never rendered.
 */
export const MOCK_PUBLIC_KEY = "demo000000000000000000ff";
export const MOCK_OWNER_NAME = "Sarah Johnson";
export const MOCK_BUSINESS_NAME = "Clean Sweep Services";

export function mockWizardData(): WizardData {
  return {
    business: {
      name: MOCK_BUSINESS_NAME,
      industry: "Cleaning",
      phone: "",
      email: "sarah@cleansweep.com",
      street: "",
      city: "",
      state: "",
      zip: "",
      timezone: "America/New_York",
    },
    services: [],
    team: {
      ownerBookable: true,
      ownerColor: "#2e86c1",
      members: [],
    },
    hours: {
      days: defaultHours(),
      default_buffer_minutes: 15,
    },
    branding: {
      logo_url: null,
      primary_color: DEFAULT_PRIMARY_COLOR,
      accent_color: DEFAULT_ACCENT_COLOR,
      photos: [],
    },
    finish: {
      auto_confirm: false,
      cancellation_policy:
        "Free cancellation up to 24 hours before your appointment. Later cancellations may forfeit the deposit.",
      cancellation_window_hours: 24,
      deposit_required: false,
      payments_enabled: false,
    },
  };
}
