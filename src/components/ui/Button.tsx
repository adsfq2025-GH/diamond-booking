import Link from "next/link";
import { cn } from "@/lib/cn";

type ButtonVariant = "gold" | "ghost" | "ghost-dark" | "navy";
type ButtonSize = "md" | "sm";

const base = cn(
  "group inline-flex items-center justify-center gap-2.5 whitespace-nowrap",
  "rounded-[10px] border font-semibold cursor-pointer",
  "transition-[transform,box-shadow,background-color,border-color,color]",
  "duration-[var(--duration-fast)] ease-[var(--ease-out-expo)]",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600",
  "active:translate-y-0 active:scale-[0.99]",
);

const sizes: Record<ButtonSize, string> = {
  md: "px-[30px] py-[15px] text-[0.9375rem]",
  sm: "px-[22px] py-[11px] text-[0.875rem]",
};

const variants: Record<ButtonVariant, string> = {
  gold: cn(
    "border-transparent",
    "bg-[linear-gradient(180deg,var(--gold-400)_0%,var(--gold-500)_55%,var(--gold-600)_100%)]",
    "text-navy-950 shadow-[var(--shadow-gold)]",
    "hover:-translate-y-0.5 hover:shadow-[var(--shadow-gold-hover)]",
    "active:shadow-[var(--shadow-gold)]",
  ),
  ghost: cn(
    "bg-transparent text-ink border-line-strong",
    "hover:-translate-y-0.5 hover:border-blue-600 hover:text-blue-600 hover:shadow-lift",
  ),
  "ghost-dark": cn(
    "bg-transparent text-white border-white/30",
    "hover:-translate-y-0.5 hover:border-blue-300 hover:text-blue-300",
  ),
  navy: cn(
    "border-transparent bg-navy-700 text-white",
    "hover:-translate-y-0.5 hover:bg-navy-600 hover:shadow-lift",
  ),
};

type ButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  href?: string;
  /** Render a trailing arrow that nudges right on hover. */
  arrow?: boolean;
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
};

export function Button({
  variant = "gold",
  size = "md",
  href,
  arrow = false,
  className,
  children,
  onClick,
  type = "button",
}: ButtonProps) {
  const cls = cn(base, sizes[size], variants[variant], className);
  const content = (
    <>
      {children}
      {arrow && (
        <span
          aria-hidden
          className="transition-transform duration-[var(--duration-fast)] ease-[var(--ease-out-expo)] group-hover:translate-x-[3px]"
        >
          →
        </span>
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={cls}>
        {content}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} className={cls}>
      {content}
    </button>
  );
}
