"use client";

import { cn } from "@/lib/cn";
import { Icon, type IconName } from "../icons";

/**
 * Shared building blocks for the list/table sections (bookings, customers,
 * invoices, payments, team, services, marketing). Client components so pages
 * can filter/search/open modals over server-loaded data.
 */

/** Preview-mode banner: shown when there is no live backend to persist to. */
export function PreviewNotice({ children }: { children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-start gap-3 rounded-[12px] border border-blue-200 bg-blue-50 px-4 py-3">
      <span
        aria-hidden
        className="mt-[1px] flex h-5 w-5 flex-none items-center justify-center rounded-full bg-blue-600 text-[0.6rem] font-bold text-white"
      >
        i
      </span>
      <p className="text-[0.8rem] leading-[1.6] text-navy-800">
        {children ?? (
          <>
            <span className="font-semibold">Preview mode.</span> You&rsquo;re
            viewing demo data. Connect a Supabase project (see docs/BACKEND.md)
            to load your real records and save changes.
          </>
        )}
      </p>
    </div>
  );
}

/** Toolbar: search + optional filter chips + primary action. */
export function Toolbar({
  search,
  onSearch,
  placeholder = "Search…",
  children,
  action,
}: {
  search?: string;
  onSearch?: (v: string) => void;
  placeholder?: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 min-[641px]:flex-row min-[641px]:items-center">
      {onSearch && (
        <div className="relative min-[641px]:max-w-[300px] min-[641px]:flex-1">
          <Icon
            name="search"
            className="pointer-events-none absolute top-1/2 left-3 h-[16px] w-[16px] -translate-y-1/2 text-ink-faint"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={placeholder}
            className="w-full rounded-[10px] border border-line-strong bg-card py-[9px] pr-3 pl-9 text-[0.85rem] text-ink placeholder:text-ink-faint/80 focus:border-blue-600 focus:ring-[3px] focus:ring-blue-600/15 focus:outline-none"
          />
        </div>
      )}
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      {action && <div className="min-[641px]:ml-auto">{action}</div>}
    </div>
  );
}

/** Segmented filter chips (booking status tabs, etc.). */
export function FilterTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: Array<{ key: T; label: string; count?: number }>;
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border px-3 py-[6px] text-[0.78rem] font-semibold transition-colors duration-[var(--duration-fast)]",
            value === t.key
              ? "border-transparent bg-navy-900 text-white"
              : "border-line-strong bg-card text-ink-muted hover:border-blue-600 hover:text-blue-600",
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span
              className={cn(
                "rounded-full px-1.5 text-[0.68rem] font-bold",
                value === t.key ? "bg-white/20 text-white" : "bg-surface-alt text-ink-faint",
              )}
            >
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/** Primary (gold) action button used in toolbars. */
export function ActionButton({
  children,
  onClick,
  icon = "plus",
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  icon?: IconName;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={cn(
        "group inline-flex items-center justify-center gap-2 rounded-[10px] border border-transparent px-4 py-2.5 text-[0.84rem] font-semibold whitespace-nowrap",
        "bg-[linear-gradient(180deg,var(--gold-400)_0%,var(--gold-500)_55%,var(--gold-600)_100%)] text-navy-950 shadow-[var(--shadow-gold)]",
        "transition-[transform,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-out-expo)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-gold-hover)]",
      )}
    >
      <Icon name={icon} className="h-4 w-4" />
      {children}
    </button>
  );
}

/** Ghost/secondary button. */
export function GhostBtn({
  children,
  onClick,
  type = "button",
  icon,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  icon?: IconName;
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[10px] border border-line-strong bg-card px-4 py-2.5 text-[0.83rem] font-semibold text-ink transition-[transform,border-color,color] duration-[var(--duration-fast)] hover:-translate-y-0.5 hover:border-blue-600 hover:text-blue-600",
        className,
      )}
    >
      {icon && <Icon name={icon} className="h-4 w-4" />}
      {children}
    </button>
  );
}

/** Table shell that scrolls horizontally on small screens without page overflow. */
export function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left">
        {children}
      </table>
    </div>
  );
}

export function Th({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "border-b border-line px-4 py-3 text-[0.68rem] font-bold tracking-[0.08em] text-ink-faint uppercase",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <td className={cn("border-b border-line px-4 py-3 align-middle text-[0.85rem] text-ink", className)}>
      {children}
    </td>
  );
}
