import { cn } from "@/lib/cn";

/**
 * Form-field primitives shared by the contact + auth forms.
 * Token-driven: blue focus ring, quiet borders, error tint kept
 * off the brand palette (never gold/blue) so validation reads
 * instantly without stealing accent budget.
 */

export const inputBase = cn(
  "w-full rounded-[10px] border border-line-strong bg-card px-3.5 py-[11px]",
  "text-[0.92rem] text-ink placeholder:text-ink-faint/80",
  "transition-[border-color,box-shadow,background-color] duration-[var(--duration-fast)] ease-[var(--ease-out-expo)]",
  "focus:border-blue-600 focus:outline-none focus:ring-[3px] focus:ring-blue-600/15",
);

export const inputInvalid = cn(
  "border-[#c25450] bg-[#fdf6f5]",
  "focus:border-[#b03a36] focus:ring-[#b03a36]/12",
);

export function Label({
  htmlFor,
  children,
  hint,
  className,
}: {
  htmlFor: string;
  children: React.ReactNode;
  /** Right-aligned quiet hint (e.g. "Optional"). */
  hint?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-1.5 flex items-baseline justify-between", className)}>
      <label
        htmlFor={htmlFor}
        className="text-[0.8rem] font-semibold tracking-[-0.005em] text-ink"
      >
        {children}
      </label>
      {hint && <span className="text-[0.75rem] text-ink-faint">{hint}</span>}
    </div>
  );
}

export function FieldError({
  id,
  children,
}: {
  id?: string;
  children?: React.ReactNode;
}) {
  if (!children) return null;
  return (
    <p
      id={id}
      role="alert"
      className="mt-1.5 flex items-start gap-1.5 text-[0.78rem] font-medium text-[#a63d39]"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="mt-[1px] h-3.5 w-3.5 flex-none"
        aria-hidden
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5M12 16.5v.5" strokeLinecap="round" />
      </svg>
      {children}
    </p>
  );
}

/** Wrapper that adds the chevron affordance to a native <select>. */
export function SelectShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      {children}
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-[0.7rem] text-ink-faint"
      >
        ▾
      </span>
    </div>
  );
}
