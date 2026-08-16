import "server-only";
import { stripeConfigured } from "./stripe";
import { emailConfigured } from "./email";
import { smsConfigured } from "./sms";
import { googleCalendarConfigured } from "./google-calendar";

/** Which integrations have their env vars set. For the settings UI. */
export interface IntegrationStatus {
  stripe: boolean;
  resend: boolean;
  twilio: boolean;
  googleCalendar: boolean;
}

export function integrationStatus(): IntegrationStatus {
  return {
    stripe: stripeConfigured(),
    resend: emailConfigured(),
    twilio: smsConfigured(),
    googleCalendar: googleCalendarConfigured(),
  };
}
