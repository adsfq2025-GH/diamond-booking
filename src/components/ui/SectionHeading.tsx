import { cn } from "@/lib/cn";
import { Eyebrow } from "@/components/ui/Eyebrow";

/**
 * Headline emphasis system (direction-final NOTES):
 * each major headline emphasizes exactly ONE phrase — the emotional /
 * semantic payoff — set in italic color. Blue on light surfaces, sky on
 * navy, gold reserved for the single most important moment per screen.
 */
export function Em({
  tone = "blue",
  children,
}: {
  tone?: "blue" | "sky" | "gold";
  children: React.ReactNode;
}) {
  return (
    <span className={cn("em-italic", `em-${tone}`)}>{children}</span>
  );
}

type SectionHeadingProps = {
  eyebrow?: React.ReactNode;
  /** Headline content — include exactly one <Em> phrase. */
  title: React.ReactNode;
  lede?: React.ReactNode;
  onDark?: boolean;
  align?: "left" | "center";
  className?: string;
  ledeClassName?: string;
  as?: "h1" | "h2";
};

export function SectionHeading({
  eyebrow,
  title,
  lede,
  onDark = false,
  align = "left",
  className,
  ledeClassName,
  as: Tag = "h2",
}: SectionHeadingProps) {
  return (
    <div className={cn(align === "center" && "text-center", className)}>
      {eyebrow && (
        <Eyebrow
          onDark={onDark}
          className={cn(align === "center" && "justify-center")}
        >
          {eyebrow}
        </Eyebrow>
      )}
      <Tag
        className={cn(
          "font-display text-[length:var(--text-h2-lg)] leading-[1.12] font-bold tracking-[-0.03em]",
          onDark ? "text-white" : "text-ink",
        )}
      >
        {title}
      </Tag>
      {lede && (
        <p
          className={cn(
            "mt-4 font-light",
            onDark ? "text-white/70" : "text-ink-muted",
            ledeClassName,
          )}
        >
          {lede}
        </p>
      )}
    </div>
  );
}
