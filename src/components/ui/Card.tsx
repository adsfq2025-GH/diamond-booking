import { cn } from "@/lib/cn";

/**
 * Token-driven card surface. `interactive` adds the lift-on-hover
 * treatment used across the landing page.
 */
export function Card({
  className,
  interactive = false,
  children,
}: {
  className?: string;
  interactive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border border-navy-900/8 bg-card",
        interactive &&
          "transition-[transform,box-shadow,border-color] duration-[var(--duration-base)] ease-[var(--ease-out-expo)] hover:-translate-y-1.5 hover:shadow-float",
        className,
      )}
    >
      {children}
    </div>
  );
}
