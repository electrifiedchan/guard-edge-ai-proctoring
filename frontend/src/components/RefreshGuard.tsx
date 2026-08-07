"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * The "are you sure?" half of the refresh policy.
 *
 * A refresh discards the run and drops you back on the landing page (see
 * lib/refreshPolicy.ts for why). That is the right destination but a harsh
 * surprise when the reload was a mistyped Ctrl-R, so the browser is asked to
 * confirm first. Cancelling leaves everything untouched — the redirect script
 * only runs on a reload that actually went through.
 *
 * Mounted once in the root layout, so it covers every route rather than just
 * the interview page: losing a report or a half-filled upload to a stray
 * refresh is the same annoyance, and the redirect applies to all of them
 * equally.
 *
 * The landing page is exempt. It holds no state, and a reload there already
 * lands where the policy would send you.
 */
export default function RefreshGuard() {
  const pathname = usePathname();

  useEffect(() => {
    // Nothing to lose and nowhere to go — leave the bfcache intact by not
    // registering a handler at all. (Any attached beforeunload listener makes
    // a page ineligible for the back/forward cache in Firefox and Safari.)
    if (pathname === "/") return;

    const confirmLeaving = (e: BeforeUnloadEvent) => {
      // Browsers ignore this wording and substitute their own, but it must not
      // be blank: the legacy path is gated on returnValue being a *non-empty*
      // string, so "" would quietly suppress the dialog in older Chrome/Edge.
      // preventDefault is the spec'd trigger; the rest covers engines predating
      // it.
      const message = "Leaving this page will end your current session.";
      e.preventDefault();
      e.returnValue = message;
      return message;
    };

    window.addEventListener("beforeunload", confirmLeaving);
    return () => window.removeEventListener("beforeunload", confirmLeaving);
  }, [pathname]);

  return null;
}
