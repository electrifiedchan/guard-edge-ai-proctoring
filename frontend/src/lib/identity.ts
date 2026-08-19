/**
 * One place that answers "who is using this app".
 *
 * Both the dashboard header and the corner avatar need the candidate's name, and
 * before this file they resolved it separately — with different results. The
 * avatar read the resume body, which is correct. The dashboard header passed the
 * API's `candidate.display_name` into resolveDisplayName, and that field holds
 * the candidate *ID*, not a name (see nameFromResumeText's note on
 * `timeline.py`). Once IDs became `resume_<hash>`, parseFirstName was chewing on
 * hash characters: it stripped the "resume" prefix, dropped the digits, and
 * title-cased whatever letters were left. The header greeted people as "Fahh".
 *
 * Nothing upstream extracts the name, so the resume body remains the only real
 * source, with the upload's filename as a fallback and the user's typed
 * preference above both. Two implementations of that cascade is how the two
 * surfaces drifted apart in the first place, which is why this one is shared.
 */

import { initialsFrom, nameFromResumeText, resolveDisplayName } from "./greeting";
import { getActiveResume, readCache } from "./resumeMemory";

/** Where a typed-in preferred name lives. Exported so callers cannot mistype it. */
export const PREFERRED_NAME_KEY = "guard.preferredName";
const SESSION_KEY = "guard_session";

export type Identity = {
  /** First name for greetings, or "there" when nothing real was found. */
  name: string;
  /** Full name, for tooltips and initials. Null when nothing real was found. */
  fullName: string | null;
  /** Two letters for the avatar, or null — a generic input must not become "TH". */
  initials: string | null;
  /** True when `name` is the generic fallback rather than the person's. */
  isFallback: boolean;
  /** True when the name is long or odd enough to be worth offering a shorter one. */
  needsConfirm: boolean;
};

/** localStorage/sessionStorage both throw in some private modes, and neither exists server-side. */
function safeRead(store: "local" | "session", key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return (store === "local" ? window.localStorage : window.sessionStorage).getItem(key);
  } catch {
    return null;
  }
}

/**
 * Resolve the current user's identity from browser storage.
 *
 * Client-only: call it from an effect, never during render. Storage is
 * unavailable in the server pass, so resolving inline desyncs hydration and
 * flashes the fallback name.
 */
export function readIdentity(): Identity {
  const preferred = safeRead("local", PREFERRED_NAME_KEY);

  let resumeName: string | null = null;
  let resumeText: string | null = null;
  const session = safeRead("session", SESSION_KEY);
  if (session) {
    try {
      const parsed = JSON.parse(session) as { file_name?: string; resume_text?: string };
      resumeName = parsed.file_name ?? null;
      resumeText = parsed.resume_text ?? null;
    } catch {
      // malformed session blob — fall through to the remembered resume
    }
  }

  const remembered = getActiveResume();
  resumeName = resumeName ?? remembered?.file_name ?? null;
  // After a tab close there is no live session, but the parsed resume survives
  // in the cache the pointer names — so the real name is still recoverable.
  if (!resumeText && remembered) resumeText = readCache(remembered.hash)?.resume_text ?? null;

  const cleaned = resumeName
    ? resumeName.replace(/\.(pdf|docx?|txt)$/i, "").replace(/[_-]+/g, " ")
    : null;

  // The resume body is the only place the candidate's actual name exists —
  // nothing upstream extracts it, and the filename is often "testresume.pdf",
  // which is where the wrong letters came from. Filename is now the fallback.
  const fromResume = nameFromResumeText(resumeText);

  const resolved = resolveDisplayName({
    preferredName: preferred,
    resumeName: fromResume ?? cleaned,
  });

  // Prefer full-name initials ("Aarav Mehta" -> AM). resolveDisplayName returns
  // only a first name, which would collapse to "AA" and lose the surname.
  // A typed or resume-sourced name is real text, so filename-noise stripping is
  // off for those; only the filename path needs it.
  const initials =
    initialsFrom(preferred, false) ??
    initialsFrom(fromResume, false) ??
    initialsFrom(cleaned) ??
    initialsFrom(resolved.name, false);

  const anonymous = resolved.name === "there";

  return {
    name: resolved.name,
    // Same precedence as the name itself, so the tooltip can never disagree with
    // the heading it explains.
    fullName: preferred?.trim() || fromResume || cleaned || null,
    initials: anonymous ? null : initials,
    isFallback: resolved.isFallback,
    needsConfirm: resolved.needsConfirm,
  };
}
