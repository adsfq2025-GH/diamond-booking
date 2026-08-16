/**
 * Lightweight, dependency-free charts for the dashboard. Pure CSS/SVG, no
 * client JS — safe in server components. Colors come from tokens.
 */
import { cn } from "@/lib/cn";
import { moneyCompact } from "@/lib/format";

export interface Bar {
  label: string;
  value: number;
  /** Optional override; defaults to the blue series color. */
  color?: string;
  /** Preformatted tooltip/value label. */
  display?: string;
}

/** Vertical bar chart with a soft baseline grid. */
export function BarChart({
  bars,
  height = 168,
  className,
  highlightLast = true,
}: {
  bars: Bar[];
  height?: number;
  className?: string;
  highlightLast?: boolean;
}) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <div className={cn("w-full", className)}>
      <div
        className="relative flex items-end justify-between gap-2"
        style={{ height }}
      >
        {/* baseline gridlines */}
        <div aria-hidden className="pointer-events-none absolute inset-0 flex flex-col justify-between">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="block w-full border-t border-line/70" />
          ))}
        </div>
        {bars.map((b, i) => {
          const pct = Math.max(2, Math.round((b.value / max) * 100));
          const isLast = highlightLast && i === bars.length - 1;
          return (
            <div
              key={`${b.label}-${i}`}
              className="group relative z-10 flex h-full flex-1 flex-col justify-end"
              title={`${b.label}: ${b.display ?? b.value}`}
            >
              <div
                className={cn(
                  "w-full rounded-t-[5px] transition-[filter] duration-[var(--duration-fast)] group-hover:brightness-105",
                )}
                style={{
                  height: `${pct}%`,
                  background: b.color
                    ? b.color
                    : isLast
                      ? "linear-gradient(180deg,var(--blue-500),var(--blue-600))"
                      : "linear-gradient(180deg,var(--blue-300),var(--blue-400))",
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between gap-2">
        {bars.map((b, i) => (
          <span
            key={`${b.label}-lbl-${i}`}
            className="flex-1 text-center text-[0.66rem] font-medium text-ink-faint"
          >
            {b.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Convenience wrapper for money-valued bars. */
export function RevenueBarChart({
  bars,
  height,
}: {
  bars: Array<{ label: string; cents: number }>;
  height?: number;
}) {
  return (
    <BarChart
      height={height}
      bars={bars.map((b) => ({
        label: b.label,
        value: b.cents,
        display: moneyCompact(b.cents),
      }))}
    />
  );
}

export interface Segment {
  label: string;
  value: number;
  color: string;
}

/** Horizontal stacked distribution bar + legend. */
export function SegmentBar({
  segments,
  className,
}: {
  segments: Segment[];
  className?: string;
}) {
  const total = Math.max(1, segments.reduce((s, x) => s + x.value, 0));
  const visible = segments.filter((s) => s.value > 0);
  return (
    <div className={className}>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-alt">
        {visible.map((s) => (
          <span
            key={s.label}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${(s.value / total) * 100}%`,
              backgroundColor: s.color,
            }}
            title={`${s.label}: ${s.value}`}
          />
        ))}
      </div>
      <ul className="mt-4 space-y-2.5">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2.5 text-[0.82rem]">
            <span
              aria-hidden
              className="h-2.5 w-2.5 flex-none rounded-[3px]"
              style={{ backgroundColor: s.color }}
            />
            <span className="flex-1 text-ink-muted">{s.label}</span>
            <span className="font-instrument font-semibold text-ink">{s.value}</span>
            <span className="w-10 text-right text-[0.75rem] text-ink-faint">
              {Math.round((s.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Donut ring for a single ratio (used in reports/overview accents). */
export function DonutRatio({
  value,
  size = 92,
  stroke = 10,
  color = "var(--blue-500)",
  label,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  label?: string;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.min(1, Math.max(0, value));
  return (
    <div className="relative inline-flex" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--line)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - clamped)}
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-instrument text-[1.05rem] font-semibold text-ink">
          {Math.round(clamped * 100)}%
        </span>
        {label && <span className="text-[0.62rem] text-ink-faint">{label}</span>}
      </span>
    </div>
  );
}
