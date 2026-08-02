"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { PANEL_GUIDES, type PanelGuideKey } from "@/lib/panelGuides";

/**
 * Game-style "what am I looking at" walkthrough for the dashboard.
 *
 * The panels each carry a "?" that reveals the same copy, but a first-time user
 * doesn't know the "?" exists, and reading five separate popovers is not a tour.
 * This steps through every panel in reading order with prev/next, so the whole
 * screen gets explained once, like the tutorial overlay in a game that names
 * each HUD element the first time you load in.
 *
 * Copy is NOT duplicated here — it's pulled straight from PANEL_GUIDES so the
 * tour and the per-panel "?" can never drift apart.
 */

const TOUR_SEEN_KEY = "guard.dashboardTourSeen";

interface TourStep {
  /** Panel this step is about; null for the intro/outro framing steps. */
  guide: PanelGuideKey | null;
  title: string;
  /** Used for intro/outro where there's no PANEL_GUIDES entry. */
  body?: string;
}

const STEPS: TourStep[] = [
  {
    guide: null,
    title: "This is your readiness dashboard",
    body: "Every panel here is built from your real practice sessions. Let me walk you through what each one is telling you — it takes about 30 seconds.",
  },
  { guide: "composure", title: "Composure over time" },
  { guide: "readiness", title: "Readiness score" },
  { guide: "streak", title: "Practice streak" },
  { guide: "gaze", title: "Where your eyes go" },
  { guide: "sessions", title: "Recent sessions" },
  {
    guide: null,
    title: "That's the whole board",
    body: "Every chart also has a small \u201c?\u201d in its corner if you want this explanation again later. Now go run a session — the numbers only mean something once there's data behind them.",
  },
];

export default function DashboardTour({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState(0);

  // Reset to the first step every time the tour is (re)opened, so re-launching
  // from the header button never drops you mid-way through a previous run.
  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  const last = STEPS.length - 1;
  const current = STEPS[step];
  const guide = current.guide ? PANEL_GUIDES[current.guide] : null;

  const finish = useCallback(() => {
    try {
      window.localStorage.setItem(TOUR_SEEN_KEY, "1");
    } catch {
      // Private mode can throw — non-fatal, the tour just reopens next visit.
    }
    onClose();
  }, [onClose]);

  // Advance, or finish on the last step. finish() is called directly here — NOT
  // inside a setStep updater — because updater callbacks run during React's
  // render phase, and calling onClose()/setTourOpen there triggers a "setState
  // while rendering another component" error. Reading `step` from state is
  // correct: this handler always runs from an event, after the latest render.
  const next = useCallback(() => {
    if (step >= last) finish();
    else setStep((s) => s + 1);
  }, [step, last, finish]);


  const prev = useCallback(() => setStep((s) => Math.max(0, s - 1)), []);

  // Keyboard: arrows to move, Esc to bail. Bail still marks the tour seen so it
  // doesn't nag on every reload.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, finish, next, prev]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.2 }}
          role="dialog"
          aria-modal="true"
          aria-label="Dashboard tour"
        >
          {/* Scrim. Clicking it treats the tour as skipped-but-seen. */}
          <button
            type="button"
            aria-label="Close tour"
            onClick={finish}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />

          <motion.div
            key={step}
            initial={{ opacity: 0, y: reduceMotion ? 0 : 12, scale: reduceMotion ? 1 : 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : -8 }}
            transition={{ duration: reduceMotion ? 0 : 0.25, ease: "easeOut" }}
            className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950/95 shadow-2xl"
          >
            {/* Emerald wash on the header so it reads as the product's own UI. */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(70%_100%_at_50%_0%,rgba(16,185,129,0.12),transparent_75%)]" />

            <div className="relative p-6">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-[0.3em] text-emerald-400/80">
                  {step === 0
                    ? "Quick tour"
                    : step === last
                      ? "All done"
                      : `Step ${step} of ${last - 1}`}
                </p>
                <button
                  type="button"
                  onClick={finish}
                  className="rounded-md px-2 py-1 text-xs text-neutral-500 transition-colors hover:text-neutral-300"
                >
                  Skip
                </button>
              </div>

              <h2 className="mt-3 text-xl font-semibold tracking-tight text-neutral-50">
                {current.title}
              </h2>

              {guide ? (
                <div className="mt-4 space-y-3 text-sm leading-relaxed">
                  <p className="text-neutral-300">{guide.reading}</p>
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2">
                    <p className="text-emerald-300/90">
                      <span className="font-medium text-emerald-400">Aim for: </span>
                      {guide.healthy}
                    </p>
                  </div>
                  <p className="text-neutral-400">
                    <span className="font-medium text-neutral-300">Move the needle: </span>
                    {guide.action}
                  </p>
                </div>
              ) : (
                <p className="mt-4 text-sm leading-relaxed text-neutral-300">{current.body}</p>
              )}

              {/* Progress dots + controls */}
              <div className="mt-6 flex items-center justify-between">
                <div className="flex gap-1.5" aria-hidden="true">
                  {STEPS.map((_, i) => (
                    <span
                      key={i}
                      className={`h-1.5 rounded-full transition-all ${
                        i === step ? "w-5 bg-emerald-400" : "w-1.5 bg-neutral-700"
                      }`}
                    />
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  {step > 0 && (
                    <button
                      type="button"
                      onClick={prev}
                      className="rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-400 transition-colors hover:text-neutral-200"
                    >
                      Back
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={next}
                    className="rounded-lg bg-emerald-500 px-4 py-1.5 text-sm font-medium text-neutral-950 transition hover:bg-emerald-400 active:scale-[0.98]"
                  >
                    {step === last ? "Got it" : "Next"}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Read once, after mount, whether the tour has been seen. Kept here so the page
 * doesn't have to know the storage key. Returns null until mounted to avoid a
 * hydration mismatch (localStorage is client-only).
 */
export function useTourSeen(): boolean | null {
  const [seen, setSeen] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      setSeen(window.localStorage.getItem(TOUR_SEEN_KEY) === "1");
    } catch {
      setSeen(true); // If storage is unavailable, don't nag.
    }
  }, []);
  return seen;
}
