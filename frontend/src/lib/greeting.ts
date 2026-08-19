const HONORIFICS = new Set(["mr", "mrs", "ms", "miss", "dr", "prof", "er", "shri", "smt", "sri"]);
const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "phd", "md", "mba"]);

/**
 * Words that appear in resume *filenames* but are never part of a name.
 *
 * Without this, "Gokulkrishn_V_Resume.pdf" initialised as first+last token =
 * "GR" (Gokulkrishn + Resume), and "testresume.pdf" became "TE". The filename
 * is a weak identity source at best, so anything that is obviously file-naming
 * noise has to come out before the tokens are treated as a person's name.
 */
const FILE_NOISE = new Set([
  "resume", "resumes", "cv", "curriculum", "vitae", "biodata", "profile",
  "final", "finalised", "finalized", "updated", "update", "latest", "new", "old",
  "copy", "draft", "version", "ver", "rev", "doc", "document", "file", "my",
  "test", "sample", "demo", "untitled",
]);

/**
 * Noise words long enough to strip when they are *glued* to a name with no
 * separator, e.g. "testresume.pdf" or "gokulkrishnvresume.pdf". Kept separate
 * from FILE_NOISE and deliberately short: matching a 2-letter fragment like
 * "cv" inside a real name would corrupt far more than it fixes.
 */
const GLUED_NOISE = [
  "resume", "curriculumvitae", "curriculum", "vitae", "biodata", "profile",
  "final", "updated", "latest", "untitled", "sample",
];

/** Peel glued-on filename noise off a single token: "testresume" -> "test". */
function stripGluedNoise(token: string): string {
  let out = token;
  // Loop: names like "resumefinal" carry more than one noise word.
  for (let pass = 0; pass < 3; pass++) {
    const before = out;
    for (const noise of GLUED_NOISE) {
      const lower = out.toLowerCase();
      if (lower === noise) return "";
      if (lower.endsWith(noise) && out.length > noise.length) {
        out = out.slice(0, out.length - noise.length);
      } else if (lower.startsWith(noise) && out.length > noise.length) {
        out = out.slice(noise.length);
      }
    }
    if (out === before) break;
  }
  return out;
}

/**
 * Split a raw string into candidate name tokens.
 *
 * `dropFileNoise` is on for anything derived from a filename. It is deliberately
 * off for a name the user typed or one lifted from the resume body, where a word
 * like "New" could genuinely be part of a name.
 */
