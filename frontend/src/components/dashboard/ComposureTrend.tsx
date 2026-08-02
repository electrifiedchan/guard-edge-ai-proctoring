"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useReducedMotion } from "framer-motion";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrendPoint } from "@/lib/dashboard";
import { shortDate } from "@/lib/dashboard";
import { cn } from "@/lib/utils";

interface ComposureTrendProps {
  trend: TrendPoint[];
}

type Range = "7d" | "30d" | "all";

const RANGES: { key: Range; label: string; take: number | null }[] = [
  { key: "7d", label: "7d", take: 7 },
  { key: "30d", label: "30d", take: 30 },
  { key: "all", label: "All", take: null },
];

/**
 * A trend needs at least three points to read as a line rather than a stray
 * dot floating in an empty grid (which looks like a rendering failure).
 */
const MIN_TREND_POINTS = 3;

/** Matches the chart height so switching ranges never shifts the layout. */
const CHART_H = "h-64";

interface TooltipPayloadItem {
  payload: TrendPoint;
}

function DarkTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs">
      <p className="mb-1 text-neutral-300">{shortDate(p.date)}</p>
      <p className="tabular-nums text-emerald-400">Average {Math.round(p.avg_composure)}</p>
      <p className="tabular-nums text-neutral-400">
        Lowest point {Math.round(p.min_composure)}
      </p>
    </div>
  );
}

export function RangeToggle({
  value,
  onChange,
}: {
  value: Range;
  onChange: (r: Range) => void;
}) {
  return (
    <div
      className="flex shrink-0 rounded-lg border border-neutral-800 p-0.5"
      role="group"
      aria-label="Trend range"
    >
      {RANGES.map((r) => (
        <button
          key={r.key}
          type="button"
          onClick={() => onChange(r.key)}
          aria-pressed={value === r.key}
          className={cn(
            "rounded-md px-2 py-1 text-xs transition-colors",
            value === r.key
              ? "bg-neutral-800 text-neutral-100"
              : "text-neutral-500 hover:text-neutral-300",
          )}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Shown instead of the chart when the selected range holds too few sessions.
 * Reads as a deliberate state rather than a broken graph.
 */
function NotEnoughData({ count, range }: { count: number; range: Range }) {
  const windowLabel = range === "all" ? "yet" : `in the last ${range === "7d" ? "7" : "30"} days`;
  return (
    <div
      className={cn(
        CHART_H,
        "flex w-full flex-col items-center justify-center gap-1.5 rounded-lg",
        "border border-dashed border-neutral-800/80 text-center",
      )}
    >
      <p className="text-sm text-neutral-400">Not enough sessions {windowLabel}</p>
      <p className="max-w-[22rem] text-xs leading-relaxed text-neutral-600">
        {count === 0
          ? "A trend needs a few sessions to compare against."
          : `${count} recorded. A trend line needs at least ${MIN_TREND_POINTS} to show direction.`}
      </p>
    </div>
  );
}

export default function ComposureTrend({ trend }: ComposureTrendProps) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [range, setRange] = useState<Range>("30d");


  const data = useMemo(() => {
    const take = RANGES.find((r) => r.key === range)?.take ?? null;
    return take ? trend.slice(-take) : trend;
  }, [trend, range]);

  const enoughPoints = data.length >= MIN_TREND_POINTS;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        {/* The legend describes the chart, so it hides with the chart. The range
            toggle must stay — it is the only way back out of an empty range. */}
        {enoughPoints ? (
          <div className="flex items-center gap-4 text-xs text-neutral-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Average
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500/40" />
              Lowest point
            </span>
          </div>
        ) : (
          <span />
        )}
        <RangeToggle value={range} onChange={setRange} />
      </div>

      {enoughPoints ? (
        <div
          className={cn(CHART_H, "w-full")}
          role="img"
          aria-label={`Composure across ${data.length} sessions. Average and lowest point per session.`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
              onClick={(state) => {
                // Recharts v3 dropped `activePayload` from this handler's type and
                // exposes `activeIndex` instead, so resolve the point from our own
                // data array rather than the event payload.
                const raw = (state as { activeIndex?: number | string } | null)?.activeIndex;
                const idx = typeof raw === "string" ? Number.parseInt(raw, 10) : raw;
                if (idx === undefined || idx === null || Number.isNaN(idx)) return;
                const point = data[idx];
                if (point?.session_id) {
                  router.push(`/replay?session=${encodeURIComponent(point.session_id)}`);
                }
              }}
            >
              <defs>
                <linearGradient id="avgGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="minGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.14} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid vertical={false} stroke="#27272a" />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                minTickGap={32}
                tickFormatter={shortDate}
                tick={{ fill: "#737373", fontSize: 11 }}
              />
              <YAxis domain={[0, 100]} hide />
              <ReferenceLine
                y={70}
                strokeDasharray="4 4"
                stroke="#34d399"
                label={{
                  value: "Interview ready",
                  fill: "#34d399",
                  fontSize: 10,
                  position: "insideTopRight",
                }}
              />
              <Tooltip content={<DarkTooltip />} cursor={{ stroke: "#3f3f46" }} />

              <Area
                type="monotone"
                dataKey="min_composure"
                stroke="#10b981"
                strokeOpacity={0.4}
                strokeWidth={1.5}
                fill="url(#minGrad)"
                dot={false}
                isAnimationActive={!reduceMotion}
              />

              <Area
                type="monotone"
                dataKey="avg_composure"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#avgGrad)"
                dot={false}
                activeDot={{ r: 4, fill: "#6ee7b7", stroke: "#0a0a0a", cursor: "pointer" }}
                isAnimationActive={!reduceMotion}
              />

            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <NotEnoughData count={data.length} range={range} />
      )}

      {enoughPoints && (
        <p className="mt-2 text-xs text-neutral-600">
          The gap between average and lowest point narrowing is the real progress signal.
        </p>
      )}
    </div>
  );
}
