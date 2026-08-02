"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, ChevronRight } from "lucide-react";
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
            <div className="relative bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${BACKEND_BASE}${activeFrame}`}
                alt={tpl.frameCaption}
                className="w-full max-h-[340px] object-contain"
              />
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
    </div>
  );
}