function nameTokens(raw: string, dropFileNoise: boolean): string[] {
  const tokens = raw
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^\p{L}\p{M}\s.'-]/gu, " ")
    .split(/[\s.]+/)
    .map((t) => t.replace(/[^\p{L}\p{M}'-]/gu, ""))
    .filter((t) => t.length > 0)
    .filter((t) => !HONORIFICS.has(t.toLowerCase()))
    .filter((t) => !SUFFIXES.has(t.toLowerCase()));

  if (!dropFileNoise) return tokens;

  const kept = tokens
    .filter((t) => !FILE_NOISE.has(t.toLowerCase()))
    .map((t) => stripGluedNoise(t))
    .filter((t) => t.length > 0)
    // A 1-char leftover is peeling debris, not an initial worth showing.
    .filter((t) => t.length > 1 || tokens.length > 1);

  // "resume.pdf" is all noise. Returning nothing is correct — the caller then
  // falls back rather than confidently showing "RE" as though it were a person.
  return kept;
}

/** "V. KRISHNAMURTHY" -> "Krishnamurthy" | "dr. anne-marie o'brien" -> "Anne-Marie" */
export function parseFirstName(raw?: string | null): string | null {
  if (!raw) return null;

  const tokens = nameTokens(raw, true);
  if (tokens.length === 0) return null;

  // skip leading initials like "V" or "V.K"
  const named = tokens.find((t) => t.replace(/[^\p{L}]/gu, "").length > 2) ?? tokens[0];
  return named ? titleCase(named) : null;
}

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s'-])(\p{L})/gu, (_m, sep, ch) => sep + ch.toUpperCase());
}

/**
 * Section headings sit at the top of a resume just like the name does, so
 * without an explicit list "EXPERIENCE" was being returned as the candidate's
 * name (and initialised to "EE").
 */
const RESUME_HEADINGS = new Set([
  "resume", "curriculum vitae", "cv", "biodata", "profile", "summary",
  "objective", "experience", "work experience", "professional experience",
  "education", "skills", "technical skills", "projects", "certifications",
  "achievements", "awards", "interests", "contact", "contact information",
  "personal details", "career objective", "about", "about me", "languages",
  "publications", "references", "activities", "coursework", "internships",
]);

/**
 * Pull the candidate's real name out of the resume body.
 *
 * Why this exists: nothing upstream knows the candidate's name. The backend
 * (`interviewer.py`) only extracts raw text and generates questions, and
 * `timeline.py` fills `display_name` with the candidate *ID*. So the avatar was
 * initialising the uploaded PDF's *filename* — "testresume.pdf" rendered as
 * "TE", which is why the letters never matched the person.
 *
 * Resumes put the name on its own line at the very top, above the contact
 * block, so the first line that looks like a human name is a far better source
 * than the filename. Heuristic and best-effort by design: it returns null
 * rather than guess, and the user's saved preferred name always wins over it.
 */
export function nameFromResumeText(text?: string | null): string | null {
  if (!text) return null;

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .slice(0, 15); // the name is at the top or it is not findable this way

  for (const line of lines) {
    // Contact rows, headings and prose are not the name.
    if (/[@\d]|https?:|www\.|linkedin|github/i.test(line)) continue;
    if (line.length > 40) continue;

    // Normalise before the heading check so "EXPERIENCE", "Experience" and
    // "Experience:" all match the same entry.
    const normalised = line.toLowerCase().replace(/[:.]+$/, "").replace(/\s+/g, " ").trim();
    if (RESUME_HEADINGS.has(normalised)) continue;

    const tokens = nameTokens(line, false);
    if (tokens.length < 1 || tokens.length > 4) continue;

    // Every token must be plausibly a name part: letters only, and not a
    // single-letter fragment unless it reads as a middle/last initial.
    const allNameish = tokens.every((t) => /^[\p{L}\p{M}'-]+$/u.test(t));
    if (!allNameish) continue;

    // Needs at least one token of real length, so "A B" or "I" is rejected.
    if (!tokens.some((t) => t.length > 2)) continue;

    return titleCase(tokens.join(" "));
  }

  return null;
}

/**
 * Two-letter initials for the corner avatar.
 *
 * Prefers first+last ("Aarav Mehta" -> "AM"). For a single glued token it takes
 * first+last letter ("gokulkrishnv" -> "GV"), never one lonely letter, since a
 * 28px circle with a single glyph reads as a bullet rather than an identity.
 * Returns null when nothing name-like survives — a generic or noise-only input
 * must not become "TH" or "RE".
 *
 * `fromFileName` strips filename noise, so "Gokulkrishn_V_Resume.pdf" yields
 * "GV" rather than "GR".
 */
export function initialsFrom(raw?: string | null, fromFileName = true): string | null {
  if (!raw) return null;

  const tokens = nameTokens(raw, fromFileName);

  if (tokens.length === 0) return null;
  if (tokens.length === 1) {
    // Single token: first + last letter ("gokulkrishnv" -> "GV", "aarav" -> "AV")
    const t = tokens[0].replace(/[^\p{L}\p{M}]/gu, "");
    if (!t) return null;
    if (t.length < 2) return t[0].toUpperCase().repeat(2);
    return (t[0] + t[t.length - 1]).toUpperCase();
  }

  const first = tokens[0].replace(/[^\p{L}\p{M}]/gu, "");
  const last = tokens[tokens.length - 1].replace(/[^\p{L}\p{M}]/gu, "");
  if (!first || !last) return null;
  return (first[0] + last[0]).toUpperCase();
}

export function resolveDisplayName(input: {

  preferredName?: string | null;
  resumeName?: string | null;
  email?: string | null;
}): { name: string; isFallback: boolean; needsConfirm: boolean } {
  const pref = input.preferredName?.trim();
  if (pref) return { name: titleCase(pref), isFallback: false, needsConfirm: false };

  const first = parseFirstName(input.resumeName);
  if (first) return { name: first, isFallback: false, needsConfirm: first.length > 12 };

  const local = input.email?.split("@")[0]?.replace(/[._\d]+/g, " ").trim();
  const fromEmail = parseFirstName(local);
  if (fromEmail) return { name: fromEmail, isFallback: true, needsConfirm: true };

  return { name: "there", isFallback: true, needsConfirm: false };
}

/* ------------------------------------------------------------------------- *
 * Dynamic greeting
 *
 * The dashboard used to open with "Welcome back," on every visit, at every
 * hour, whether it was the user's first session ever or their fourth today.
 * That one fixed string is what makes a product feel unattended, and it is
 * actively wrong on a first visit — there is no "back" to come to.
 *
 * The shape here is the one Gemini and ChatGPT both use: a short time-of-day
 * lead over the first name, varied between visits so a returning user does not
 * read the identical sentence every day. What is added for GUARD is context the
 * dashboard already holds — a first run, a long absence, a live streak and a
 * second session in one day are four different moments, and a practice tool
 * that greets all four identically is not paying attention to the practice.
 *
 * Everything is passed in: the hour, the seed and the session facts. So these
 * are pure functions, testable without mocking a clock (see
 * scripts/check-greeting.mjs), and the caller resolves the inputs once after
 * mount. That last part is not incidental — a greeting that reshuffles itself
 * on every re-render while you are reading it is worse than a fixed one.
 * ------------------------------------------------------------------------- */

export type TimeOfDay = "morning" | "afternoon" | "evening" | "night";

/**
 * Bucket a local hour (0–23).
 *
 * Night is tested FIRST because it is the one bucket that wraps midnight; check
 * it last and hour 2 falls through into "afternoon". Boundaries are uneven on
 * purpose: morning runs to 12 because 11:30 is not afternoon to anyone, and
 * night starts at 22 because someone practising at 23:00 is having a late night
 * rather than an early morning.
 */
export function timeOfDay(hour: number): TimeOfDay {
  if (hour >= 22 || hour < 5) return "night";
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

const TIME_LEADS: Record<TimeOfDay, readonly string[]> = {
  morning: ["Good morning", "Morning", "Fresh start"],
  afternoon: ["Good afternoon", "Afternoon"],
  evening: ["Good evening", "Evening"],
  night: ["Still up", "Late one", "Late session"],
};

// "Welcome back" survives here and nowhere else, because this is the only branch
// where it is true. Kept deliberately: it was never a bad line, only a line
// shown at the wrong times.
const AFTER_A_GAP = ["Welcome back", "Good to see you again", "Been a while"] as const;
const FIRST_RUN = ["Welcome", "Good to have you", "Let's set your baseline"] as const;
const ALREADY_TODAY = ["Back for another round", "Round two", "Still at it"] as const;

/** Days away before the return is worth remarking on. Below this it is just a normal visit. */
const GAP_DAYS = 10;
/** Two days in a row is a coincidence; three is a habit worth naming. */
const STREAK_MIN = 3;

/** Deterministic choice from a pool. A non-finite seed picks the first entry rather than `undefined`. */
function pick(pool: readonly string[], seed: number): string {
  const i = Number.isFinite(seed) ? Math.abs(Math.trunc(seed)) % pool.length : 0;
  return pool[i];
}

export type GreetingFacts = {
  /** Local hour, 0–23. */
  hour: number;
  /**
   * Sessions ever recorded. 0 means this account has never run one; **null means
   * not known yet** — the summary is still in flight or the fetch failed.
   *
   * The null case matters. Defaulting an unloaded summary to 0 makes every
   * contextual branch fire on placeholder facts, so a returning user reads
   * "Let's set your baseline" for as long as the request takes and then watches
   * it correct itself. With no facts, the clock is the only honest answer.
   */
  sessions: number | null;
  /** Whole calendar days since the last session; null when there has never been one. */
  daysSinceLast: number | null;
  /** Current consecutive-day streak, as the backend counts it. */
  streakDays: number;
  /** Rotation seed. The same seed always yields the same line. */
  seed: number;
};

/**
 * The greeting lead, without the name and without a trailing comma — the caller
 * owns both, because it styles the name separately and must not print a dangling
 * comma when there is no name to follow it.
 */
export function buildGreeting(facts: GreetingFacts): string {
  const { hour, sessions, daysSinceLast, streakDays, seed } = facts;

  // Order IS the design. Each branch is a claim that this fact is the most
  // interesting thing about this visit; the clock is what is left when none of
  // them is — or when nothing is known yet. Note that a streak-holder who has
  // already practised today gets "Back for another round" rather than "Day 5":
  // they know it is day 5, they just finished it.
  if (sessions === null) return pick(TIME_LEADS[timeOfDay(hour)], seed);
  if (sessions === 0) return pick(FIRST_RUN, seed);
  if (daysSinceLast !== null && daysSinceLast >= GAP_DAYS) return pick(AFTER_A_GAP, seed);
  if (daysSinceLast === 0) return pick(ALREADY_TODAY, seed);
  if (streakDays >= STREAK_MIN) {
    return pick([`Day ${streakDays} of the streak`, `${streakDays} days running`], seed);
  }
  return pick(TIME_LEADS[timeOfDay(hour)], seed);
}

/**
 * Whole *calendar* days between an ISO timestamp and `now`, or null if absent
 * or unparseable.
 *
 * Calendar days rather than elapsed 24-hour blocks, because the caller uses 0 to
 * mean "already practised today": a session at 23:00 last night and a visit at
 * 01:00 tonight are two hours apart but are yesterday and today to the user.
 * Rounding rather than flooring the division absorbs the 23- and 25-hour days
 * that daylight-saving transitions produce.
 */
export function daysSince(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return null;

  const midnight = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  // Clamped at 0: a clock skew that puts the last session in the future must not
  // produce a negative count, which would read as neither "today" nor "a gap".
  return Math.max(0, Math.round((midnight(now) - midnight(then)) / 86_400_000));
}
