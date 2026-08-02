import type { DashboardSummary } from "@/lib/dashboard";

/**
 * Fixture for `/dashboard?demo=1` — lets the populated state be reviewed with no
 * backend running. Shapes are the same TypeScript types the real fetch returns,
 * so a contract change in dashboard.ts breaks this file at compile time rather
 * than leaving a stale fixture that renders a view the API can no longer produce.
 */

/**
 * Mirrors densifyActivity's date construction exactly (local midnight cursor,
 * UTC-sliced ISO). Generating demo dates any other way would offset them from
 * the grid the heatmap builds and silently drop cells.
 */
function lastNDates(days: number): string[] {
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  cursor.setDate(cursor.getDate() - (days - 1));
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/**
 * offset-from-oldest → sessions that day. Sums to 25, matching totals.sessions.
 *
 * Sparse activity in the first three weeks is deliberate: with an empty head the
 * zero-count cells (#18181b) are near-invisible against the panel and the grid
 * reads as left-truncated rather than as "no practice yet". Early days are
 * isolated (never adjacent, and never touching offset 20) so they cannot extend
 * either streak.
 */
const ACTIVITY_PLAN: Record<number, number> = {
  3: 1, 7: 1, 11: 1, 15: 1, 18: 1, // early, sporadic practice
  20: 1, 21: 1, 22: 1, 23: 1, 24: 1, 25: 1, 26: 1, 27: 1, 28: 1, 29: 1, 30: 1, // 11-day best streak
  45: 1, 46: 1,
  60: 1,
  79: 1, 80: 1, 81: 2, 82: 1, 83: 1, // current 5-day streak, ending today
};


export function buildDemoSummary(days: number): DashboardSummary {
  const dates = lastNDates(days);
  const at = (offset: number) => dates[Math.max(0, Math.min(days - 1, offset))];

  const activity = Object.entries(ACTIVITY_PLAN).map(([offset, count]) => ({
    date: at(Number(offset)),
    count,
  }));

  // Rising with two visible setbacks — a monotonic climb reads as fake data.
  const trendPoints: [number, number, number][] = [
    [20, 61, 34],
    [21, 64, 38],
    [22, 63, 31],
    [24, 68, 44],
    [26, 71, 47],
    [30, 69, 40],
    [45, 74, 52],
    [46, 72, 49],
    [60, 78, 58],
    [79, 81, 63],
    [81, 79, 55],
    [83, 84, 66],
  ];

  return {
    candidate: {
      candidate_id: "major_project_candidate_01",
      display_name: "Aarav Sharma",
      preferred_name: null,
    },
    // sessions must equal the sum of ACTIVITY_PLAN — the header prints this
    // count directly above the grid, so a mismatch is visible side by side.
    totals: {
      sessions: 25,
      practice_seconds: 21_750,

      current_streak_days: 5,
      best_streak_days: 11,
    },
    readiness: {
      score: 78,
      delta_vs_prev: 5,
      band: "Interview Ready",
    },
    metrics: [
      {
        key: "eye_contact_pct",
        label: "Eye contact",
        value: 71,
        unit: "%",
        delta: 6,
        spark: [58, 61, 60, 64, 67, 66, 71],
      },
      {
        key: "talking_pct",
        label: "Speaking time",
        value: 46,
        unit: "%",
        delta: -4,
        spark: [58, 55, 53, 54, 50, 48, 46],
      },
      {
        key: "longest_focus_streak_s",
        label: "Longest focus streak",
        value: 214,
        unit: "s",
        delta: 38,
        spark: [121, 134, 128, 159, 176, 181, 214],
      },
      {
        key: "recovery_count",
        label: "Recoveries",
        value: 9,
        unit: "",
        delta: 2,
        spark: [4, 5, 5, 6, 8, 7, 9],
      },
    ],
    composure_trend: trendPoints.map(([offset, avg, min], i) => ({
      session_id: `demo-s${i + 1}`,
      date: at(offset),
      avg_composure: avg,
      min_composure: min,
    })),
    activity,
    gaze_split: {
      center_pct: 68,
      away_pct: 21,
      down_pct: 11,
    },
    recent_sessions: [
      {
        session_id: "demo-s12",
        started_at: `${at(83)}T18:20:00`,
        duration_s: 1_140,
        avg_composure: 84,
        headline: "Steadiest session yet — held eye contact through the hard question.",
        recovery_count: 2,
      },
      {
        session_id: "demo-s11",
        started_at: `${at(81)}T09:05:00`,
        duration_s: 860,
        avg_composure: 79,
        headline: "Strong open, drifted downward when asked about gaps.",
        recovery_count: 4,
      },
      {
        session_id: "demo-s10",
        started_at: `${at(79)}T20:41:00`,
        duration_s: 1_020,
        avg_composure: 81,
        headline: "Recovered fast after every look away.",
        recovery_count: 3,
      },
      {
        session_id: "demo-s9",
        started_at: `${at(60)}T17:12:00`,
        duration_s: 720,
        avg_composure: 78,
        headline: "Short session, spoke less than usual.",
        recovery_count: 1,
      },
      {
        session_id: "demo-s8",
        started_at: `${at(46)}T11:30:00`,
        duration_s: 935,
        avg_composure: 72,
        headline: "Long pause mid-answer pulled the average down.",
        recovery_count: 5,
      },
    ],
    focus_area: {
      key: "downward_gaze",
      title: "Your eyes drop when you think",
      detail:
        "11% of your last session was spent looking down — most of it right after a question landed. Practise holding the frame while you gather the answer.",
      cta_session_id: "demo-s12",
    },
  };
}
