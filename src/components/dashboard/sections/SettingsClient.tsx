"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { PLANS, PLAN_ORDER } from "@/lib/plans";
import { openBillingPortal, startCheckout } from "@/lib/actions/billing";
import {
  saveBookingSettings,
  saveBusinessProfile,
  saveEmailSettings,
  testEmailSettings,
} from "@/lib/actions/settings";
import { COMMON_TIMEZONES } from "@/lib/onboarding/types";
import type { BookingSettingsView, BusinessProfile, EmailSettingsView } from "@/lib/dashboard/data";
import type { PlanTier } from "@/types/database";
import { Icon, type IconName } from "../icons";
import { Panel, PanelHeader } from "../ui";
import { Toggle } from "@/app/onboarding/wizard-ui";
import { inputBase, Label, SelectShell } from "@/components/ui/Field";
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete";
import { ActionButton, GhostBtn } from "./shared";

type TabKey = "profile" | "bookings" | "notifications" | "integrations" | "security" | "team" | "billing";

const TABS: Array<{ key: TabKey; label: string; icon: IconName }> = [
  { key: "profile", label: "Business profile", icon: "settings" },
  { key: "bookings", label: "Booking rules", icon: "bookings" },
  { key: "notifications", label: "Notifications", icon: "bell" },
  { key: "integrations", label: "Integrations", icon: "widget" },
  { key: "security", label: "Security", icon: "user" },
  { key: "team", label: "Permissions", icon: "employees" },
  { key: "billing", label: "Billing & plan", icon: "payments" },
];

export interface IntegrationFlags {
  stripe: boolean;
  resend: boolean;
  twilio: boolean;
  googleCalendar: boolean;
}

export function SettingsClient({
  profile,
  email,
  booking,
  plan,
  integrations,
}: {
  profile: BusinessProfile;
  email: EmailSettingsView;
  booking: BookingSettingsView;
  plan: PlanTier;
  integrations: IntegrationFlags;
}) {
  const [tab, setTab] = useState<TabKey>("profile");

  // Deep-link to a tab via URL hash (#billing, #integrations, …), and react to
  // later hash changes (e.g. the user menu's "Billing & plan" link).
  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash.replace("#", "") as TabKey;
      if (TABS.some((t) => t.key === hash)) setTab(hash);
    };
    window.addEventListener("hashchange", applyHash);
    const raf = requestAnimationFrame(applyHash);
    return () => {
      window.removeEventListener("hashchange", applyHash);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
        {/* Tab rail */}
        <nav className="flex gap-1.5 overflow-x-auto lg:flex-col lg:overflow-visible">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setTab(t.key);
                history.replaceState(null, "", `#${t.key}`);
              }}
              className={cn(
                "inline-flex flex-none items-center gap-2.5 rounded-[10px] px-3.5 py-2.5 text-[0.85rem] font-medium whitespace-nowrap transition-colors lg:w-full",
                tab === t.key
                  ? "bg-blue-50 font-semibold text-blue-700"
                  : "text-ink-muted hover:bg-surface-alt hover:text-ink",
              )}
            >
              <Icon name={t.icon} className={cn("h-[18px] w-[18px]", tab === t.key ? "text-blue-600" : "text-ink-faint")} />
              {t.label}
            </button>
          ))}
        </nav>

        <div>
          {tab === "profile" && <ProfileTab profile={profile} />}
          {tab === "bookings" && <BookingsTab booking={booking} />}
          {tab === "notifications" && <NotificationsTab plan={plan} />}
          {tab === "integrations" && <IntegrationsTab flags={integrations} email={email} />}
          {tab === "security" && <SecurityTab />}
          {tab === "team" && <TeamPermissionsTab />}
          {tab === "billing" && <BillingTab plan={plan} />}
        </div>
      </div>
    </div>
  );
}

function SaveBar() {
  return (
    <div className="mt-6 flex items-center justify-end gap-3 border-t border-line pt-5">
      <GhostBtn>Cancel</GhostBtn>
      <ActionButton icon="check">Save changes</ActionButton>
    </div>
  );
}

