"use client";

import type { GazeSplit as GazeSplitData } from "@/lib/dashboard";

interface GazeSplitProps {
  split: GazeSplitData;
}

/**
 * Buckets mirror the engine's three gaze states (STRAIGHT | SIDE_OR_UP | DOWN).
 * The spec's four-colour legend assumed separate left/right, which the engine
 * does not emit — "away" covers both, so we use one colour for it.
 */
const SEGMENTS = [
  { key: "center_pct", label: "Center", color: "#10b981" },
  { key: "away_pct", label: "Away (side or up)", color: "#6366f1" },
  { key: "down_pct", label: "Down", color: "#f59e0b" },
] as const;

export default function GazeSplit({ split }: GazeSplitProps) {
  const rows = SEGMENTS.map((s) => ({ ...s, pct: split[s.key] ?? 0 }));
  const total = rows.reduce((sum, r) => sum + r.pct, 0);

  return (
    <div>
      <div
        className="flex h-3 overflow-hidden rounded-full bg-neutral-800"
        role="img"
        aria-label={rows.map((r) => `${r.label} ${Math.round(r.pct)}%`).join(", ")}
      >
        {total > 0 &&
          rows.map(
            (r) =>
              r.pct > 0 && (
                <div
                  key={r.key}
                  style={{ flexBasis: `${r.pct}%`, backgroundColor: r.color }}
                />
              ),
          )}
      </div>

      <ul className="mt-4 space-y-2">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-2 text-xs">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: r.color }}
            />
            <span className="text-neutral-400">{r.label}</span>
            <span className="ml-auto tabular-nums text-neutral-200">
              {Math.round(r.pct)}%
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-xs text-neutral-600">
        Center gaze is your camera eye-line. Below 70% reads as distraction.
      </p>
    </div>
  );
}
