"use client";

import { AnimatedGrade } from "@/components/landing/verdict/AnimatedGrade";

/**
 * VERDICT · LLAMA — Llama 3.1 Coach, a local LLM judge that grades each answer.
 *
 * Layout pattern: Linear activity-feed rows (label left, grade badge right, thin
 * hairline divider between rows) → v0 credit-score color tiers on the grades →
 * Sendbird-style italic verdict summary below the rows.
 *
 * Each grade is an <AnimatedGrade>: it flickers slot-machine style then settles
 * on the real grade, staggered per row and looping every ~5s so the panel reads
 * like a live telemetry readout. Theme: VERDICT domain = emerald (not sky).
 * No purple/pink, no gradients — emerald + amber/red tiers + neutrals only.
 */

const ROWS: { label: string; grade: string; delay: number }[] = [
  { label: "Composure", grade: "A", delay: 0 },
  { label: "Clarity", grade: "B+", delay: 400 },
  { label: "Confidence", grade: "A-", delay: 800 },
];

export default function CellLlama() {
  return (
    <div className="flex flex-col gap-3 p-8 h-full">
      <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500 whitespace-nowrap">
        Verdict · Llama
      </span>

      {/* inset panel — the focal data element (two-tier elevation) */}
      <div className="flex-1 rounded-xl bg-neutral-950 border border-white/[0.06] px-4 py-3 flex flex-col justify-center">
        {/* scored competency rows — Linear-style feed with hairline dividers */}
        {ROWS.map(({ label, grade, delay }, i) => (
          <div
            key={label}
            className={`flex items-center justify-between py-1.5 ${
              i < ROWS.length - 1 ? "border-b border-white/[0.08]" : ""
            }`}
          >
            <span className="font-mono text-xs uppercase tracking-wider text-neutral-300">
              {label}
            </span>
            <AnimatedGrade final={grade} delay={delay} />
          </div>
        ))}

        {/* Sendbird-style italic verdict summary */}
        <p className="mt-2.5 font-sans text-xs italic tracking-normal text-neutral-500">
          "Strong eye contact. Pace slightly fast under pressure."
        </p>
      </div>

      {/* caption */}
      <p className="font-sans text-[13px] tracking-normal leading-snug text-neutral-400">
        Local LLM judge scores every answer — no data leaves your device.
      </p>
    </div>
  );
}
