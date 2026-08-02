"use client";

import { type CSSProperties } from "react";
import { motion, useMotionTemplate, useMotionValue, useSpring } from "framer-motion";

const WORD = "GUARD";
const FONT_SIZE = "clamp(4.5rem, 21vw, 19rem)";

/* GUARD is all caps, so there are no descenders — the glyph feet ARE the baseline.
   With leading-none the line box still reserves descender space below that
   baseline, which would float the word above the horizon. BASELINE_PULL is that
   reserved gap, removed as negative margin so the feet land exactly on the line.
   Nothing is clipped: no layer here uses overflow-hidden except the reflection. */
const BASELINE_PULL = "-0.15em";

/* One type spec shared by every layer so base, spotlight and reflection stay
   pixel-identical — any drift shows up instantly as a ghost. */
const typeClass = "display block whitespace-nowrap text-center font-normal leading-none tracking-[-0.04em]";
const typeStyle: CSSProperties = {
  fontSize: FONT_SIZE,
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
};

/** Near-black wordmark — legible only as a change in sheen, like Resend's. */
const BASE_FILL = "linear-gradient(180deg, #1f1f1f 0%, #0b0b0b 62%, #050505 100%)";
/** What the cursor uncovers. */
const LIT_FILL = "linear-gradient(180deg, #ffffff 0%, #d4d4d4 45%, #6b6b6b 100%)";

export default function WordmarkSection() {
  // -9999 keeps the spotlight fully off-canvas until the pointer actually arrives.
  const mx = useMotionValue(-9999);
  const my = useMotionValue(-9999);
  const x = useSpring(mx, { stiffness: 260, damping: 32, mass: 0.4 });
  const y = useSpring(my, { stiffness: 260, damping: 32, mass: 0.4 });

  // The reveal mask travels with the pointer; `black` = show, `transparent` = hide.
  const spotlight = useMotionTemplate`radial-gradient(240px circle at ${x}px ${y}px, #000 0%, rgba(0,0,0,0.55) 45%, transparent 72%)`;

  return (
    <section
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        mx.set(e.clientX - r.left);
        my.set(e.clientY - r.top);
      }}
      onPointerLeave={() => {
        mx.set(-9999);
        my.set(-9999);
      }}
      className="relative overflow-hidden px-6 pt-24"
      style={{ background: "#000" }}
    >
      <div className="relative mx-auto max-w-7xl">
        {/* ── above the horizon ─────────────────────────────────────────────── */}
        <div className="relative">
          <h2 className={typeClass} style={{ ...typeStyle, backgroundImage: BASE_FILL, marginBottom: BASELINE_PULL }}>
            {WORD}
          </h2>
          <motion.span
            aria-hidden
            className={`${typeClass} absolute inset-0`}
            style={{
              ...typeStyle,
              backgroundImage: LIT_FILL,
              maskImage: spotlight,
              WebkitMaskImage: spotlight,
            }}
          >
            {WORD}
          </motion.span>
        </div>

        {/* the horizon itself — a hairline the letters stand on */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-white/[0.10] to-transparent" />

        {/* ── below the horizon: the floor reflection ───────────────────────────
            fontSize is restated here so the em-based height and nudge resolve
            against the wordmark's size rather than the root's. */}
        <div
          aria-hidden
          className="relative overflow-hidden"
          style={{
            fontSize: FONT_SIZE,
            height: "0.34em",
            maskImage: "linear-gradient(180deg, rgba(0,0,0,0.5) 0%, transparent 62%)",
            WebkitMaskImage: "linear-gradient(180deg, rgba(0,0,0,0.5) 0%, transparent 62%)",
          }}
        >
          {/* scaleY flips about the box centre, which parks the mirrored feet
              BASELINE_PULL below the top edge; translateY lifts them back up. */}
          <div className="relative" style={{ transform: `translateY(${BASELINE_PULL}) scaleY(-1)`, filter: "blur(1px)" }}>
            <span className={typeClass} style={{ ...typeStyle, backgroundImage: BASE_FILL, opacity: 0.55 }}>
              {WORD}
            </span>
            <motion.span
              className={`${typeClass} absolute inset-0`}
              style={{
                ...typeStyle,
                backgroundImage: LIT_FILL,
                opacity: 0.32,
                maskImage: spotlight,
                WebkitMaskImage: spotlight,
              }}
            >
              {WORD}
            </motion.span>
          </div>
        </div>
      </div>
    </section>
  );
}
