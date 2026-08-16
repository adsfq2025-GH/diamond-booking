"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useInView, useReducedMotion } from "framer-motion";

/**
 * Animated stat counter: counts 0 → `to` when scrolled into view (once).
 * `unit` renders inside the number ("K"), `suffix` renders as the
 * blue-accented trailing mark ("+", "%").
 */
export function CountUp({
  to,
  unit = "",
  suffix = "",
  duration = 1.4,
  className,
}: {
  to: number;
  unit?: string;
  suffix?: string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduce = useReducedMotion();
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!inView || reduce) return;
    const controls = animate(0, to, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setValue(Math.round(v)),
    });
    return () => controls.stop();
  }, [inView, reduce, to, duration]);

  // Reduced motion (or pre-hydration): show the final value directly.
  const display = reduce ? to : value;

  return (
    <span ref={ref} className={className}>
      {display}
      {unit}
      {suffix && <em className="text-blue-600 not-italic">{suffix}</em>}
    </span>
  );
}
