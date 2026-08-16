import { cn } from "@/lib/cn";

/**
 * CSS-driven infinite marquee. The track is rendered twice and slides
 * -50%; edges feathered by a mask (see .marquee in globals.css).
 * Pauses under prefers-reduced-motion.
 */
export function Marquee({
  items,
  className,
  label,
}: {
  items: string[];
  className?: string;
  label?: string;
}) {
  const track = (hidden: boolean) => (
    <div className="flex" aria-hidden={hidden || undefined}>
      {items.map((item) => (
        <span
          key={item}
          className={cn(
            "font-instrument flex items-center gap-[34px] px-[34px]",
            "text-[1.05rem] font-semibold tracking-[-0.01em] whitespace-nowrap",
            "text-navy-600 opacity-60",
          )}
        >
          {item}
          <span aria-hidden className="text-[0.5rem] text-blue-300">
            ◆
          </span>
        </span>
      ))}
    </div>
  );

  return (
    <div className={cn("marquee relative", className)} aria-label={label}>
      <div className="marquee-track">
        {track(false)}
        {track(true)}
      </div>
    </div>
  );
}
