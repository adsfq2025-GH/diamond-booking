import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

/**
 * Minimal auth shell: centered card on surface-alt with a feathered
 * dot-grid backdrop and a soft brand glow. No marketing nav — just the
 * logo home link above and quiet legal links below.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-surface-alt px-[var(--container-pad)] py-[clamp(40px,6vh,72px)]">
      {/* feathered dot grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgb(12_36_64/0.07)_1px,transparent_1px)] [background-size:26px_26px] [mask-image:radial-gradient(860px_600px_at_50%_36%,black_0%,transparent_74%)] [-webkit-mask-image:radial-gradient(860px_600px_at_50%_36%,black_0%,transparent_74%)]"
      />
      {/* soft brand glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(720px_400px_at_50%_-6%,rgb(46_134_193/0.10),transparent_64%)]"
      />

      <div className="relative flex w-full flex-col items-center">
        <Link
          href="/"
          aria-label="Diamond Booking home"
          className="mb-[34px] transition-opacity duration-[var(--duration-fast)] hover:opacity-80"
        >
          <Logo variant="light" className="h-11" priority />
        </Link>

        {children}

        <footer className="mt-[30px] flex items-center gap-2 text-[0.78rem] text-ink-faint">
          <Link href="/" className="font-medium transition-colors duration-[var(--duration-fast)] hover:text-ink">
            ← Back to site
          </Link>
          <span aria-hidden>·</span>
          <Link href="/privacy" className="transition-colors duration-[var(--duration-fast)] hover:text-ink">
            Privacy
          </Link>
          <span aria-hidden>·</span>
          <Link href="/terms" className="transition-colors duration-[var(--duration-fast)] hover:text-ink">
            Terms
          </Link>
        </footer>
      </div>
    </div>
  );
}
