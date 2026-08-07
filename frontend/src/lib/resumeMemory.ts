/**
 * Resume memory — "do we already know this user's resume?"
 *
 * Why this exists
 * ---------------
 * The app already caches parsed resumes under `guard_resume_cache_<hash>`, but
 * that map is keyed by file hash, so it can only answer "have I seen THIS exact
 * file before?" — you need the file in hand to look it up. The live session
 * (`guard_session`) lives in sessionStorage and dies with the tab.
 *
 * So after a tab close there was no way to know a returning user had a resume
 * at all. This module adds one small pointer record in localStorage that names
 * the most recently used resume, letting /upload offer "continue with
 * Aarav_CV.pdf" instead of demanding a re-upload every visit.
 *
 * Privacy note: parsed resume text is stored in localStorage (pre-existing
 * behaviour of the cache this wraps). `clearResumeMemory()` is the user-facing
 * escape hatch and wipes every trace, including the underlying cache entries.
 */

const ACTIVE_KEY = "guard_active_resume";
// MUST match CACHE_PREFIX in app/upload/page.tsx. These were split across two
// prefixes once, and the result was that "Continue with this resume" served a
// stale v1 entry whose resume_text was empty — the interviewer then invented a
// candidate out of thin air (wrong name, wrong history). One constant, one
// source of truth.
const CACHE_PREFIX = "guard_resume_cache_v2_";
const LEGACY_CACHE_PREFIXES = ["guard_resume_cache_"];
const SESSION_KEY = "guard_session";

/** Matches the 24h TTL the resume cache already enforces. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export type ActiveResume = {
  file_name: string;
  hash: string;
  question_count: number;
  /** epoch ms */
  saved_at: number;
};

type CachedPayload = {
  data: { questions: string[]; resume_text: string };
  timestamp: number;
};

/**
 * Delete cache entries written under any older prefix. Those pre-date the fix
 * that made the backend actually return `resume_text`, so every one of them
 * holds an empty resume and will make the interviewer invent a candidate.
 * Cheap to run, so /upload calls it on mount.
 */
export function purgeLegacyResumeCache(): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const isLegacy = LEGACY_CACHE_PREFIXES.some(
        (p) => key.startsWith(p) && !key.startsWith(CACHE_PREFIX),
      );
      if (isLegacy) doomed.push(key);
    }
    doomed.forEach((key) => localStorage.removeItem(key));

    // Drop the pointer only if it is malformed. It used to be dropped whenever
    // its payload was missing, but the pointer now carries the candidate's
    // identity (see activeCandidateId) — a purged legacy payload means the user
    // must re-upload to practise, not that their past sessions are disowned.
    const raw = localStorage.getItem(ACTIVE_KEY);
    if (raw) {
      let hash: string | undefined;
      try {
        hash = (JSON.parse(raw) as ActiveResume)?.hash;
      } catch {
        hash = undefined;
      }
      if (!hash) localStorage.removeItem(ACTIVE_KEY);
    }
  } catch {
    // nothing recoverable to do
  }
}

/** Remember which resume the user last practised with. */
export function rememberResume(meta: Omit<ActiveResume, "saved_at">): void {

  try {
    const record: ActiveResume = { ...meta, saved_at: Date.now() };
    localStorage.setItem(ACTIVE_KEY, JSON.stringify(record));
  } catch {
    // localStorage unavailable (private mode / quota) — memory is a nicety,
    // never a requirement, so failing silently keeps upload working.
  }
}

/**
 * The remembered resume, but only if its cached payload is still present and
 * unexpired — otherwise "continue" would be offered and then fail.
 */
