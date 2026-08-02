"use client";

import Link from "next/link";
import type { DashboardSummary } from "@/lib/dashboard";
import { TALKING_BAND } from "@/lib/dashboard";

import Panel from "./Panel";
import StatCard from "./StatCard";
import ComposureTrend from "./ComposureTrend";
import ReadinessRing from "./ReadinessRing";
import GazeSplit from "./GazeSplit";

/**
 * Sample data for the blurred preview only. Showing the payoff converts far
 * better than an empty box — it is inert (pointer-events-none) and badged.
 */
const SAMPLE: Pick<DashboardSummary, "metrics" | "composure_trend" | "readiness" | "gaze_split"> = {
  metrics: [
    { key: "eye_contact_pct", label: "Eye contact", value: 74, unit: "%", delta: 6, spark: [58, 61, 63, 66, 70, 72, 74] },
    { key: "talking_pct", label: "Speaking time", value: 48, unit: "%", delta: -3, spark: [61, 58, 55, 52, 50, 49, 48] },
    { key: "longest_focus_streak_s", label: "Longest focus streak", value: 195, unit: "s", delta: 24, spark: [90, 110, 130, 150, 165, 180, 195] },
    { key: "recovery_count", label: "Recoveries", value: 4, unit: "", delta: 1, spark: [1, 1, 2, 2, 3, 3, 4] },
  ],
  composure_trend: [
    { session_id: "sample-1", date: "2026-07-01", avg_composure: 58, min_composure: 31 },
    { session_id: "sample-2", date: "2026-07-04", avg_composure: 63, min_composure: 38 },
    { session_id: "sample-3", date: "2026-07-08", avg_composure: 67, min_composure: 46 },
    { session_id: "sample-4", date: "2026-07-12", avg_composure: 71, min_composure: 54 },
    { session_id: "sample-5", date: "2026-07-16", avg_composure: 76, min_composure: 62 },
    { session_id: "sample-6", date: "2026-07-21", avg_composure: 79, min_composure: 68 },
  ],
  readiness: { score: 79, delta_vs_prev: 5, band: "Interview Ready" },
  gaze_split: { center_pct: 76, away_pct: 15, down_pct: 9 },
};

export default function EmptyDashboard() {
  return (
    <div className="space-y-8">
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-8 text-center backdrop-blur">
        <h2 className="text-2xl font-semibold text-neutral-100">Let&apos;s get your baseline.</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-neutral-400">
          Run one 5-minute practice session and this page fills with your composure curve,
          eye-contact trend, and the moments that mattered.
        </p>
        <Link
          href="/upload"
          className="mt-6 inline-block rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-neutral-950 transition-colors hover:bg-emerald-400"
        >
          Start your first session
        </Link>
      </div>

      <div className="relative">
        <span className="absolute -top-3 left-4 z-10 rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[11px] text-neutral-400">
          Sample
        </span>

        <div
          className="pointer-events-none space-y-6 opacity-50"
          aria-hidden="true"
          inert
        >
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
            {SAMPLE.metrics.map((m) => (
              <StatCard
                key={m.key}
                metric={m}
                targetBand={m.key === "talking_pct" ? TALKING_BAND : undefined}
              />

            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Panel title="Composure over time" subtitle="Average and lowest point per session">
                <ComposureTrend trend={SAMPLE.composure_trend} />
              </Panel>
            </div>
            <div>
              <Panel title="Readiness">
                <ReadinessRing readiness={SAMPLE.readiness} />
              </Panel>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Panel title="Where your eyes go">
                {SAMPLE.gaze_split && <GazeSplit split={SAMPLE.gaze_split} />}
              </Panel>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
