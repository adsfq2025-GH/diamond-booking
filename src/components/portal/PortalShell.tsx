import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { signOut } from "@/lib/actions/auth";
import { Avatar } from "@/components/dashboard/ui";

/**
 * Slim top-bar shell shared by the employee (/team) and customer (/portal)
 * apps. Lighter than the owner dashboard — a single centered column, no
 * sidebar. `eyebrow` labels which app you're in.
 */
export function PortalShell({
  eyebrow,
  userName,
  userSubtitle,
  accentColor,
  children,
}: {
  eyebrow: string;
  userName: string;
  userSubtitle?: string;
  accentColor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-surface-alt">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1080px] items-center justify-between px-[clamp(1rem,4vw,2rem)] py-3">
          <div className="flex items-center gap-3">
            <Link href="/" aria-label="Diamond Booking home" className="transition-opacity hover:opacity-80">
              <Logo variant="light" className="h-7" priority />
            </Link>
            <span className="hidden rounded-[var(--radius-pill)] bg-blue-50 px-2.5 py-1 text-[0.64rem] font-bold tracking-[0.1em] text-blue-700 uppercase sm:inline-block">
              {eyebrow}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-[0.82rem] font-semibold text-ink">{userName}</p>
              {userSubtitle && <p className="text-[0.72rem] text-ink-faint">{userSubtitle}</p>}
            </div>
            <Avatar name={userName} color={accentColor ?? "var(--navy-600)"} size={34} />
            <form action={signOut}>
              <button
                type="submit"
                className="text-[0.8rem] font-semibold text-ink-faint transition-colors hover:text-ink"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1080px] flex-1 px-[clamp(1rem,4vw,2rem)] py-[clamp(1.5rem,3vw,2.5rem)]">
        {children}
      </main>
    </div>
  );
}
