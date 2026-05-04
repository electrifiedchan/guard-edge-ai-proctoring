"use client";

import { motion } from "framer-motion";
import {
  SEVERITY_TOKENS,
  VIOLATION_TEMPLATES,
  type ViolationBucket,
  type ViolationType,
} from "@/lib/violation-templates";

interface ViolationCardProps {
  type: ViolationType;
  bucket: ViolationBucket;
  index: number;
}

const BACKEND_BASE = "http://localhost:8080";

function formatClock(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return iso;
  }
}

export default function ViolationCard({ type, bucket, index }: ViolationCardProps) {
  const tpl = VIOLATION_TEMPLATES[type];
  const tokens = SEVERITY_TOKENS[tpl.severity];
  const evidence = bucket.evidence_paths.slice(0, 4);

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.08 * index, ease: "easeOut" }}
      className={`lift-1 rounded-lg p-5 flex flex-col gap-4 border ${tokens.ring}`}
    >
      {/* Header row */}
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className={`w-1.5 h-1.5 rounded-full ${tokens.dot}`} />
          <h3 className="font-display text-[15px] font-semibold text-[var(--color-snow)] leading-tight">
            {tpl.title}
          </h3>
        </div>
        <span className={`eyebrow ${tokens.text}`}>{tpl.severity}</span>
      </header>

      {/* Stat strip */}
      <div className="grid grid-cols-3 gap-3 pb-1">
        <div className="flex flex-col">
          <span className="eyebrow text-[10px]">Events</span>
          <span className="font-display text-[20px] font-semibold tabular text-[var(--color-snow)] leading-none mt-1">
            {bucket.count}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="eyebrow text-[10px]">~Cumulative</span>
          <span className="font-display text-[20px] font-semibold tabular text-[var(--color-snow)] leading-none mt-1">
            {bucket.approx_total_seconds}
            <span className="text-[12px] text-[var(--color-fog)] ml-0.5">s</span>
          </span>
        </div>
        <div className="flex flex-col">
          <span className="eyebrow text-[10px]">Peak risk</span>
          <span className={`font-display text-[20px] font-semibold tabular leading-none mt-1 ${tokens.text}`}>
            {bucket.peak_risk}
            <span className="text-[12px] text-[var(--color-fog)] ml-0.5">%</span>
          </span>
        </div>
      </div>

      {/* Time window */}
      <div className="flex items-center gap-2 text-[11px] font-mono text-[var(--color-fog)]">
        <span>{formatClock(bucket.first_at)}</span>
        <span className="flex-1 h-px bg-[var(--color-hairline)]" />
        <span>{formatClock(bucket.last_at)}</span>
      </div>

      {/* Body — what / why / advice */}
      <div className="flex flex-col gap-3 pt-1">
        <section>
          <span className="eyebrow text-[10px]">What happened</span>
          <p className="text-[12.5px] text-[var(--color-parchment)] leading-relaxed mt-1.5">
            {tpl.whatHappened(bucket)}
          </p>
        </section>
        <section>
          <span className="eyebrow text-[10px]">Why it matters</span>
          <p className="text-[12.5px] text-[var(--color-parchment)] leading-relaxed mt-1.5">
            {tpl.whyItMatters}
          </p>
        </section>
        <section className="rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface-2)] px-3 py-2.5">
          <span className="eyebrow text-[10px] text-[var(--color-iris)]">Coach advice</span>
          <p className="text-[12.5px] text-[var(--color-snow)] leading-relaxed mt-1.5">
            {tpl.coachAdvice}
          </p>
        </section>
      </div>

      {/* Evidence thumbs */}
      {evidence.length > 0 && (
        <div className="flex items-center gap-2 pt-1">
          <span className="eyebrow text-[10px]">Evidence</span>
          <div className="flex gap-1.5 ml-1">
            {evidence.map((path, i) => (
              <a
                key={`${path}-${i}`}
                href={`${BACKEND_BASE}${path}`}
                target="_blank"
                rel="noreferrer"
                className="w-12 h-12 rounded-md overflow-hidden border border-[var(--color-hairline)] hover:border-[var(--color-iris)] transition-colors block"
                title="Open evidence frame"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${BACKEND_BASE}${path}`}
                  alt="Evidence frame"
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </a>
            ))}
          </div>
        </div>
      )}
    </motion.article>
  );
}
