import { cn } from "@/lib/cn";

/**
 * Eyebrow label: uppercase, tracked-out, with a leading dash.
 * Blue-600 on light surfaces; blue-300 on navy.
 */
export function Eyebrow({
  children,
  onDark = false,
  className,
}: {
  children: React.ReactNode;
  onDark?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "eyebrow mb-5 inline-flex items-center gap-3 font-bold",
        "max-[520px]:tracking-[0.14em]",
        onDark && "text-blue-300",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "h-[1.5px] w-6 max-[520px]:hidden",
          onDark ? "bg-blue-300" : "bg-blue-600",
        )}
      />
      {children}
    </span>
  );
}
