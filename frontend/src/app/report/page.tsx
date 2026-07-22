"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Shield, RotateCcw, Target, Eye, MessageSquare } from "lucide-react";

interface ReportData {
  report: string;
  average_focus_score: number;
  turns_completed: number;
}

export default function ReportPage() {
  const router = useRouter();
  const [data, setData] = useState<ReportData | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("guard_report");
    if (!raw) {
      router.push("/");
      return;
    }
    setData(JSON.parse(raw));
  }, [router]);

  if (!data) {
    return (
      <main className="min-h-screen bg-[var(--color-canvas)] flex items-center justify-center">
        <div className="flex items-center gap-2 text-[var(--color-slate)]">
          <span className="w-2 h-2 rounded-full bg-[var(--color-signal)] pulse-signal" />
          <span className="text-sm">Loading report…</span>
        </div>
      </main>
    );
  }

  const focusScore = Math.round(data.average_focus_score || 0);
  const focusColor =
    focusScore >= 80 ? "text-emerald-400" :
    focusScore >= 50 ? "text-amber-400" :
    "text-rose-500";

  const overallGrade =
    focusScore >= 80 ? "STRONG" :
    focusScore >= 60 ? "MODERATE" :
    "NEEDS WORK";

  const gradeColor =
    focusScore >= 80 ? "text-emerald-400 border-emerald-400/30 bg-emerald-400/[0.06]" :
    focusScore >= 60 ? "text-amber-400 border-amber-400/30 bg-amber-400/[0.06]" :
    "text-rose-400 border-rose-400/30 bg-rose-400/[0.06]";

  return (
    <main className="min-h-screen bg-[var(--color-canvas)] text-[var(--color-parchment)] px-6 py-10 flex flex-col items-center">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-[720px] flex flex-col gap-8"
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-[var(--color-hairline)] pb-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[var(--color-signal-soft)] flex items-center justify-center">
              <Shield size={18} className="text-[var(--color-signal)]" />
            </div>
            <div className="flex flex-col">
              <span className="eyebrow text-[var(--color-signal)]">Session Complete</span>
              <h1 className="text-lg font-semibold text-[var(--color-snow)] tracking-tight">
                Performance Report
              </h1>
            </div>
          </div>
          <span className={`px-3 py-1.5 rounded-lg border text-[12px] font-semibold uppercase tracking-wider ${gradeColor}`}>
            {overallGrade}
          </span>
        </header>

        {/* Metrics row */}
        <div className="grid grid-cols-3 gap-4">
          <div className="lift-1 rounded-lg p-5 flex flex-col items-center gap-2">
            <Eye size={18} className="text-[var(--color-slate)]" />
            <span className="eyebrow">Focus Score</span>
            <span className={`text-[32px] font-display font-semibold tabular leading-none ${focusColor}`}>
              {focusScore}
              <span className="text-[var(--color-fog)] text-[18px] font-medium ml-0.5">%</span>
            </span>
          </div>
          <div className="lift-1 rounded-lg p-5 flex flex-col items-center gap-2">
            <MessageSquare size={18} className="text-[var(--color-slate)]" />
            <span className="eyebrow">Turns</span>
            <span className="text-[32px] font-display font-semibold tabular leading-none text-[var(--color-snow)]">
              {data.turns_completed}
            </span>
          </div>
          <div className="lift-1 rounded-lg p-5 flex flex-col items-center gap-2">
            <Target size={18} className="text-[var(--color-slate)]" />
            <span className="eyebrow">Processing</span>
            <span className="text-[18px] font-semibold text-[var(--color-snow)]">Edge</span>
          </div>
        </div>

        {/* AI Report */}
        <div className="lift-1 rounded-lg p-6">
          <span className="eyebrow mb-4 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-signal)]" />
            AI Coach Feedback
          </span>
          <div className="prose prose-invert prose-sm max-w-none">
            <p className="text-[13px] leading-relaxed text-[var(--color-parchment)] whitespace-pre-wrap font-mono">
              {data.report}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={() => {
              sessionStorage.removeItem("guard_report");
              sessionStorage.removeItem("guard_session");
              router.push("/");
            }}
            className="h-10 px-5 rounded-md bg-[var(--color-signal)] text-[var(--color-canvas)] text-sm font-semibold hover:brightness-110 transition-all cursor-pointer flex items-center gap-2"
          >
            <RotateCcw size={14} />
            New Session
          </button>
        </div>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-center">
          <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md text-[11px] font-medium border border-[var(--color-hairline)] bg-[var(--color-surface)] text-[var(--color-slate)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-signal)] pulse-signal" />
            Local · Edge Processing · No data leaves your device
          </span>
        </div>
      </motion.div>
    </main>
  );
}
