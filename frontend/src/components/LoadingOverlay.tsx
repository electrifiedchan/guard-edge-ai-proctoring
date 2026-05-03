"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface LoadingOverlayProps {
  open: boolean;
  // Optional override; defaults to coach-tone messages grounded in real backend phases.
  messages?: string[];
}

const DEFAULT_MESSAGES = [
  "Reading your session log…",
  "Grouping behavioural events by type…",
  "Cross-referencing temporal patterns…",
  "Drafting your coach feedback…",
  "Polishing the final report…",
];

export default function LoadingOverlay({ open, messages = DEFAULT_MESSAGES }: LoadingOverlayProps) {
  const [idx, setIdx] = useState(0);

  // Reset to the first message every time the overlay opens so the candidate
  // doesn't see a half-finished cycle from a previous open.
  useEffect(() => {
    if (!open) return;
    setIdx(0);
    const handle = setInterval(() => {
      setIdx((current) => (current + 1) % messages.length);
    }, 2500);
    return () => clearInterval(handle);
  }, [open, messages.length]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="loading-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="fixed inset-0 z-[100] flex items-center justify-center"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          {/* Backdrop — subtle blur + dim, not a heavy frosted slab */}
          <div className="absolute inset-0 bg-[var(--color-canvas)]/70 backdrop-blur-md" />

          {/* Card */}
          <motion.div
            initial={{ y: 8, opacity: 0, filter: "blur(4px)" }}
            animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
            exit={{ y: 4, opacity: 0 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="relative lift-1 haze rounded-2xl px-8 py-7 min-w-[360px] max-w-[440px] flex flex-col"
          >
            {/* Top hairline — iris signal */}
            <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-[var(--color-iris)]/60 to-transparent" />

            {/* Eyebrow + indicator */}
            <div className="flex items-center gap-2.5 mb-5">
              <span className="relative flex w-2 h-2">
                <span className="absolute inset-0 rounded-full bg-[var(--color-iris)] pulse-iris" />
                <span className="relative inline-flex w-2 h-2 rounded-full bg-[var(--color-iris)]" />
              </span>
              <span className="eyebrow">Generating report</span>
            </div>

            {/* Headline */}
            <h2 className="font-display text-[22px] font-semibold tracking-tight text-[var(--color-snow)] leading-tight mb-2">
              Your coach is reviewing the session.
            </h2>
            <p className="text-[12.5px] text-[var(--color-slate)] leading-relaxed mb-6">
              This usually takes a few seconds. We&apos;re reading every flagged event so the feedback you get is specific to what actually happened.
            </p>

            {/* Cycling status line */}
            <div className="relative h-[44px] rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface-2)] px-3.5 flex items-center overflow-hidden">
              {/* Progress sweep — purely visual cadence cue, not real progress */}
              <motion.div
                aria-hidden
                className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-transparent via-[var(--color-iris)]/15 to-transparent"
                initial={{ x: "-100%" }}
                animate={{ x: "420%" }}
                transition={{
                  duration: 1.8,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
              <AnimatePresence mode="wait">
                <motion.span
                  key={idx}
                  initial={{ opacity: 0, y: 6, filter: "blur(3px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -4, filter: "blur(3px)" }}
                  transition={{ duration: 0.32, ease: "easeOut" }}
                  className="relative font-mono text-[12px] text-[var(--color-parchment)]"
                >
                  <span className="text-[var(--color-fog)] mr-2">&gt;</span>
                  {messages[idx]}
                </motion.span>
              </AnimatePresence>
            </div>

            {/* Step pips */}
            <div className="flex items-center gap-1.5 mt-4">
              {messages.map((_, i) => (
                <span
                  key={i}
                  className={`h-[2px] flex-1 rounded-full transition-colors duration-300 ${
                    i <= idx ? "bg-[var(--color-iris)]/70" : "bg-[var(--color-hairline)]"
                  }`}
                />
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
