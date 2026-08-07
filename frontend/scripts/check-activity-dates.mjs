// Verification for the heatmap date keys in src/lib/dashboard.ts.
//
// Run it the same way as check-initials.mjs (the source it imports is
// TypeScript, so Node needs to strip types):
//
//     node --experimental-strip-types frontend/scripts/check-activity-dates.mjs
//
// Why this check exists: the streak grid never lit the current day. The backend
// keys each session by its LOCAL calendar day (timeline.py uses
// `date.fromtimestamp(...)`), while the frontend built its cell keys with
// `toISOString().slice(0, 10)`, which is UTC. East of Greenwich those disagree
// for the whole evening — from India local midnight is 18:30 the PREVIOUS day —
// so every cell asked for a key one day off and today's practice lit nothing.
//
// Nothing threw. A dark cell is indistinguishable from "no session today",
// which is why this shipped: the failure mode of a wrong date is silence. Hence
// a test that pins the local-vs-UTC distinction directly, with TZ forced to a
// zone where the two differ.

import { localDateKey, densifyActivity } from "../src/lib/dashboard.ts";

let passed = 0;
let failed = 0;

function check(label, got, want) {
  const ok = got === want;
  if (ok) {
    passed++;
    console.log(`  ok   ${label} -> ${JSON.stringify(got)}`);
  } else {
    failed++;
    console.log(`  FAIL ${label} -> got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
}

console.log(`TZ = ${process.env.TZ ?? "(system default)"}`);
console.log(`offset = ${-new Date().getTimezoneOffset() / 60}h from UTC\n`);

console.log("localDateKey (must read the LOCAL calendar, never UTC):");

// 20:33 local on the 7th. This is the exact shape of the original report: an
// evening session in IST. toISOString() would say "2026-08-07" only if the
// offset is <= +3:26; at +5:30 the UTC instant is 15:03 same day, so this one
// case agrees. The next case is the one that bites.
const evening = new Date(2026, 7, 7, 20, 33, 0);
check("2026-08-07 20:33 local", localDateKey(evening), "2026-08-07");

// Local midnight is the cursor densifyActivity actually uses, and it is the
// worst case: east of UTC it converts to the previous day.
const midnight = new Date(2026, 7, 7, 0, 0, 0);
check("2026-08-07 00:00 local (cursor)", localDateKey(midnight), "2026-08-07");

// Zero-padding: a single-digit month and day must not produce "2026-1-5".
check("2026-01-05 00:00 local", localDateKey(new Date(2026, 0, 5, 0, 0, 0)), "2026-01-05");

// Last day of a month, at local midnight — the rollover that an offset error
// turns into the wrong month as well as the wrong day.
check("2026-03-01 00:00 local", localDateKey(new Date(2026, 2, 1, 0, 0, 0)), "2026-03-01");

// The regression itself, stated as a property rather than a fixed string: at a
// positive UTC offset, local midnight's ISO date is the PREVIOUS day. If this
// assertion ever reads "equal", the test is running at UTC and proves nothing —
// so it is reported as a skip rather than a silent pass.
const offsetMin = -midnight.getTimezoneOffset();
if (offsetMin > 0) {
  const utcSliced = midnight.toISOString().slice(0, 10);
  check(
    "the old UTC construction really does differ (regression is reachable)",
    utcSliced !== localDateKey(midnight),
    true,
  );
} else {
  console.log("  skip the UTC-divergence assertion needs a positive offset; run with TZ=Asia/Kolkata");
}

console.log("\ndensifyActivity (grid keys must match backend local-day keys):");

// A count parked on today's LOCAL key must land on the last cell. This is the
// user-visible symptom: session recorded, streak cell dark.
const todayKey = localDateKey(new Date());
const grid = densifyActivity([{ date: todayKey, count: 3 }], 84);

check("grid length", grid.length, 84);
check("today's count lands on the final cell", grid[83].count, 3);
check("final cell's own date is today", grid[83].date, todayKey.replace(/-/g, "/"));
check("earlier cells stay zero", grid.slice(0, 83).every((c) => c.count === 0), true);

// Every emitted key must be a well-formed date. A malformed key silently misses
// the backend map the same way a shifted one does.
check(
  "all 84 dates are YYYY/MM/DD",
  grid.every((c) => /^\d{4}\/\d{2}\/\d{2}$/.test(c.date)),
  true,
);

// No duplicates and no gaps: 84 distinct consecutive days. A DST transition is
// the classic way a date-cursor loop repeats or skips a day.
check("84 distinct days, no repeats from a DST fold", new Set(grid.map((c) => c.date)).size, 84);

// A key the backend never wrote must not light anything — the dashboard should
// render an empty grid for an unknown resume rather than borrowing a cell.
const unmatched = densifyActivity([{ date: "1999-01-01", count: 9 }], 84);
check("an out-of-range key lights no cell", unmatched.every((c) => c.count === 0), true);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
