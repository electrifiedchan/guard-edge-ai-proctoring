"use client";

import { useTheme } from "@/lib/theme";

/**
 * Theme-aware colours for canvas and SVG-chart internals.
 *
 * Everything styled by className flips for free — Tailwind v4 compiles palette
 * utilities to var(--color-*), and globals.css redefines those vars under
 * `.light`. But Recharts takes colours as *props* (`stroke="#27272a"`,
 * `tick={{ fill: "#737373" }}`), and 2D canvas takes them as `ctx.fillStyle`.
 * Those are plain JS strings the cascade never sees, so they'd stay dark-tuned
 * on a white page — grid lines glaring, axis labels washed out.
 *
 * Hence this hook: the same roles, resolved in JS.
 *
 * Keep these values in sync with the `.light` block in globals.css. They are
 * duplicated rather than read back via getComputedStyle because doing that per
 * render would thrash layout on every chart tick.
 */
export function useChartColors() {
  const { theme } = useTheme();
  const light = theme === "light";

  return {
    /** Cartesian grid + axis lines — must recede, never compete with data. */
    grid: light ? "#e6e3e0" : "#27272a",
    axis: light ? "#d2cfcb" : "#404040",
    /** Tick labels: metadata, but still has to pass contrast as small text. */
    tick: light ? "#6b6864" : "#737373",
    /** Hover cursor line. */
    cursor: light ? "#c2beba" : "#525252",

    /** Primary series — GUARD emerald, darkened for white backgrounds. */
    series: light ? "#00875a" : "#10b981",
    seriesBright: light ? "#009e6a" : "#6ee7b7",
    /** Threshold / reference lines ("interview ready"). */
    threshold: light ? "#00754e" : "#34d399",

    /** Fill behind an active dot — matches the card it sits on. */
    dotFill: light ? "#ffffff" : "#171717",

    /** Tooltip surface. */
    tooltipBg: light ? "rgba(255,255,255,0.96)" : "rgba(23,23,23,0.92)",
    tooltipBorder: light ? "#e6e3e0" : "#262626",
    tooltipText: light ? "#26241f" : "#d4d4d4",

    /**
     * Heatmap ramp, coldest → hottest. Dark mode climbs toward brightness;
     * light mode climbs toward saturation, because on white a *lighter* cell
     * reads as less data, not more.
     */
    heat: light
      ? { 0: "#eeece9", 1: "#b8e2ce", 2: "#6cc4a1", 3: "#00875a", 5: "#00603f" }
      : { 0: "#18181b", 1: "#064e3b", 2: "#047857", 3: "#10b981", 5: "#6ee7b7" },

    /** Categorical segments (gaze split). Distinct in both themes. */
    categorical: light
      ? { center: "#00875a", away: "#4338ca", down: "#a3520a" }
      : { center: "#10b981", away: "#6366f1", down: "#f59e0b" },

    /** Live-video overlays: good / warning / bad. */
    status: light
      ? { good: "#00875a", warn: "#a3520a", bad: "#c8232a" }
      : { good: "#00e5a0", warn: "#f5a623", bad: "#ff4444" },
  };
}

export type ChartColors = ReturnType<typeof useChartColors>;
