// Verification for the dynamic dashboard greeting in src/lib/greeting.ts.
//
// Same two rules as check-initials.mjs, for the same reasons — read that file's
// header for the full explanation:
//
//   1. No TypeScript syntax. Plain .mjs, run with Node's type stripping because
//      the module it imports IS TypeScript:
//
//          node --experimental-strip-types frontend/scripts/check-greeting.mjs
//
//   2. No realistic personal data. Nothing here needs a name at all, since
//      buildGreeting returns only the lead.
//
// What makes this checkable at all is that buildGreeting and daysSince take the
// clock as an argument instead of reading it. No mocking, no fake timers.

import { buildGreeting, daysSince, timeOfDay } from "../src/lib/greeting.ts";

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

console.log("timeOfDay (night wraps midnight, so it is tested first):");
check("00:00", timeOfDay(0), "night");
check("04:59 -> still night", timeOfDay(4), "night");
check("05:00 -> morning", timeOfDay(5), "morning");
check("11:00 -> morning, not afternoon", timeOfDay(11), "morning");
check("12:00 -> afternoon", timeOfDay(12), "afternoon");
check("17:00 -> evening", timeOfDay(17), "evening");
check("21:00 -> still evening", timeOfDay(21), "evening");
check("22:00 -> night", timeOfDay(22), "night");
check("23:00 -> night", timeOfDay(23), "night");

// The regression this ordering guards: with the night test placed last, hour 2
// fails `>= 5` and then satisfies `< 17`, and 2am greets you with "Afternoon".
check("02:00 is NOT afternoon", timeOfDay(2) === "afternoon", false);

// Seed 0 pins the first entry of every pool, so these assert exact strings.
const at = (over) => buildGreeting({
  hour: 9,
  sessions: 5,
  daysSinceLast: 3,
  streakDays: 0,
  seed: 0,
  ...over,
});

console.log("\nbuildGreeting (branch priority):");
check("no summary yet -> clock only", at({ sessions: null }), "Good morning");
check("brand new account", at({ sessions: 0 }), "Welcome");
check("back after a long gap", at({ daysSinceLast: 30 }), "Welcome back");
check("gap of exactly 10 days counts", at({ daysSinceLast: 10 }), "Welcome back");
check("gap of 9 days does not", at({ daysSinceLast: 9 }), "Good morning");
check("already practised today", at({ daysSinceLast: 0 }), "Back for another round");
check("live streak", at({ streakDays: 5 }), "Day 5 of the streak");
check("2-day streak is not yet a habit", at({ streakDays: 2 }), "Good morning");
check("ordinary visit falls through to the clock", at({ hour: 14 }), "Good afternoon");
check("late night", at({ hour: 23 }), "Still up");

// A streak-holder who already ran a session today should not be told which day
// of the streak it is — they just finished it.
check(
  "today's session outranks the streak",
  at({ daysSinceLast: 0, streakDays: 5 }),
  "Back for another round",
);
// A first run outranks everything, including nonsense combinations of the rest.
check("first run outranks all", at({ sessions: 0, daysSinceLast: 0, streakDays: 9 }), "Welcome");

console.log("\nbuildGreeting (rotation is deterministic and never undefined):");
check("same seed, same line", at({ seed: 7 }), at({ seed: 7 }));
// The pools are 2 and 3 entries long, so a large seed must wrap rather than
// index past the end.
for (const seed of [0, 1, 2, 3, 99, 1e6, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
  const got = buildGreeting({ hour: 9, sessions: 5, daysSinceLast: 3, streakDays: 0, seed });
  check(`seed ${seed} yields a string`, typeof got === "string" && got.length > 0, true);
}

console.log("\ndaysSince (calendar days, not elapsed 24h blocks):");
// 2026-03-10 01:00 local, against a session at 2026-03-09 23:00 local. Two hours
// apart, but yesterday and today — so this must be 1, not 0.
const now = new Date(2026, 2, 10, 1, 0, 0).getTime();
const lastNight = new Date(2026, 2, 9, 23, 0, 0).toISOString();
check("23:00 yesterday vs 01:00 today", daysSince(lastNight, now), 1);

// Same calendar day, 12 hours apart -> 0, which is what selects "already today".
check("same day, 12h earlier", daysSince(new Date(2026, 2, 10, 13, 0, 0).toISOString(), new Date(2026, 2, 10, 1, 0, 0).getTime()), 0);
check("exactly now", daysSince(new Date(now).toISOString(), now), 0);
check("30 days back", daysSince(new Date(2026, 1, 8, 12, 0, 0).toISOString(), now), 30);
check("never practised -> null", daysSince(null, now), null);
check("undefined -> null", daysSince(undefined, now), null);
check("unparseable -> null", daysSince("not a date", now), null);
// Clock skew must not produce a negative count, which is neither "today" nor a gap.
check("future timestamp clamps to 0", daysSince(new Date(2026, 5, 1).toISOString(), now), 0);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
