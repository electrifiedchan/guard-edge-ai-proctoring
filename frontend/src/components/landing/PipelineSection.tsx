"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { fadeUp, stagger } from "@/lib/motion";

const STEPS = [
  { idx: "01", title: "Capture", desc: "MediaPipe reads 468 face landmarks at 30fps — on-device, no stream." },
  { idx: "02", title: "Analyze", desc: "Behavioral engine scores gaze, blink rate, and composure in real time." },
  { idx: "03", title: "Transcribe", desc: "Whisper converts your speech to text locally — zero audio upload." },
  { idx: "04", title: "Verdict", desc: "Local LLM judges your answer and generates a coach report." },
];

/**
 * Sequential pipeline animation, driven on hover:
 *   circle 1 glows → line 1→2 draws → circle 2 glows → line 2→3 draws → …
 * driven by a single `progress` counter that ticks forward once per hover.
 *
 * progress encodes an alternating circle/segment timeline:
 *   0 = circle0 lit, 1 = seg0(0→1) filled, 2 = circle1 lit, 3 = seg1(1→2),
 *   4 = circle2 lit, 5 = seg2(2→3), 6 = circle3 lit.
 * circle i is lit when progress >= i*2 ; segment i is filled when progress >= i*2+1.
 */
const LAST = STEPS.length * 2 - 2; // 6

export default function PipelineSection() {
  const [progress, setProgress] = useState(-1); // -1 = idle; 0..LAST = active stage
  const [hovered, setHovered] = useState(false);

  // Hover drives the chain: enter → run once to the end and hold; leave → reset.
  // The updater is PURE (no timers created inside it) and clamps at LAST, so
  // React StrictMode's double-invoke is safe and the chain never loops.
  useEffect(() => {
    if (!hovered) {
      setProgress(-1);
      return;
    }
    setProgress(0);
    const id = setInterval(() => {
      setProgress((p) => (p >= LAST ? p : p + 1));
    }, 400);
    return () => clearInterval(id);
  }, [hovered]);


  const circleLit = (i: number) => progress >= i * 2;
  const segFilled = (i: number) => progress >= i * 2 + 1;

  return (
    <section id="pipeline" className="relative scroll-mt-28 bg-neutral-950 px-6 py-24">
      <motion.div
        variants={stagger}
        initial="hidden"
        whileInView="show"
        viewport={{ margin: "-80px" }}
        className="mx-auto max-w-5xl"
      >
        <motion.div variants={fadeUp} className="text-center mb-16">
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500">How it works</span>
          <h2 className="display mt-3 text-4xl sm:text-5xl font-normal tracking-tight text-neutral-100">Four steps. Zero cloud.</h2>
        </motion.div>

        <div
          className="relative grid grid-cols-4 gap-6"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {/* connector segments — one per gap between adjacent circles.
              Each spans 25% (one column) starting at the first circle's center. */}
          {STEPS.slice(0, -1).map((_, i) => (
            <div
              key={i}
              className="pointer-events-none absolute top-6 -translate-y-1/2 h-px bg-white/[0.08]"
              style={{ left: `${12.5 + i * 25}%`, width: "25%" }}
            >
              <motion.div
                className="absolute inset-0 origin-left bg-gradient-to-r from-emerald-400/60 to-emerald-400/60"
                initial={false}
                animate={{ scaleX: segFilled(i) ? 1 : 0 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              />
              {/* bright leading dot travels along the segment as it fills */}
              <motion.div
                className="absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-emerald-300 shadow-[0_0_10px_2px_rgba(52,211,153,0.7)]"
                initial={false}
                animate={{ left: segFilled(i) ? "100%" : "0%", opacity: segFilled(i) ? [0, 1, 0] : 0 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          ))}

          {STEPS.map(({ idx, title, desc }, i) => {
            const lit = circleLit(i);
            return (
              <motion.div key={idx} variants={fadeUp} className="relative z-10 flex flex-col items-center gap-3 text-center">
                <motion.div
                  className="flex items-center justify-center w-12 h-12 rounded-full bg-neutral-950"
                  animate={{
                    borderColor: lit ? "rgba(52,211,153,0.9)" : "rgba(255,255,255,0.08)",
                    boxShadow: lit
                      ? "0 0 22px -2px rgba(52,211,153,0.65)"
                      : "0 0 0px 0px rgba(52,211,153,0)",
                    scale: lit ? 1.08 : 1,
                  }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                  style={{ borderWidth: 1, borderStyle: "solid" }}
                >
                  <motion.span
                    className="font-mono text-[11px]"
                    animate={{ color: lit ? "#6ee7b7" : "#34d39955" }}
                    transition={{ duration: 0.35 }}
                  >
                    {idx}
                  </motion.span>
                </motion.div>
                <h3 className="text-[15px] font-medium text-neutral-100">{title}</h3>
                <p className="text-[13px] text-neutral-500 leading-relaxed">{desc}</p>
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    </section>
  );
}
