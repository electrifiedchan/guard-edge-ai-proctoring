"use client";

import HeatMap from "@uiw/react-heat-map";
import { useMemo } from "react";
import type { ActivityDay } from "@/lib/dashboard";
import { HEATMAP, densifyActivity, heatmapWidth } from "@/lib/dashboard";

import { cn } from "@/lib/utils";

interface PracticeStreakProps {
  activity: ActivityDay[];
  currentStreak: number;
  bestStreak: number;
  days?: number;
}

export default function PracticeStreak({
  activity,
  currentStreak,
  bestStreak,
  days = 84,
}: PracticeStreakProps) {
  const densified = useMemo(() => densifyActivity(activity, days), [activity, days]);

  const startDate = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (days - 1));
    return d;
  }, [days]);

  const hasAny = densified.some((d) => d.count > 0);

  return (
    <div>
      <p className="mb-3 text-xs tabular-nums text-neutral-400">
        {currentStreak}-day streak · best {bestStreak}
      </p>

      <div className="relative">
        <div
          className={cn("overflow-x-auto", !hasAny && "opacity-40")}
          role="img"
          aria-label={`Practice activity over the last ${days} days. Current streak ${currentStreak} days, best ${bestStreak} days.`}
        >
          <HeatMap
            value={densified}
            startDate={startDate}
            width={heatmapWidth}
            rectSize={HEATMAP.cell}
            space={HEATMAP.gap}

            legendCellSize={0}
            rectProps={{ rx: 3 }}
            panelColors={{
              0: "#18181b",
              1: "#064e3b",
              2: "#047857",
              3: "#10b981",
              5: "#6ee7b7",
            }}
            rectRender={(props, data) => (
              <rect {...props}>
                <title>{`${data.count || 0} session${data.count === 1 ? "" : "s"} on ${data.date}`}</title>
              </rect>
            )}
          />
        </div>

        {!hasAny && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="text-xs text-neutral-400">Your first session starts the grid</p>
          </div>
        )}
      </div>
    </div>
  );
}
