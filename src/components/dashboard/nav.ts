/**
 * Dashboard navigation model — the single source of truth for the sidebar,
 * the mobile drawer, and topbar page titles. Feature-gated items carry a
 * `feature` key checked against the tenant plan via hasFeature().
 */
import type { IconName } from "./icons";
import type { PlanFeatures } from "@/lib/plans";

export interface NavItem {
  label: string;
  href: string;
  icon: IconName;
  /** Plan feature required to fully use this section (still visible if locked). */
  feature?: keyof PlanFeatures;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: "Operations",
    items: [
      { label: "Overview", href: "/dashboard", icon: "overview" },
      { label: "Calendar", href: "/dashboard/calendar", icon: "calendar" },
      { label: "Bookings", href: "/dashboard/bookings", icon: "bookings" },
    ],
  },
  {
    label: "People & work",
    items: [
      { label: "Customers", href: "/dashboard/customers", icon: "customers" },
      { label: "Team", href: "/dashboard/employees", icon: "employees" },
      { label: "Services", href: "/dashboard/services", icon: "services" },
    ],
  },
  {
    label: "Money",
    items: [
      { label: "Invoices", href: "/dashboard/invoices", icon: "invoices", feature: "invoicing" },
      { label: "Payments", href: "/dashboard/payments", icon: "payments" },
      { label: "Reports", href: "/dashboard/reports", icon: "reports" },
    ],
  },
  {
    label: "Grow",
    items: [
      { label: "Marketing", href: "/dashboard/marketing", icon: "marketing", feature: "coupons" },
      { label: "Widget", href: "/dashboard/widget", icon: "widget" },
    ],
  },
];

export const SETTINGS_ITEM: NavItem = {
  label: "Settings",
  href: "/dashboard/settings",
  icon: "settings",
};

/** Flattened lookup for topbar titles. Longest-prefix match wins. */
export function titleForPath(pathname: string): string {
  const all = [...NAV.flatMap((g) => g.items), SETTINGS_ITEM];
  const match = all
    .filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return match?.label ?? "Dashboard";
}
