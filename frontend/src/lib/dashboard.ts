// Types mirror backend/core_memory/timeline.py::get_dashboard_summary exactly.
// Top-level keys verified against backend/test_dashboard_summary.py::TOP_LEVEL_KEYS.

const API = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

export type MetricKey =
  | "eye_contact_pct"
  | "talking_pct"
  | "longest_focus_streak_s"
  | "recovery_count";

export interface Metric {
  key: MetricKey;
  label: string;
  value: number;
  unit: "%" | "s" | "";
  delta: number;
  spark: number[];
}

/**
 * Healthy share of an interview spent speaking. A product judgment, not a
 * backend value: timeline.py returns talking_pct raw and bands it nowhere.
 * Below the floor reads as under-answering, above the ceiling as crowding out
 * the interviewer, so both edges are failures and the middle is the goal.
 */
export const TALKING_BAND = [35, 60] as const;

export interface Readiness {

  score: number;
  delta_vs_prev: number;
  band: "Building" | "Improving" | "Interview Ready" | "Sharp";
}

export interface Totals {
  sessions: number;
  practice_seconds: number;
  current_streak_days: number;
  /** NOTE: backend emits best_streak_days, spec called it longest_streak_days. */
  best_streak_days: number;
}

export interface TrendPoint {
  session_id: string;
  date: string; // ISO yyyy-mm-dd
  avg_composure: number;
  min_composure: number;
}

export interface ActivityDay {
  date: string; // ISO yyyy-mm-dd
  count: number;
}

/** Engine emits STRAIGHT | SIDE_OR_UP | DOWN — three buckets, not four. */
export interface GazeSplit {
  center_pct: number;
  away_pct: number;
  down_pct: number;
}

export interface RecentSession {
  session_id: string;
  /** ISO datetime. Backend key is started_at, not date. */
  started_at: string;
  duration_s: number;
  avg_composure: number;
  headline: string;
  recovery_count: number;
}

export interface FocusArea {
  key: string;
  title: string;
  detail: string;
  cta_session_id: string;
}

export interface DashboardSummary {
  candidate: {
    candidate_id: string;
    display_name: string | null;
    preferred_name: string | null;
  };
  totals: Totals;
  readiness: Readiness | null;
  metrics: Metric[];
  composure_trend: TrendPoint[];
  activity: ActivityDay[];
  gaze_split: GazeSplit | null;
  recent_sessions: RecentSession[];
  focus_area: FocusArea | null;
}

export async function fetchSummary(
  candidateId: string,
  days = 84,
): Promise<DashboardSummary | null> {
  try {
    const res = await fetch(
      `${API}/api/v1/dashboard/summary?candidate_id=${encodeURIComponent(candidateId)}&days=${days}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    return (await res.json()) as DashboardSummary;
  } catch {
    return null;
  }
}

/**
 * Heatmap geometry lives here rather than inside either component, because the
 * loading skeleton and the real grid have to agree *exactly*. A skeleton with a
 * different shape than its loaded content guarantees the page lurches the
 * moment data lands — which is the one thing the fixed-height rule forbids.
 */
export const HEATMAP = {
  cell: 13,
  gap: 3,
  rows: 7,
  /** 84 days is 12 whole weeks; +1 column because the range rarely starts on a Sunday. */
  cols: 13,
} as const;

/** Left gutter the library reserves for its weekday labels. */
const HEATMAP_GUTTER = 28;

/** Sized to the content so the panel has no dead canvas to the right. */
export const heatmapWidth = HEATMAP.cols * (HEATMAP.cell + HEATMAP.gap) + HEATMAP_GUTTER;

/** Fill missing days with count 0 so the heatmap grid is continuous. */

export function densifyActivity(
  activity: ActivityDay[],
  days: number,
): { date: string; count: number }[] {
  const byDate = new Map(activity.map((a) => [a.date, a.count]));
  const out: { date: string; count: number }[] = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  cursor.setDate(cursor.getDate() - (days - 1));
  for (let i = 0; i < days; i++) {
    const iso = cursor.toISOString().slice(0, 10);
    out.push({ date: iso.replace(/-/g, "/"), count: byDate.get(iso) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export const fmtDuration = (s: number): string => {
  if (!Number.isFinite(s) || s <= 0) return "0m";
  // Sub-minute sessions are real; rounding them to "0m" makes practice that
  // happened look like it never did.
  if (s < 60) return "<1m";
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m`;
};


export const shortDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export function formatMetric(m: Metric): string {
  if (m.key === "longest_focus_streak_s") return fmtDuration(m.value);
  return `${Math.round(m.value)}${m.unit}`;
}
