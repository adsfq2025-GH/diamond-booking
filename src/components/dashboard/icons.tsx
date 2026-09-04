/**
 * Line-icon set for the dashboard chrome. Stroke-based, 24x24, inherits
 * `currentColor` and sizes via `className` (default h-[18px] w-[18px]) so
 * icons stay token-driven. Matches the stroke weight of the Field icons.
 */
import { cn } from "@/lib/cn";

export type IconName =
  | "overview"
  | "calendar"
  | "bookings"
  | "customers"
  | "employees"
  | "services"
  | "invoices"
  | "payments"
  | "reports"
  | "marketing"
  | "widget"
  | "settings"
  | "bell"
  | "search"
  | "plus"
  | "menu"
  | "close"
  | "chevronRight"
  | "chevronDown"
  | "arrowRight"
  | "arrowUp"
  | "arrowDown"
  | "check"
  | "clock"
  | "mapPin"
  | "dots"
  | "logout"
  | "user"
  | "external"
  | "sparkle"
  | "download"
  | "filter"
  | "eye"
  | "eyeOff";

const PATHS: Record<IconName, React.ReactNode> = {
  overview: (
    <>
      <rect x="3" y="3" width="7" height="8" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="15" width="7" height="6" rx="1.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M3 9h18M8 3v3M16 3v3" />
    </>
  ),
  bookings: (
    <>
      <rect x="4" y="4" width="16" height="17" rx="2.5" />
      <path d="M9 3v3M15 3v3M8 11h5M8 15h8" strokeLinecap="round" />
    </>
  ),
  customers: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5" />
      <path d="M16 5.2a3 3 0 0 1 0 5.6M17.5 20c0-2.4-1-4.3-2.6-5.2" />
    </>
  ),
  employees: (
    <>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <path d="M12 11.4V14" strokeLinecap="round" />
    </>
  ),
  services: (
    <>
      <path d="M12 3l2.4 4.9 5.4.8-3.9 3.8.9 5.3L12 16.1 7.2 18.6l.9-5.3L4.2 9.5l5.4-.8z" />
    </>
  ),
  invoices: (
    <>
      <path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M14 3v4h4M9 12h6M9 16h6M9 8h2" strokeLinecap="round" />
    </>
  ),
  payments: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M3 9.5h18M7 15h3" strokeLinecap="round" />
    </>
  ),
  reports: (
    <>
      <path d="M4 20V4M4 20h16" strokeLinecap="round" />
      <path d="M8 20v-5M12.5 20V9M17 20v-8" strokeLinecap="round" />
    </>
  ),
  marketing: (
    <>
      <path d="M4 9v4a1 1 0 0 0 1 1h2l4 4V4L7 8H5a1 1 0 0 0-1 1z" />
      <path d="M15 8.5a4 4 0 0 1 0 7" strokeLinecap="round" />
    </>
  ),
  widget: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M9 10l-2 2 2 2M15 10l2 2-2 2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6M18.4 18.4l-1.6-1.6M7.2 7.2 5.6 5.6" strokeLinecap="round" />
    </>
  ),
  bell: (
    <>
      <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" />
      <path d="M10 20a2 2 0 0 0 4 0" strokeLinecap="round" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4-4" strokeLinecap="round" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" strokeLinecap="round" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />,
  close: <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />,
  chevronRight: <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />,
  chevronDown: <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />,
  arrowUp: <path d="M12 19V5M6 11l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />,
  arrowDown: <path d="M12 5v14M6 13l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />,
  check: <path d="M4 12l5 5L20 6" strokeLinecap="round" strokeLinejoin="round" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  mapPin: (
    <>
      <path d="M12 21c4.5-4.2 7-7.6 7-11a7 7 0 1 0-14 0c0 3.4 2.5 6.8 7 11z" />
      <circle cx="12" cy="10" r="2.4" />
    </>
  ),
  dots: (
    <>
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  logout: (
    <>
      <path d="M15 5.5V4a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-1.5" />
      <path d="M9 12h11M17 8l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
    </>
  ),
  external: (
    <>
      <path d="M14 4h6v6M20 4l-9 9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" strokeLinecap="round" />
    </>
  ),
  sparkle: (
    <path d="M12 3l1.8 5.2 5.2 1.8-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" strokeLinejoin="round" />
  ),
  download: (
    <>
      <path d="M12 3v12M7 10l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 20h16" strokeLinecap="round" />
    </>
  ),
  filter: (
    <path d="M4 5h16l-6 7v6l-4-2v-4z" strokeLinejoin="round" />
  ),
  eye: (
    <>
      <path d="M2.8 12s3.5-6 9.2-6 9.2 6 9.2 6-3.5 6-9.2 6-9.2-6-9.2-6z" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M3 3l18 18" strokeLinecap="round" />
      <path d="M10.6 6.2A10.7 10.7 0 0 1 12 6c5.7 0 9.2 6 9.2 6a17 17 0 0 1-3.1 3.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 6.8C4.1 8.4 2.8 12 2.8 12s3.5 6 9.2 6c1.5 0 2.8-.3 4-.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.3 10.3A2.4 2.4 0 0 0 9.6 12a2.4 2.4 0 0 0 2.4 2.4c.6 0 1.2-.2 1.7-.7" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
};

export function Icon({
  name,
  className,
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      aria-hidden
      className={cn("h-[18px] w-[18px]", className)}
    >
      {PATHS[name]}
    </svg>
  );
}
