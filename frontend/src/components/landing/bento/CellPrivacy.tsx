"use client";

import { motion } from "framer-motion";

/**
 * PRIVACY · ZERO-CLOUD — AuthKit-style feature-bullet list.
 *
 * A vertical list of guarantees (like AuthKit's auth-method list): each row has a
 * leading check icon, a label on the left, and a mono "NEVER" badge on the right,
 * separated by thin hairline dividers. Rows reveal in a small stagger.
 *
 * Theme: PRIVACY = emerald (the safe / "go" color) — "NEVER uploaded" is the good
 * state, so the badge is emerald, not red. No purple/pink, no gradients.
 */

const ITEMS = [
  { label: "Video uploaded", value: "NEVER" },
  { label: "Audio uploaded", value: "NEVER" },
  { label: "Data leaves device", value: "NEVER" },
];

// small emerald check, AuthKit-style bullet marker
function Check() {
  return (
    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-emerald-400/25 bg-emerald-400/[0.08]">
      <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="#34d399" strokeWidth="2">
        <path d="M2.5 6.2 L5 8.5 L9.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export default function CellPrivacy() {
  return (
    <div className="flex flex-col gap-3 p-8 h-full">
      <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500 whitespace-nowrap">
        Privacy · Zero-Cloud
      </span>

      {/* inset panel — the focal data element (two-tier elevation) */}
      <div className="flex-1 rounded-xl bg-neutral-950 border border-white/[0.06] px-4 py-3 flex flex-col justify-center">
        {/* AuthKit-style feature-bullet list */}
        <ul>
          {ITEMS.map(({ label, value }, i) => (
            <motion.li
              key={label}
              initial={{ opacity: 0, x: -6 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{}}
              transition={{ duration: 0.35, delay: 0.1 + i * 0.12, ease: "easeOut" }}
              className={`flex items-center gap-2.5 py-1.5 ${
                i < ITEMS.length - 1 ? "border-b border-white/[0.08]" : ""
              }`}
            >
              <Check />
              <span className="font-mono text-xs uppercase tracking-wider text-neutral-300">
                {label}
              </span>
              <span className="ml-auto font-mono text-xs tracking-wider text-emerald-400">
                {value}
              </span>
            </motion.li>
          ))}
        </ul>

        {/* status footer, AuthKit-style */}
        <div className="mt-2.5 flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-emerald-400">
            All inference on-device
          </span>
        </div>
      </div>

      <p className="font-sans text-[13px] tracking-normal leading-snug text-neutral-400">
        Sovereign edge-AI — your session data never leaves your machine.
      </p>
    </div>
  );
}
