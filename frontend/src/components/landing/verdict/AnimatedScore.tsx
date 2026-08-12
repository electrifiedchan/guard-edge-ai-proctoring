"use client";

import { useEffect, useRef, useState } from "react";

/**
 * AnimatedScore — a live-telemetry percentage readout.
 *
 * Counts UP to the real `final` score, holds, then counts DOWN and back up again
 * every ~5s, so the panel reads like a local judge recomputing in real time.
 * Color always follows the §0.1 tier (emerald 80+ / amber 60–79 / red <60) and
 * changes WITH the counting number. font-mono, tabular-nums + fixed min-width so
 * the badge never shifts as digits change.
 *
 * Reusable anywhere scores appear. No Math.random(), no render-time clock →
 * hydration-safe.
 */

const STEP_MS = 28; // per-tick cadence while counting
const HOLD_MS = 2200; // dwell on the settled score
const DIP = 14; // how far it counts back down before climbing again

function tierColor(score: number): string {
  if (score >= 80) return "text-emerald-400 border-emerald-400/25 bg-emerald-400/[0.06]";
  if (score >= 60) return "text-amber-400 border-amber-400/25 bg-amber-400/[0.06]";
  return "text-red-400 border-red-400/25 bg-red-400/[0.06]";
}

export function AnimatedScore({ final, delay = 0 }: { final: number; delay?: number }) {
  const [display, setDisplay] = useState(final);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const wait = (ms: number, fn: () => void) => {
      timers.current.push(setTimeout(fn, ms));
    };

    // walk `from` → `to` one point at a time, then run `done`
    const countTo = (from: number, to: number, done: () => void) => {
      const dir = to > from ? 1 : -1;
      let n = from;
      const tick = () => {
        if (n === to) {
          done();
          return;
        }
        n += dir;
        setDisplay(n);
        wait(STEP_MS, tick);
      };
      tick();
    };

    const floor = Math.max(0, final - DIP);

    // up → hold → down → hold → repeat
    const cycle = () => {
      countTo(floor, final, () =>
        wait(HOLD_MS, () => countTo(final, floor, () => wait(HOLD_MS / 3, cycle))),
      );
    };

    setDisplay(floor);
    wait(delay, cycle);

    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [final, delay]);

  return (
    <div className="min-w-[3.5rem] text-center">
      <span
        className={`inline-block rounded-md border px-2 py-0.5 font-mono text-sm tabular-nums ${tierColor(display)}`}
      >
        {display}%
      </span>
    </div>
  );
}
