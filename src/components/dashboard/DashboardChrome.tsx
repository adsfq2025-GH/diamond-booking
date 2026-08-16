"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { hasFeature } from "@/lib/plans";
import { signOut } from "@/lib/actions/auth";
import { Logo } from "@/components/ui/Logo";
import type { DashboardContext } from "@/lib/dashboard/types";
import { Icon } from "./icons";
import { NAV, SETTINGS_ITEM, titleForPath, type NavItem } from "./nav";
import { Avatar, LockedPill } from "./ui";

/**
 * The dashboard app shell: fixed sidebar on desktop, slide-over drawer on
 * mobile, and a slim topbar. Server-rendered page content is passed as
 * `children`. All chrome state (drawer + user menu) lives here on the client.
 */
export function DashboardChrome({
  context,
  children,
}: {
  context: DashboardContext;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  return (
    <div className="min-h-dvh bg-surface-alt">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] border-r border-line bg-surface lg:flex lg:flex-col">
        <SidebarBody context={context} pathname={pathname} />
      </aside>

      {/* Mobile drawer */}
      <div
        className={cn(
          "fixed inset-0 z-50 lg:hidden",
          drawerOpen ? "pointer-events-auto" : "pointer-events-none",
        )}
        aria-hidden={!drawerOpen}
      >
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setDrawerOpen(false)}
          className={cn(
            "absolute inset-0 bg-navy-950/40 backdrop-blur-[2px] transition-opacity duration-[var(--duration-base)]",
            drawerOpen ? "opacity-100" : "opacity-0",
          )}
        />
        <aside
          className={cn(
            "absolute inset-y-0 left-0 flex w-[280px] max-w-[84vw] flex-col bg-surface shadow-float",
            "transition-transform duration-[var(--duration-base)] ease-[var(--ease-out-expo)]",
            drawerOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <SidebarBody
            context={context}
            pathname={pathname}
            onNavigate={() => setDrawerOpen(false)}
          />
        </aside>
      </div>

      {/* Main column */}
      <div className="lg:pl-[248px]">
        <Topbar
          context={context}
          title={titleForPath(pathname)}
          onOpenDrawer={() => setDrawerOpen(true)}
        />
        <main className="mx-auto w-full max-w-[1180px] px-[clamp(1rem,4vw,2rem)] py-[clamp(1.25rem,3vw,2.25rem)]">
          {children}
        </main>
      </div>
    </div>
  );
}

// ---------- sidebar ----------

function SidebarBody({
  context,
  pathname,
  onNavigate,
}: {
  context: DashboardContext;
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="flex h-[60px] flex-none items-center border-b border-line px-5">
        <Link
          href="/dashboard"
          aria-label="Diamond Booking dashboard"
          onClick={onNavigate}
          className="transition-opacity duration-[var(--duration-fast)] hover:opacity-80"
        >
          <Logo variant="light" className="h-7" priority />
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {NAV.map((group) => (
          <div key={group.label} className="mb-5">
            <p className="mb-1.5 px-3 text-[0.64rem] font-bold tracking-[0.14em] text-ink-faint uppercase">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <SidebarLink
                  key={item.href}
                  item={item}
                  active={isActive(pathname, item.href)}
                  locked={
                    item.feature ? !hasFeature(context.plan, item.feature) : false
                  }
                  onNavigate={onNavigate}
                />
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="flex-none border-t border-line p-3">
        <ul className="mb-2 space-y-0.5">
          <SidebarLink
            item={SETTINGS_ITEM}
            active={isActive(pathname, SETTINGS_ITEM.href)}
            locked={false}
            onNavigate={onNavigate}
          />
        </ul>
        <UserCard context={context} />
      </div>
    </>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarLink({
  item,
  active,
  locked,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  locked: boolean;
  onNavigate?: () => void;
}) {
  return (
    <li>
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group relative flex items-center gap-3 rounded-[10px] px-3 py-[9px] text-[0.86rem] font-medium",
          "transition-[background-color,color] duration-[var(--duration-fast)]",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600",
          active
            ? "bg-blue-50 font-semibold text-blue-700"
            : "text-ink-muted hover:bg-surface-alt hover:text-ink",
        )}
      >
        {active && (
          <span
            aria-hidden
            className="absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-blue-600"
          />
        )}
        <Icon
          name={item.icon}
          className={cn("h-[18px] w-[18px] flex-none", active ? "text-blue-600" : "text-ink-faint group-hover:text-ink-muted")}
        />
        <span className="flex-1 truncate">{item.label}</span>
        {locked && <LockedPill />}
      </Link>
    </li>
  );
}

function UserCard({ context }: { context: DashboardContext }) {
  return (
    <div className="flex items-center gap-2.5 rounded-[10px] px-2 py-2">
      <Avatar name={context.ownerName} color="var(--navy-600)" size={32} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.8rem] font-semibold text-ink">
          {context.ownerName}
        </p>
        <p className="truncate text-[0.72rem] text-ink-faint">
          {context.tenantName}
        </p>
      </div>
    </div>
  );
}

// ---------- topbar ----------

function Topbar({
  context,
  title,
  onOpenDrawer,
}: {
  context: DashboardContext;
  title: string;
  onOpenDrawer: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-[60px] items-center gap-3 border-b border-line bg-surface/85 px-[clamp(1rem,4vw,2rem)] backdrop-blur-md">
      <button
        type="button"
        aria-label="Open menu"
        onClick={onOpenDrawer}
        className="-ml-1 flex h-9 w-9 items-center justify-center rounded-[9px] text-ink-muted hover:bg-surface-alt hover:text-ink lg:hidden"
      >
        <Icon name="menu" className="h-5 w-5" />
      </button>

      <h1 className="font-display text-[1.05rem] font-semibold tracking-[-0.02em] text-ink">
        {title}
      </h1>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <button
          type="button"
          aria-label="Search"
          className="flex h-9 w-9 items-center justify-center rounded-[9px] text-ink-muted transition-colors duration-[var(--duration-fast)] hover:bg-surface-alt hover:text-ink"
        >
          <Icon name="search" className="h-[18px] w-[18px]" />
        </button>

        {context.trialDaysLeft !== null && (
          <span className="hidden items-center gap-1.5 rounded-[var(--radius-pill)] bg-gold-100 px-2.5 py-1 text-[0.64rem] font-bold tracking-[0.08em] text-gold-700 uppercase sm:inline-flex">
            <span aria-hidden className="h-1.5 w-1.5 rotate-45 bg-gold-500" />
            {context.trialDaysLeft}d trial left
          </span>
        )}

        <button
          type="button"
          aria-label={`Notifications (${context.notificationCount} unread)`}
          className="relative flex h-9 w-9 items-center justify-center rounded-[9px] text-ink-muted transition-colors duration-[var(--duration-fast)] hover:bg-surface-alt hover:text-ink"
        >
          <Icon name="bell" className="h-[18px] w-[18px]" />
          {context.notificationCount > 0 && (
            <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[0.6rem] font-bold text-white">
              {context.notificationCount}
            </span>
          )}
        </button>

        <UserMenu context={context} />
      </div>
    </header>
  );
}

function UserMenu({ context }: { context: DashboardContext }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-[var(--radius-pill)] p-0.5 pr-1.5 transition-colors duration-[var(--duration-fast)] hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        <Avatar name={context.ownerName} color="var(--navy-600)" size={30} />
        <Icon name="chevronDown" className="hidden h-3.5 w-3.5 text-ink-faint sm:block" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] w-60 overflow-hidden rounded-[14px] border border-line bg-card shadow-float"
        >
          <div className="border-b border-line px-4 py-3">
            <p className="truncate text-[0.85rem] font-semibold text-ink">
              {context.ownerName}
            </p>
            <p className="truncate text-[0.75rem] text-ink-faint">
              {context.ownerEmail || context.tenantName}
            </p>
          </div>
          <div className="p-1.5">
            <MenuLink href="/dashboard/settings" icon="settings">
              Settings
            </MenuLink>
            <MenuLink href="/dashboard/settings#billing" icon="payments">
              Billing & plan
            </MenuLink>
            <MenuLink href="/" icon="external">
              View marketing site
            </MenuLink>
          </div>
          <form action={signOut} className="border-t border-line p-1.5">
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2.5 rounded-[9px] px-3 py-2 text-left text-[0.82rem] font-medium text-ink-muted transition-colors duration-[var(--duration-fast)] hover:bg-surface-alt hover:text-ink"
            >
              <Icon name="logout" className="h-[18px] w-[18px] text-ink-faint" />
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: Parameters<typeof Icon>[0]["name"];
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      className="flex items-center gap-2.5 rounded-[9px] px-3 py-2 text-[0.82rem] font-medium text-ink-muted transition-colors duration-[var(--duration-fast)] hover:bg-surface-alt hover:text-ink"
    >
      <Icon name={icon} className="h-[18px] w-[18px] text-ink-faint" />
      {children}
    </Link>
  );
}
