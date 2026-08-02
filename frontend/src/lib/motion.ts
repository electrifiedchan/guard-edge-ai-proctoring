import type { Variants } from "framer-motion";

/**
 * Shared reveal variants.
 *
 * `fadeUp`/`stagger` keep the app's original, slightly tighter timing — the
 * dashboard and report pages are already tuned to them. The landing page's
 * showier headline variants live alongside rather than replacing them, so
 * marketing motion can be cinematic without making product UI feel sluggish.
 */

// Standard fade-up with blur — the workhorse reveal
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24, filter: "blur(6px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

// Container that reveals children one after another
export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};

// Tighter stagger for word-by-word headline reveals (landing hero)
export const wordStagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.055, delayChildren: 0.2 } },
};

// Each word rises + un-blurs — cinematic headline effect (landing hero)
export const wordReveal: Variants = {
  hidden: { opacity: 0, y: "0.4em", filter: "blur(10px)" },
  show: {
    opacity: 1,
    y: "0em",
    filter: "blur(0px)",
    transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] },
  },
};