function ProfileTab({ profile }: { profile: BusinessProfile }) {
  const [form, setForm] = useState<BusinessProfile>(profile);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; msg: string } | null>(null);
  const set = <K extends keyof BusinessProfile>(k: K, v: BusinessProfile[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  async function save() {
    setBusy(true);
    setNotice(null);
    const res = await saveBusinessProfile(form);
    setNotice(res.ok ? { ok: true, msg: "Saved. Times now display in your timezone." } : { ok: false, msg: res.error });
    setBusy(false);
  }

  const industries = ["Cleaning", "HVAC", "Plumbing", "Landscaping", "Roofing", "Electrical", "Pest control", "Other"];
  const zones = Array.from(new Set([form.timezone, ...COMMON_TIMEZONES]));

  return (
    <Panel>
      <PanelHeader title="Business profile" caption="Appears on your widget, invoices and emails" />
      <div className="px-5 py-5">
        {notice && (
          <div
            className={cn(
              "mb-4 rounded-[12px] border px-4 py-3 text-[0.82rem]",
              notice.ok
                ? "border-success-500/30 bg-success-50 text-success-700"
                : "border-[#e4b7b5] bg-[#fdf6f5] text-[#8c3531]",
            )}
          >
            {notice.msg}
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TField label="Business name" value={form.name} onChange={(v) => set("name", v)} />
          <TSelect label="Industry" value={form.industry} options={industries} onChange={(v) => set("industry", v)} />
          <TField label="Contact email" type="email" value={form.email} onChange={(v) => set("email", v)} />
          <TField label="Phone" value={form.phone} onChange={(v) => set("phone", v)} />
          <div className="sm:col-span-2">
            <Label htmlFor="f-street">Street address</Label>
            <AddressAutocomplete
              id="f-street"
              value={form.street}
              onChange={(v) => set("street", v)}
              onSelect={(p) =>
                setForm((prev) => ({
                  ...prev,
                  street: p.line1 || p.formatted,
                  city: p.city || prev.city,
                  state: p.state || prev.state,
                  zip: p.zip || prev.zip,
                }))
              }
              placeholder="Start typing an address…"
              inputClassName={inputBase}
            />
          </div>
          <TField label="City" value={form.city} onChange={(v) => set("city", v)} />
          <TField label="State" value={form.state} onChange={(v) => set("state", v)} />
          <TField label="ZIP" value={form.zip} onChange={(v) => set("zip", v)} />
          <TSelect label="Timezone" value={form.timezone} options={zones} onChange={(v) => set("timezone", v)} />
        </div>
        <div className="mt-6 flex items-center justify-end gap-3 border-t border-line pt-5">
          <GhostBtn onClick={() => setForm(profile)}>Reset</GhostBtn>
          <ActionButton icon="check" onClick={save}>
            {busy ? "Saving…" : "Save changes"}
          </ActionButton>
        </div>
      </div>
    </Panel>
  );
}

function BookingsTab({ booking }: { booking: BookingSettingsView }) {
  const [recurring, setRecurring] = useState(booking.recurringEnabled);
  const [autoConfirm, setAutoConfirm] = useState(booking.autoConfirm);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; msg: string } | null>(null);

  async function save() {
    setBusy(true);
    setNotice(null);
    const res = await saveBookingSettings({ recurringEnabled: recurring, autoConfirm });
    setNotice(res.ok ? { ok: true, msg: "Booking rules saved." } : { ok: false, msg: res.error });
    setBusy(false);
  }

  return (
    <Panel>
      <PanelHeader title="Booking rules" caption="How bookings are confirmed and repeated" />
      <div className="space-y-5 px-5 py-5">
        {notice && (
          <div
            className={cn(
              "rounded-[12px] border px-4 py-3 text-[0.82rem]",
              notice.ok
                ? "border-success-500/30 bg-success-50 text-success-700"
                : "border-[#e4b7b5] bg-[#fdf6f5] text-[#8c3531]",
            )}
          >
            {notice.msg}
          </div>
        )}
        <Toggle
          id="set-recurring"
          checked={recurring}
          onChange={setRecurring}
          label="Allow recurring bookings"
          description="Let customers set a repeating schedule (weekly, every 2 weeks, monthly…) in the widget. Each occurrence is reserved on your calendar so the time stays blocked and can't be double-booked."
        />
        <div className="border-t border-line pt-5">
          <Toggle
            id="set-autoconfirm"
            checked={autoConfirm}
            onChange={setAutoConfirm}
            label="Auto-confirm new bookings"
            description="Open slots are booked instantly. Turn off to review and approve each request first."
          />
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-line pt-5">
          <ActionButton icon="check" onClick={save}>
            {busy ? "Saving…" : "Save changes"}
          </ActionButton>
        </div>
      </div>
    </Panel>
  );
}

function NotificationsTab({ plan }: { plan: PlanTier }) {
  const sms = PLANS[plan].features.sms_reminders;
  return (
    <Panel>
      <PanelHeader title="Notifications" caption="How you and your customers stay informed" />
      <div className="space-y-5 px-5 py-5">
        <ToggleRow id="n1" label="Booking confirmations" desc="Email the customer when a booking is confirmed." on />
        <ToggleRow id="n2" label="Reminders" desc="Send a reminder email 24 hours before each appointment." on />
        <ToggleRow id="n3" label="New booking alerts" desc="Notify you whenever a new request comes in." on />
        <ToggleRow id="n4" label="Daily summary" desc="A morning digest of the day's jobs." />
        <div className={cn(!sms && "opacity-60")}>
          <ToggleRow
            id="n5"
            label="SMS reminders"
            desc={sms ? "Text customers a reminder before the visit." : "Available on Professional and Elite plans."}
            locked={!sms}
          />
        </div>
        <SaveBar />
      </div>
    </Panel>
  );
}

function IntegrationsTab({
  flags,
  email,
}: {
  flags: IntegrationFlags;
  email: EmailSettingsView;
}) {
  const items = [
    { name: "Stripe", desc: "Accept deposits and card payments.", icon: "payments" as IconName, connected: flags.stripe, comingSoon: false },
    { name: "Twilio", desc: "SMS reminders for appointments.", icon: "bell" as IconName, connected: flags.twilio, comingSoon: false },
    { name: "Google Calendar", desc: "Two-way sync with your team's calendars.", icon: "calendar" as IconName, connected: flags.googleCalendar, comingSoon: true },
  ];
  return (
    <div className="space-y-5">
      <EmailPanel email={email} />
      <Panel>
      <PanelHeader title="Integrations" caption="Connect the tools that power payments and messaging" />
      <ul className="divide-y divide-line">
        {items.map((it) => (
          <li key={it.name} className="flex items-center gap-4 px-5 py-4">
            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-[12px] bg-surface-alt text-ink-muted">
              <Icon name={it.icon} className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-[0.9rem] font-semibold text-ink">{it.name}</p>
                {it.connected && (
                  <span className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-success-50 px-2 py-[1px] text-[0.62rem] font-bold tracking-wide text-success-700 uppercase">
                    <span className="h-1.5 w-1.5 rounded-full bg-success-500" />
                    Connected
                  </span>
                )}
                {it.comingSoon && !it.connected && (
                  <span className="rounded-[var(--radius-pill)] bg-blue-50 px-2 py-[1px] text-[0.62rem] font-bold tracking-wide text-blue-700 uppercase">
                    Soon
                  </span>
                )}
              </div>
              <p className="text-[0.8rem] text-ink-faint">{it.desc}</p>
            </div>
            <GhostBtn>{it.connected ? "Manage" : it.comingSoon ? "Notify me" : "Connect"}</GhostBtn>
          </li>
        ))}
      </ul>
      </Panel>
    </div>
  );
}

function EmailPanel({ email }: { email: EmailSettingsView }) {
  const [provider, setProvider] = useState<EmailSettingsView["provider"]>(email.provider);
  const [form, setForm] = useState({
    host: email.host,
    port: email.port,
    secure: email.secure,
    user: email.user,
    password: "",
    fromName: email.fromName,
    fromEmail: email.fromEmail,
  });
  const [busy, setBusy] = useState<null | "save" | "test">(null);
  const [notice, setNotice] = useState<{ ok: boolean; msg: string } | null>(null);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((p) => ({ ...p, [k]: v }));

  async function save() {
    setBusy("save");
    setNotice(null);
    const res = await saveEmailSettings({ provider, ...form });
    setNotice(res.ok ? { ok: true, msg: "Email settings saved." } : { ok: false, msg: res.error });
    setBusy(null);
  }
  async function test() {
    setBusy("test");
    setNotice(null);
    const res = await testEmailSettings(form.user || form.fromEmail);
    setNotice(
      res.ok
        ? { ok: true, msg: `Test email sent to ${form.user || form.fromEmail}. Check your inbox (and spam).` }
        : { ok: false, msg: res.error ?? "Could not send test email." },
    );
    setBusy(null);
  }

  const connected = email.hasPassword && email.provider === "smtp";

  return (
    <Panel>
      <PanelHeader
        title="Email delivery"
        caption="Send booking confirmations from your own email"
        action={
          connected ? (
            <span className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-success-50 px-2.5 py-[3px] text-[0.66rem] font-bold tracking-wide text-success-700 uppercase">
              <span className="h-1.5 w-1.5 rounded-full bg-success-500" />
              Connected
            </span>
          ) : email.resendAvailable ? (
            <span className="text-[0.72rem] font-semibold text-ink-faint">Using platform email</span>
          ) : (
            <span className="text-[0.72rem] font-semibold text-gold-700">Not sending yet</span>
          )
        }
      />
      <div className="px-5 py-5">
        {notice && (
          <div
            className={cn(
              "mb-4 rounded-[12px] border px-4 py-3 text-[0.82rem]",
              notice.ok
                ? "border-success-500/30 bg-success-50 text-success-700"
                : "border-[#e4b7b5] bg-[#fdf6f5] text-[#8c3531]",
            )}
          >
            {notice.msg}
          </div>
        )}

        <div className="mb-4 flex flex-wrap gap-2">
          {(
            [
              { key: "smtp", label: "My own email (SMTP)" },
              ...(email.resendAvailable ? [{ key: "resend", label: "Platform email" }] : []),
              { key: "off", label: "Off" },
            ] as Array<{ key: EmailSettingsView["provider"]; label: string }>
          ).map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => setProvider(o.key)}
              className={cn(
                "rounded-[var(--radius-pill)] border px-3.5 py-1.5 text-[0.8rem] font-semibold transition-colors",
                provider === o.key
                  ? "border-transparent bg-navy-900 text-white"
                  : "border-line-strong bg-card text-ink-muted hover:border-blue-600 hover:text-blue-600",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>

        {provider === "smtp" && (
          <>
            <div className="mb-4 flex items-start gap-2.5 rounded-[10px] border border-blue-200 bg-blue-50 px-3.5 py-2.5">
              <Icon name="bell" className="mt-0.5 h-4 w-4 flex-none text-blue-600" />
              <p className="text-[0.78rem] leading-[1.55] text-navy-800">
                <span className="font-semibold">Using Gmail?</span> Host{" "}
                <code className="rounded bg-white/60 px-1">smtp.gmail.com</code>, port{" "}
                <code className="rounded bg-white/60 px-1">587</code>, and an{" "}
                <span className="font-semibold">App Password</span> (Google Account → Security → 2-Step
                Verification → App passwords) as the password — not your normal password.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TField label="SMTP host" value={form.host} onChange={(v) => set("host", v)} />
              <TField label="Port" type="number" value={String(form.port)} onChange={(v) => set("port", parseInt(v) || 587)} />
              <TField label="Username" value={form.user} onChange={(v) => set("user", v)} />
              <div>
                <Label htmlFor="smtp-pass">Password / App password</Label>
                <input
                  id="smtp-pass"
                  type="password"
                  className={inputBase}
                  placeholder={email.hasPassword ? "•••••••• (saved — leave blank to keep)" : "App password"}
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                />
              </div>
              <TField label="From name" value={form.fromName} onChange={(v) => set("fromName", v)} />
              <TField label="From email" type="email" value={form.fromEmail} onChange={(v) => set("fromEmail", v)} />
            </div>
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-[0.82rem] text-ink-muted">
              <input type="checkbox" checked={form.secure} onChange={(e) => set("secure", e.target.checked)} className="h-4 w-4 accent-blue-600" />
              Use SSL (port 465). Leave off for port 587 (STARTTLS).
            </label>
          </>
        )}

        {provider === "resend" && (
          <p className="text-[0.83rem] text-ink-muted">
            Emails send through the platform&rsquo;s Resend account. Nothing to configure.
          </p>
        )}
        {provider === "off" && (
          <p className="text-[0.83rem] text-ink-muted">
            Confirmation and reminder emails won&rsquo;t be sent.
          </p>
        )}

        <div className="mt-5 flex items-center justify-end gap-3 border-t border-line pt-5">
          {provider === "smtp" && (
            <GhostBtn onClick={test}>{busy === "test" ? "Sending…" : "Send test email"}</GhostBtn>
          )}
          <ActionButton icon="check" onClick={save}>
            {busy === "save" ? "Saving…" : "Save email settings"}
          </ActionButton>
        </div>
      </div>
    </Panel>
  );
}

function SecurityTab() {
  return (
    <div className="space-y-5">
      <Panel>
        <PanelHeader title="Password" caption="Use a strong, unique password" />
        <div className="px-5 py-5">
          <div className="grid max-w-[420px] grid-cols-1 gap-4">
            <Field label="Current password" type="password" defaultValue="" />
            <Field label="New password" type="password" defaultValue="" />
            <Field label="Confirm new password" type="password" defaultValue="" />
          </div>
          <SaveBar />
        </div>
      </Panel>
      <Panel>
        <PanelHeader title="Two-factor authentication" caption="Add a second layer of protection" />
        <div className="flex items-center justify-between px-5 py-5">
          <p className="max-w-[46ch] text-[0.83rem] text-ink-muted">
            Require a one-time code from an authenticator app when signing in. Strongly recommended for accounts that handle payments.
          </p>
          <GhostBtn>Enable 2FA</GhostBtn>
        </div>
      </Panel>
      <Panel>
        <PanelHeader title="Active sessions" caption="Devices signed in to your account" />
        <div className="flex items-center gap-3 px-5 py-4">
          <Icon name="user" className="h-5 w-5 text-ink-faint" />
          <div className="flex-1">
            <p className="text-[0.85rem] font-medium text-ink">This device · Chrome on Windows</p>
            <p className="text-[0.75rem] text-ink-faint">Springfield, IL · active now</p>
          </div>
          <span className="rounded-[var(--radius-pill)] bg-success-50 px-2.5 py-[3px] text-[0.72rem] font-semibold text-success-700">
            Current
          </span>
        </div>
      </Panel>
    </div>
  );
}

function TeamPermissionsTab() {
  const roles = [
    { role: "Business owner", who: "You", perms: "Full access to everything" },
    { role: "Employee", who: "Maria, James", perms: "Own schedule, assigned jobs, earnings" },
    { role: "Customer", who: "Booking portal", perms: "Their own bookings & invoices" },
  ];
  return (
    <Panel>
      <PanelHeader title="Roles & permissions" caption="What each role can see and do" />
      <ul className="divide-y divide-line">
        {roles.map((r) => (
          <li key={r.role} className="px-5 py-4">
            <div className="flex items-center justify-between">
              <p className="text-[0.9rem] font-semibold text-ink">{r.role}</p>
              <span className="text-[0.78rem] text-ink-faint">{r.who}</span>
            </div>
            <p className="mt-0.5 text-[0.8rem] text-ink-muted">{r.perms}</p>
          </li>
        ))}
      </ul>
      <div className="border-t border-line px-5 py-4">
        <p className="text-[0.8rem] text-ink-faint">
          Fine-grained per-teammate permissions are enforced by row-level security in the database — employees can never see tenant financials.
        </p>
      </div>
    </Panel>
  );
}

function BillingTab({ plan }: { plan: PlanTier }) {
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function checkout(tier: PlanTier) {
    setBusy(tier);
    setNotice(null);
    const res = await startCheckout(tier); // redirects on success
    if (res && !res.ok) setNotice(res.error);
    setBusy(null);
  }
  async function portal() {
    setBusy("portal");
    setNotice(null);
    const res = await openBillingPortal();
    if (res && !res.ok) setNotice(res.error);
    setBusy(null);
  }

  return (
    <div className="space-y-5">
      {notice && (
        <div className="flex items-start gap-3 rounded-[12px] border border-blue-200 bg-blue-50 px-4 py-3">
          <Icon name="payments" className="mt-0.5 h-4 w-4 flex-none text-blue-600" />
          <p className="text-[0.82rem] leading-[1.6] text-navy-800">{notice}</p>
        </div>
      )}
      <Panel>
        <PanelHeader title="Current plan" />
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-5">
          <div>
            <p className="font-display text-[1.3rem] font-semibold text-ink">{PLANS[plan].name}</p>
            <p className="text-[0.82rem] text-ink-faint">${PLANS[plan].priceMonthly}/month · billed monthly</p>
          </div>
          <GhostBtn onClick={portal}>{busy === "portal" ? "Opening…" : "Manage payment method"}</GhostBtn>
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-4 min-[641px]:grid-cols-3">
        {PLAN_ORDER.map((tier) => {
          const p = PLANS[tier];
          const current = tier === plan;
          return (
            <Panel key={tier} className={cn("flex flex-col p-5", current && "ring-2 ring-blue-600")}>
              <p className="font-display text-[1.05rem] font-semibold text-ink">{p.name}</p>
              <p className="font-instrument mt-1 text-[1.6rem] font-semibold text-ink">
                ${p.priceMonthly}
                <span className="text-[0.8rem] font-medium text-ink-faint">/mo</span>
              </p>
              <ul className="mt-4 flex-1 space-y-1.5">
                {p.highlights.slice(0, 4).map((h) => (
                  <li key={h} className="flex items-start gap-2 text-[0.78rem] text-ink-muted">
                    <Icon name="check" className="mt-0.5 h-3.5 w-3.5 flex-none text-success-700" />
                    {h}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={current || busy === tier}
                onClick={() => checkout(tier)}
                className={cn(
                  "mt-5 rounded-[10px] px-4 py-2.5 text-[0.83rem] font-semibold transition-colors",
                  current
                    ? "cursor-default bg-surface-alt text-ink-faint"
                    : "bg-navy-900 text-white hover:bg-navy-800",
                )}
              >
                {current ? "Current plan" : busy === tier ? "Starting…" : "Switch"}
              </button>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

// ---- small field helpers ----
function Field({
  label,
  defaultValue,
  type = "text",
  className,
}: {
  label: string;
  defaultValue?: string;
  type?: string;
  className?: string;
}) {
  const id = label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      <input id={id} type={type} defaultValue={defaultValue} className={inputBase} />
    </div>
  );
}
/** Controlled text field. */
function TField({
  label,
  value,
  onChange,
  type = "text",
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  className?: string;
}) {
  const id = "f-" + label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      <input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} className={inputBase} />
    </div>
  );
}

/** Controlled select. */
function TSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const id = "s-" + label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <SelectShell>
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(inputBase, "appearance-none pr-9")}
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </SelectShell>
    </div>
  );
}
function ToggleRow({
  id,
  label,
  desc,
  on = false,
  locked = false,
}: {
  id: string;
  label: string;
  desc: string;
  on?: boolean;
  locked?: boolean;
}) {
  const [checked, setChecked] = useState(on);
  return (
    <Toggle
      id={id}
      label={label}
      description={desc}
      checked={checked}
      onChange={locked ? () => {} : setChecked}
    />
  );
}
