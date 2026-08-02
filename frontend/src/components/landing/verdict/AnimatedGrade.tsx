"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * AnimatedGrade — a slot-machine / live-telemetry grade readout.
 *
 * Flickers through random grades, then lands on the real `final` grade, and
 * re-runs every ~5s so it feels like a local LLM judge recomputing live.
 * Color always follows the §0.1 tier (emerald A / amber B / red C) and changes
 * WITH the flickering grade. font-mono, fixed min-width so it never shifts.
 *
 * Reusable anywhere grades/scores appear. No Math.random() in render (it lives
 * inside useEffect → hydration-safe).
 */

const POOL = ["C", "B-", "B", "B+", "A-", "A", "A+"];

function tierColor(g: string): string {
  if (g.startsWith("A")) return "text-emerald-400 border-emerald-400/25 bg-emerald-400/[0.06]";
  if (g.startsWith("B")) return "text-amber-400 border-amber-400/25 bg-amber-400/[0.06]";
  return "text-red-400 border-red-400/25 bg-red-400/[0.06]";
}

export function AnimatedGrade({ final, delay = 0 }: { final: string; delay?: number }) {
  const [display, setDisplay] = useState(final);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    let interval: ReturnType<typeof setInterval> | undefined;

    const runCycle = () => {
      let i = 0;
      const shuffle = () => {
        setDisplay(POOL[Math.floor(Math.random() * POOL.length)]);
        i++;
        if (i < 8) {
          timers.push(setTimeout(shuffle, 80)); // fast flicker
        } else {
          setDisplay(final); // land on the real grade
        }
      };
      shuffle();
    };

    // initial run after `delay`, then repeat every 5s
    const start = setTimeout(() => {
      runCycle();
      interval = setInterval(runCycle, 5000);
    }, delay);
    timers.push(start);

    return () => {
      timers.forEach(clearTimeout);
      if (interval !== undefined) clearInterval(interval);
    };
  }, [final, delay]);

  return (
    <div className="min-w-[2.75rem] text-center">
      <AnimatePresence mode="popLayout">
        <motion.span
          key={display}
          initial={{ y: -8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 8, opacity: 0 }}
          transition={{ duration: 0.12, ease: "easeOut" }}
          className={`inline-block rounded-md border px-2 py-0.5 font-mono text-sm ${tierColor(display)}`}
        >
          {display}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
