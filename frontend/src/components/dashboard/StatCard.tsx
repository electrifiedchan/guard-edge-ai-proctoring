"use client";

import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { useId, type ReactNode } from "react";
import type { Metric } from "@/lib/dashboard";
import { formatMetric } from "@/lib/dashboard";
import { cn } from "@/lib/utils";
import CountUp from "./CountUp";

interface StatCardProps {
  /** Absent while loading, on error, or before enough sessions exist. */
  metric?: Metric | null;
  /**
   * Static fallback label so the card is never an anonymous box — it must stay
   * readable in the loading and error states too.
   */
  label?: string;
  loading?: boolean;
  error?: boolean;
  /**
   * Inclusive target range for metrics where neither direction is automatically
   * good (speaking time: 35-60%). Quality is distance from the band, so moving
   * within it is neither a win nor a loss.
   */
  targetBand?: readonly [number, number];
}

const MIN_SPARK_POINTS = 6;
const DELTA_DEADZONE = 0.5;

/** 0 when the value sits inside the band, else the gap to the nearest edge. */
function distanceFromBand(value: number, [lo, hi]: readonly [number, number]) {
  if (value < lo) return lo - value;
  if (value > hi) return value - hi;
  return 0;
}


/**
 * Fixed shell shared by all four states so the row never shifts height when
 * data arrives.
 */
function Shell({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    // Surface intentionally mirrors Panel: same radius, border, gradient and
    // inset ring, so stat cards and panels read as one material.
    <section
      aria-label={title}
      className={cn(
        "group relative overflow-hidden rounded-xl p-4 backdrop-blur",
        "border border-neutral-800/80 bg-gradient-to-b from-neutral-900/70 to-neutral-900/40",
        "ring-1 ring-inset ring-white/[0.04]",
        "transition-colors hover:border-neutral-700/80",
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"
      />
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-neutral-400">{title}</p>
        {badge}
      </div>
      {children}
    </section>
  );
}

export default function StatCard({
  metric,
  label,
  loading = false,
  error = false,
  targetBand,
}: StatCardProps) {

  const gradientId = useId();
  const title = metric?.label ?? label ?? "Metric";

  if (loading) {
    return (
      <Shell
        title={title}
        badge={<span className="h-4 w-12 animate-pulse rounded-full bg-neutral-800" />}
      >
        <div className="mt-2 h-9 w-20 animate-pulse rounded bg-neutral-800" />
        <div className="mt-2 h-16 animate-pulse rounded-lg bg-neutral-800/70" />
      </Shell>
    );
  }

  if (error) {
    // Deliberately says almost nothing. The reason lives once in the page-level
    // banner; four cards repeating it reads as four separate failures.
    return (
      <Shell title={title}>
        <p className="mt-2 text-3xl font-semibold tabular-nums text-neutral-700">—</p>
        <div className="relative mt-2 h-16">
          <div className="h-full w-full animate-pulse rounded-lg bg-neutral-800/70 opacity-40" />
          <span className="absolute inset-0 grid place-items-center text-xs text-neutral-600">
            offline
          </span>
        </div>
      </Shell>
    );
  }


  if (!metric) {
    return (
      <Shell title={title}>
        <p className="mt-2 text-3xl font-semibold tabular-nums text-neutral-700">—</p>
        <div className="mt-2 flex h-16 items-end">
          <span className="text-xs text-neutral-600">Needs more sessions</span>
        </div>
      </Shell>
    );
  }

  const flat = Math.abs(metric.delta) < DELTA_DEADZONE;

  let tone: "neutral" | "positive" | "negative";
  if (flat) {
    tone = "neutral";
  } else if (targetBand) {
    // Direction alone is meaningless here: 70%→66% moves toward the band, while
    // 40%→36% moves out of it toward too-quiet. Both are "down". Compare the
    // distance from the band instead, and stay neutral while inside it.
    const now = distanceFromBand(metric.value, targetBand);
    const before = distanceFromBand(metric.value - metric.delta, targetBand);
    tone = now === before ? "neutral" : now < before ? "positive" : "negative";
  } else {
    tone = metric.delta > 0 ? "positive" : "negative";
  }


  const pillStyles = {
    neutral: "bg-neutral-800/80 text-neutral-400",
    positive: "bg-emerald-500/10 text-emerald-400",
    negative: "bg-rose-500/10 text-rose-400",
  }[tone];

  const sparkColor = {
    neutral: "text-neutral-500",
    positive: "text-emerald-400",
    negative: "text-rose-400",
  }[tone];

  const deltaLabel = `${metric.delta > 0 ? "+" : ""}${metric.delta.toFixed(
    Math.abs(metric.delta) < 10 ? 1 : 0,
  )}${metric.unit === "%" ? "%" : ""}`;

  const sparkData = (metric.spark ?? []).map((v, i) => ({ i, v }));
  const hasSpark = sparkData.length >= MIN_SPARK_POINTS;

  return (
    <Shell
      title={title}
      badge={
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums",
            pillStyles,
          )}
        >
          {flat ? "steady" : deltaLabel}
        </span>
      }
    >
      <p className="mt-2 text-3xl font-semibold tabular-nums text-neutral-50">
        {/* Formatting each frame through formatMetric keeps units and the
            seconds-to-duration conversion correct mid-animation. */}
        <CountUp value={metric.value} format={(n) => formatMetric({ ...metric, value: n })} />
      </p>

      <div className={cn("mt-2 h-16", sparkColor)}>
        {hasSpark ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="currentColor" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke="currentColor"
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-end">
            <span className="text-xs text-neutral-600">Needs more sessions</span>
          </div>
        )}
      </div>
    </Shell>
  );
}
