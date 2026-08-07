/**
 * What a page refresh means in this app.
 *
 * Every route here is a step in one linear flow — upload, interview, report —
 * and each step's state lives in React plus a sessionStorage handoff key. A
 * reload wipes the React half and keeps the storage half, which is the worst of
 * both: `/sentry` still passes its "do I have a session?" guard and renders,
 * but with no session id, no transcript and a dead End-session button. The
 * backend session outlives the page holding the conversation, unreachable until
 * its TTL prunes it.
 *
 * So a refresh is treated as leaving: confirm it, then start clean from the
 * landing page. Nothing of value is lost that wasn't already lost — the resume
 * itself is cached in localStorage by content hash, so the upload page can
 * still offer to continue with it.
 */

/** sessionStorage keys holding the in-flight run. Cleared on any refresh. */
export const INTERVIEW_SESSION_KEYS = [
  "guard_session",
  "guard_report",
  "guard_vision_session",
] as const;

/**
 * Redirects a reloaded page to the landing page, before the document paints.
 *
 * This has to run as a blocking inline script rather than an effect. The pages
 * have their own redirect guards (`/sentry` sends you to `/upload` when the
 * session key is missing, `/report` and `/verdict` do the same), and those are
 * effects too — so an effect-based redirect here would be one of several
 * competing router calls in the same tick, and the last one to run wins. By the
 * time React hydrates the decision is already contested. Doing it here means
 * the reloaded route never mounts at all: no flash of a half-built page, no
 * race, and the per-page guards see a clean slate when the landing page loads.
 *
 * `location.replace` rather than `href` so the dead URL doesn't sit in history
 * as a back-button trap. The replacement counts as a "navigate", not a
 * "reload", so this cannot loop.
 */
export const REFRESH_TO_LANDING_SCRIPT = `
(function () {
  try {
    if (location.pathname === "/") return;

    var entries = performance.getEntriesByType("navigation");
    var isReload = entries && entries.length
      ? entries[0].type === "reload"
      // Safari < 15 and older Firefox never shipped the Navigation Timing 2
      // entry; the deprecated API is the only signal available there.
      : !!(performance.navigation && performance.navigation.type === 1);
    if (!isReload) return;

    ${JSON.stringify([...INTERVIEW_SESSION_KEYS])}.forEach(function (k) {
      try { sessionStorage.removeItem(k); } catch (e) {}
    });

    location.replace("/");
  } catch (e) {
    // Private-mode storage denials and missing performance entries both land
    // here. Staying on the page is the safe failure: the user sees the route
    // they reloaded rather than an unexplained jump to the landing page.
  }
})();
`;