export function getActiveResume(): ActiveResume | null {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    if (!raw) return null;

    const record = JSON.parse(raw) as ActiveResume;
    if (!record?.hash || !record?.file_name) return null;

    // The pointer is only useful if the payload behind it survives — but report
    // that by returning null, WITHOUT deleting the pointer. Erasing it here is
    // what made the expiry permanent: /upload calls this on mount, so the first
    // visit after the 24h cache TTL destroyed the hash, and with it the only
    // link to the candidate's dashboard history. A missing parse means "you
    // must re-upload to practise", not "your past sessions never happened".
    if (!readCache(record.hash)) return null;

    return record;
  } catch {
    return null;
  }
}

/**
 * Identity for everything that is scoped to "this resume": telemetry writes and
 * the dashboard read alike.
 *
 * Both sides previously hardcoded the same literal candidate id, so every
 * resume on the machine shared one history — upload a new CV and the dashboard
 * still showed the old one's sessions. Keying on the content hash gives each
 * resume its own timeline. It lives here, next to the hash it derives from,
 * because two independent copies of this rule is precisely how the bug started.
 *
 * Returns the no-resume identity when nothing is active; that id is expected to
 * have no history, which is what the caller should render.
 */
export const NO_RESUME_CANDIDATE_ID = "guard_no_active_resume";

export function activeCandidateId(): string {
  // Deliberately NOT getActiveResume(): that gate exists to stop /upload
  // offering a "continue" card whose payload has expired, and it *deletes* the
  // pointer on a cache miss. Identity must outlive the 24h parse cache. Routed
  // through the gate, a user's whole history detached the day after they
  // practised — telemetry had been written under `resume_<hash>`, the dashboard
  // then asked for `guard_no_active_resume`, and the empty state rendered as if
  // they had never practised at all. Streak dark, trend flat, nothing thrown.
  //
  // The hash identifies the resume; the cached parse is only a speed-up. So
  // read the pointer directly and let a stale cache mean "re-upload to start a
  // session", never "you have no past".
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    if (!raw) return NO_RESUME_CANDIDATE_ID;
    const record = JSON.parse(raw) as ActiveResume;
    return record?.hash ? `resume_${record.hash}` : NO_RESUME_CANDIDATE_ID;
  } catch {
    return NO_RESUME_CANDIDATE_ID;
  }
}

/** Read a cached parse, honouring the same TTL as the upload page. */

export function readCache(hash: string): CachedPayload["data"] | null {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${hash}`);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CachedPayload;
    if (Date.now() - parsed.timestamp > CACHE_TTL_MS) {
      localStorage.removeItem(`${CACHE_PREFIX}${hash}`);
      return null;
    }

    // A cached parse with no resume text is worse than no cache at all: the
    // session starts, the model gets an empty resume, and it hallucinates a
    // candidate. Treat it as a miss and force a real re-upload.
    if (!parsed.data?.resume_text?.trim()) {
      localStorage.removeItem(`${CACHE_PREFIX}${hash}`);
      return null;
    }

    return parsed.data;

  } catch {
    return null;
  }
}

/**
 * Rehydrate `guard_session` from the remembered resume so the interview flow
 * can start without a re-upload. Returns false if the payload has since gone,
 * in which case the caller should fall back to the drop-zone.
 */
export function resumeFromMemory(record: ActiveResume): boolean {
  const cached = readCache(record.hash);
  if (!cached) return false;

  try {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        questions: cached.questions,
        resume_text: cached.resume_text,
        file_name: record.file_name,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Forget everything: the pointer, every cached parse, and the live session.
 * Backs the "Clear memory" control on the upload page.
 */
export function clearResumeMemory(): void {
  try {
    localStorage.removeItem(ACTIVE_KEY);

    // Collect first, then delete — mutating during iteration skips entries.
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(CACHE_PREFIX)) stale.push(key);
    }
    stale.forEach((key) => localStorage.removeItem(key));

    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // nothing recoverable to do
  }
}

/** "2 days ago" / "just now" — keeps the continue card human. */
export function describeAge(savedAt: number): string {
  const mins = Math.floor((Date.now() - savedAt) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;

  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
