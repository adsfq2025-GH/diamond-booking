export interface StripeConnectStatus {
  configured: boolean;
  connected: boolean;
  accountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  onboardingComplete: boolean;
}

export interface GoogleCalendarStatus {
  configured: boolean;
  connected: boolean;
  calendarEmail: string | null;
  calendarId: string | null;
  syncEnabled: boolean;
}

export interface SmsReminderStatus {
  configured: boolean;
  enabled: boolean;
  remind24h: boolean;
  remind2h: boolean;
}
