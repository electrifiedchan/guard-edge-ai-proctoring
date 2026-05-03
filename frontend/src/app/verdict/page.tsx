"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import ViolationCard from "@/components/ViolationCard";
import { VIOLATION_TEMPLATES, type SessionBreakdown, type ViolationType } from "@/lib/violation-templates";

interface VerdictData {
  candidate_id: string;
  total_violations: number;
  risk_score: number;
  report: string;
  breakdown?: SessionBreakdown;
}

function riskTone(score: number): { label: string; cls: string } {
  if (score >= 80) return { label: "Critical", cls: "text-[var(--color-danger)]" };
  if (score >= 50) return { label: "Elevated", cls: "text-[var(--color-amber)]" };
  if (score >= 20) return { label: "Caution",  cls: "text-[var(--color-warn)]" };
  return { label: "Clean", cls: "text-[var(--color-signal)]" };
}

export default function VerdictPage() {
  const router = useRouter();
  const [verdictData, setVerdictData] = useState<VerdictData | null>(null);

  useEffect(() => {
    const data = localStorage.getItem("verdictData");
    if (data) {
      setVerdictData(JSON.parse(data));
    } else {
      router.push("/");
    }
  }, [router]);

  if (!verdictData) {
    return (
      <div className="min-h-screen bg-[var(--color-canvas)] flex items-center justify-center">
        <span className="font-mono text-[12px] text-[var(--color-slate)]">Loading verdict…</span>
      </div>
    );
  }

  const tone = riskTone(verdictData.risk_score);
  const reportParagraphs = (verdictData.report || "")
    .split("\n\n")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const breakdown = verdictData.breakdown;
  const buckets = breakdown?.violations_by_type ?? {};
  const violationEntries = (Object.entries(buckets) as Array<[ViolationType, NonNullable<typeof buckets[ViolationType]>]>)
    .filter(([, b]) => b && b.count > 0)
    .sort(([, a], [, b]) => b.peak_risk - a.peak_risk);

  return (
    <main className="min-h-screen bg-[var(--color-canvas)] text-[var(--color-parchment)] px-6 py-10">
      <div className="max-w-[1200px] mx-auto">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col gap-3 pb-7 border-b border-[var(--color-hairline)]"
        >
          <div className="flex items-center gap-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-iris)] pulse-iris" />
            <span className="eyebrow">Session complete · coaching report</span>
          </div>
          <h1 className="font-display text-[36px] md:text-[44px] font-semibold tracking-tight text-[var(--color-snow)] leading-[1.05]">
            Here&apos;s what we noticed,
            <span className="text-[var(--color-slate)]"> point by point.</span>
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="font-mono text-[11px] px-2 py-1 rounded-md border border-[var(--color-hairline)] bg-[var(--color-surface)] text-[var(--color-slate)]">
              {verdictData.candidate_id}
            </span>
            {breakdown?.session_window?.first_event_at && (
              <span className="font-mono text-[11px] text-[var(--color-fog)]">
                first flag at {new Date(breakdown.session_window.first_event_at).toLocaleTimeString()}
              </span>
            )}
          </div>
        </motion.header>

        {/* Top stat row */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-7">
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 }}
            className="lift-1 rounded-xl p-5"
          >
            <span className="eyebrow">Peak risk</span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className={`font-display text-[42px] font-semibold tabular leading-none ${tone.cls}`}>
                {verdictData.risk_score}
              </span>
              <span className="text-[14px] text-[var(--color-fog)]">%</span>
              <span className={`ml-auto eyebrow ${tone.cls}`}>{tone.label}</span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="lift-1 rounded-xl p-5"
          >
            <span className="eyebrow">Flagged events</span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="font-display text-[42px] font-semibold tabular leading-none text-[var(--color-snow)]">
                {breakdown?.total_events ?? verdictData.total_violations}
              </span>
              <span className="text-[12px] text-[var(--color-fog)] ml-auto">across {violationEntries.length} pattern(s)</span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="lift-1 rounded-xl p-5"
          >
            <span className="eyebrow">Dominant pattern</span>
            <div className="mt-2">
              {violationEntries.length > 0 ? (
                <span className="font-display text-[18px] font-semibold tracking-tight text-[var(--color-snow)] leading-tight">
                  {VIOLATION_TEMPLATES[violationEntries[0][0]].title}
                </span>
              ) : (
                <span className="font-display text-[18px] font-semibold text-[var(--color-signal)]">
                  Clean session
                </span>
              )}
            </div>
          </motion.div>
        </section>

        {/* Coach narrative */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="lift-1 haze rounded-xl p-7 mt-6 relative overflow-hidden"
        >
          <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-[var(--color-iris)]/50 to-transparent" />
          <div className="flex items-center gap-2.5 mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-iris)]" />
            <span className="eyebrow">Your coach says</span>
          </div>
          <div className="flex flex-col gap-4 max-w-[78ch]">
            {reportParagraphs.map((para, idx) => (
              <motion.p
                key={idx}
                initial={{ opacity: 0, filter: "blur(3px)" }}
                animate={{ opacity: 1, filter: "blur(0px)" }}
                transition={{ duration: 0.45, delay: 0.35 + idx * 0.18 }}
                className="text-[14.5px] text-[var(--color-parchment)] leading-[1.65]"
              >
                {para}
              </motion.p>
            ))}
          </div>
        </motion.section>

        {/* Detailed breakdown */}
        <section className="mt-10">
          <div className="flex items-end justify-between mb-4">
            <div className="flex flex-col gap-1">
              <span className="eyebrow">Detailed breakdown</span>
              <h2 className="font-display text-[22px] font-semibold tracking-tight text-[var(--color-snow)]">
                Every pattern we logged, with the fix.
              </h2>
            </div>
            <span className="font-mono text-[11px] text-[var(--color-fog)]">
              sorted by peak risk
            </span>
          </div>

          {violationEntries.length === 0 ? (
            <div className="lift-1 rounded-xl p-8 text-center">
              <span className="eyebrow text-[var(--color-signal)]">Clean run</span>
              <p className="text-[14px] text-[var(--color-parchment)] mt-2">
                No behavioural patterns crossed the warning threshold this session. Hold this baseline.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {violationEntries.map(([type, bucket], idx) => (
                <ViolationCard key={type} type={type} bucket={bucket} index={idx} />
              ))}
            </div>
          )}
        </section>

        {/* Footer action */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="mt-12 flex items-center justify-between border-t border-[var(--color-hairline)] pt-6"
        >
          <span className="font-mono text-[11px] text-[var(--color-fog)]">
            Local · 127.0.0.1 · session report
          </span>
          <button
            onClick={() => router.push("/")}
            className="h-9 px-4 rounded-md bg-[var(--color-iris)] text-white text-[12px] font-medium tracking-tight hover:bg-[var(--color-iris-hover)] active:bg-[var(--color-iris-press)] transition-colors cursor-pointer"
          >
            Return to dashboard
          </button>
        </motion.div>
      </div>
    </main>
  );
}