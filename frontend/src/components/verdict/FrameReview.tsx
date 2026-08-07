"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Camera, ChevronRight, Maximize2 } from "lucide-react";
import {
  SEVERITY_TOKENS,
  VIOLATION_TEMPLATES,
  type ViolationBucket,
  type ViolationType,
} from "@/lib/violation-templates";

/**
 * Grouped anomalies on the left, the proof for the selected one on the right.
 *
 * The card-grid version put every pattern's prose on screen at once and ended
 * each card with a row of 48px thumbnails. That buried the one thing that makes
 * this page convincing — the actual frame — under three paragraphs, and repeated
 * the same three headings N times. Here the frame is the biggest element on the
 * page and the copy explaining it sits beside it, one pattern at a time.
 */

const BACKEND_BASE = "http://localhost:8080";

interface FrameReviewProps {
  entries: Array<[ViolationType, ViolationBucket]>;
}

function formatClock(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function FrameReview({ entries }: FrameReviewProps) {
  const [selectedType, setSelectedType] = useState<ViolationType>(entries[0][0]);
  const [frameIndex, setFrameIndex] = useState(0);
  // The frame is evidence, and the inline pane caps it at 340px — too small to
  // examine. Expanding it is the whole point of the page, so it needs a way in
  // and, more importantly, a way back out.
  const [expanded, setExpanded] = useState(false);

  const bucket = entries.find(([t]) => t === selectedType)?.[1] ?? entries[0][1];
  const tpl = VIOLATION_TEMPLATES[selectedType];
  const tokens = SEVERITY_TOKENS[tpl.severity];

  const frames = bucket.evidence_paths;
  // Evidence writes are best-effort, so a bucket can outlive its frames. Clamp
  // instead of trusting an index that survived a selection change.
  const safeIndex = Math.min(frameIndex, Math.max(frames.length - 1, 0));
  const activeFrame = frames[safeIndex] ?? null;

  function select(type: ViolationType) {
    setSelectedType(type);
    setFrameIndex(0);
  }

  // Escape is what people reach for first in a full-screen view, and a viewer
  // that traps you is worse than no viewer at all. The visible Back button
  // stays the primary exit — this just covers the reflex.
  useEffect(() => {
    if (!expanded) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setExpanded(false);
    }
    window.addEventListener("keydown", onKey);
    // The page behind scrolls under the overlay otherwise.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [expanded]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)] gap-4">
      {/* Left rail — every pattern, grouped, one row each */}
      <div className="flex flex-col gap-2">
        {entries.map(([type, b]) => {
          const t = VIOLATION_TEMPLATES[type];
          const tk = SEVERITY_TOKENS[t.severity];
          const active = type === selectedType;

          return (
            <button
              key={type}
              onClick={() => select(type)}
              aria-pressed={active}
              className={`w-full text-left rounded-lg border px-4 py-3 transition-colors cursor-pointer ${
                active
                  ? "border-[var(--color-iris)] bg-[var(--color-surface-2)]"
                  : "border-[var(--color-hairline)] bg-[var(--color-surface)] hover:border-[var(--color-slate)]"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tk.dot}`} />
                <span className="font-display text-[13.5px] font-semibold text-[var(--color-snow)] leading-tight flex-1 min-w-0">
                  {t.title}
                </span>
                <ChevronRight
                  size={14}
                  className={active ? "text-[var(--color-iris)]" : "text-[var(--color-fog)]"}
                />
              </div>
              <div className="flex items-center gap-2 mt-1.5 pl-4">
                <span className="font-mono text-[11px] text-[var(--color-slate)]">{b.count}×</span>
                <span className="text-[var(--color-fog)]">·</span>
                <span className="font-mono text-[11px] text-[var(--color-slate)]">
                  ~{b.approx_total_seconds}s
                </span>
                <span className={`font-mono text-[11px] ml-auto ${tk.text}`}>{b.peak_risk}%</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Right pane — the proof for whatever is selected */}
      <AnimatePresence mode="wait">
        <motion.div
          key={selectedType}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          className={`lift-1 rounded-lg border overflow-hidden ${tokens.ring}`}
        >
          {/* The frame itself, at a size you can actually read */}
          {activeFrame ? (
            <div className="relative bg-black group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${BACKEND_BASE}${activeFrame}`}
                alt={tpl.frameCaption}
                className="w-full max-h-[340px] object-contain"
              />
              <button
                onClick={() => setExpanded(true)}
                aria-label="View frame full screen"
                className="absolute top-3 right-3 flex items-center gap-1.5 rounded-md bg-black/60 hover:bg-black/80 border border-white/15 px-2.5 py-1.5 text-[11px] font-medium text-white transition-colors cursor-pointer"
              >
                <Maximize2 size={12} />
                Expand
              </button>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-4 pt-8 pb-3">
                <p className="text-[13px] font-medium text-white">{tpl.frameCaption}</p>
                <p className="font-mono text-[11px] text-white/60 mt-0.5">
                  {formatClock(bucket.first_at)} → {formatClock(bucket.last_at)} · frame{" "}
                  {safeIndex + 1} of {frames.length}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-12 bg-[var(--color-surface-2)]">
              <Camera size={20} className="text-[var(--color-fog)]" />
              <p className="text-[12.5px] text-[var(--color-slate)]">
                No frame was captured for this pattern.
              </p>
            </div>
          )}

          {/* Frame picker — only earns its space when there's a choice */}
          {frames.length > 1 && (
            <div className="flex gap-1.5 px-4 py-3 overflow-x-auto border-b border-[var(--color-hairline)]">
              {frames.map((path, i) => (
                <button
                  key={`${path}-${i}`}
                  onClick={() => setFrameIndex(i)}
                  aria-label={`Frame ${i + 1}`}
                  aria-pressed={i === safeIndex}
                  className={`w-14 h-14 rounded-md overflow-hidden border shrink-0 transition-colors cursor-pointer ${
                    i === safeIndex
                      ? "border-[var(--color-iris)]"
                      : "border-[var(--color-hairline)] hover:border-[var(--color-slate)]"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`${BACKEND_BASE}${path}`}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          )}

          {/* What it was, why it costs you, what to do instead */}
          <div className="p-5 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-display text-[17px] font-semibold text-[var(--color-snow)] leading-tight">
                {tpl.title}
              </h3>
              <span className={`eyebrow shrink-0 ${tokens.text}`}>{tpl.severity}</span>
            </div>

            <section>
              <span className="eyebrow text-[10px]">What happened</span>
              <p className="text-[13px] text-[var(--color-parchment)] leading-relaxed mt-1.5">
                {tpl.whatHappened(bucket)}
              </p>
            </section>

            <section>
              <span className="eyebrow text-[10px]">Why it matters</span>
              <p className="text-[13px] text-[var(--color-parchment)] leading-relaxed mt-1.5">
                {tpl.whyItMatters}
              </p>
            </section>

            <section className="rounded-lg border border-[var(--color-iris)]/25 bg-[var(--color-surface-2)] px-4 py-3">
              <span className="eyebrow text-[10px] text-[var(--color-iris)]">
                Do this next time
              </span>
              <p className="text-[13px] text-[var(--color-snow)] leading-relaxed mt-1.5">
                {tpl.coachAdvice}
              </p>
            </section>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Full-screen frame viewer */}
      <AnimatePresence>
        {expanded && activeFrame && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            // Clicking the backdrop is the third way out, alongside Back and
            // Escape. The image stops the propagation so clicking the evidence
            // itself doesn't dismiss the thing you're trying to look at.
            onClick={() => setExpanded(false)}
            className="fixed inset-0 z-50 bg-black/92 flex flex-col"
          >
            <div className="flex items-center gap-3 px-5 py-4 shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(false);
                }}
                className="flex items-center gap-2 rounded-md border border-white/15 bg-white/5 hover:bg-white/10 px-3 py-2 text-[12.5px] font-medium text-white transition-colors cursor-pointer"
              >
                <ArrowLeft size={14} />
                Back to report
              </button>
              <p className="font-mono text-[11px] text-white/50 ml-auto">
                Frame {safeIndex + 1} of {frames.length} · Esc to close
              </p>
            </div>

            <div className="flex-1 min-h-0 flex items-center justify-center px-5 pb-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${BACKEND_BASE}${activeFrame}`}
                alt={tpl.frameCaption}
                onClick={(e) => e.stopPropagation()}
                className="max-w-full max-h-full object-contain rounded-lg"
              />
            </div>

            <div className="px-5 pb-6 shrink-0 text-center">
              <p className="text-[13px] font-medium text-white">{tpl.frameCaption}</p>
              <p className="font-mono text-[11px] text-white/50 mt-1">
                {formatClock(bucket.first_at)} → {formatClock(bucket.last_at)}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
