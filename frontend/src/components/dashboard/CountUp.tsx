"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "framer-motion";

interface CountUpProps {
  value: number;
  /**
   * Applied to every intermediate frame — not just the final value.
   *
   * This is the whole reason the component takes a formatter instead of a
   * plain number: `longest_focus_streak_s` is stored in seconds and displayed
   * through `fmtDuration`, so animating the raw number would count up to
   * "324" and only then snap to "5m".
   */
  format?: (n: number) => string;
  durationMs?: number;
  className?: string;
}

const DEFAULT_DURATION_MS = 700;

export default function CountUp({
  value,
  format = (n) => String(Math.round(n)),
  durationMs = DEFAULT_DURATION_MS,
  className,
}: CountUpProps) {
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(0);
  /** Where the next animation starts, so re-fetches count from the old value. */
  const fromRef = useRef(0);

  useEffect(() => {
    if (reduceMotion) {
      setDisplay(value);
      fromRef.current = value;
      return;
    }

    const from = fromRef.current;
    fromRef.current = value;

    if (from === value) {
      setDisplay(value);
      return;
    }

    const controls = animate(from, value, {
      duration: durationMs / 1000,
      ease: "easeOut",
      onUpdate: setDisplay,
      // Guarantees the exact target lands, free of float drift.
      onComplete: () => setDisplay(value),
    });

    return () => controls.stop();
  }, [value, reduceMotion, durationMs]);

  return (
    <>
      {/* Hidden from assistive tech so a screen reader hears one final number
          instead of every frame of the count. */}
      <span className={className} aria-hidden="true">
        {format(display)}
      </span>
      <span className="sr-only">{format(value)}</span>
    </>
  );
}
