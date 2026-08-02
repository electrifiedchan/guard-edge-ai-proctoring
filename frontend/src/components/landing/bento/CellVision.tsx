"use client";

import { motion } from "framer-motion";
import { FACE_PTS, FACE_EDGES, FACE_OPACITY, FACE_KEY } from "@/components/landing/bento/faceMeshData";

/**
 * VISION — hardcoded face wireframe (front-facing, 2D).
 *
 * Points are the user's exact FACE_POINTS array (eyes, brows, nose ridge, mouth,
 * jaw), Delaunay-triangulated with long edges (>22) removed. The face fills ~70%
 * of the cell via the SVG viewBox (coordinates are NOT hand-multiplied).
 * Emerald = VISION domain.
 */

const KEY = new Set(FACE_KEY);

export default function CellVision() {
  return (
    <div className="flex flex-col gap-3 p-8 h-full">
      <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500">
        Vision · MediaPipe
      </span>

      <div className="flex-1 relative rounded-xl overflow-hidden bg-neutral-950 border border-white/[0.06]">
        {/* HUD corner brackets — small, restrained */}
        {[
          "top-2.5 left-2.5 border-t border-l",
          "top-2.5 right-2.5 border-t border-r",
          "bottom-2.5 left-2.5 border-b border-l",
          "bottom-2.5 right-2.5 border-b border-r",
        ].map((c) => (
          <span key={c} className={`absolute h-3.5 w-3.5 border-emerald-400/40 ${c}`} />
        ))}

        {/* viewBox cropped tight to the mesh bounds (x19–81, y8–92) with a small
            pad so the wireframe fills ~75% of the panel instead of floating small */}
        <svg viewBox="15 4 70 92" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
          <defs>
            <clipPath id="fmScan">
              <rect x="-10" y="-10" width="120" height="120" />
            </clipPath>
          </defs>

          {/* triangle wireframe — the dominant element */}
          <g stroke="#34d399" strokeOpacity="0.25" strokeWidth="0.4" fill="none">
            {FACE_EDGES.map(([a, b], i) => {
              const pa = FACE_PTS[a];
              const pb = FACE_PTS[b];
              return (
                <motion.line
                  key={i}
                  x1={pa[0]} y1={pa[1]} x2={pb[0]} y2={pb[1]}
                  initial={{ pathLength: 0, opacity: 0 }}
                  whileInView={{ pathLength: 1, opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.7, delay: 0.15 + (i % 50) * 0.006 }}
                />
              );
            })}
          </g>

          {/* tiny fully-opaque dots at the joints; gentle opacity pulse */}
          <g fill="#34d399">
            {FACE_PTS.map(([x, y], i) => {
              const isKey = KEY.has(i);
              const base = FACE_OPACITY[i];
              return (
                <motion.circle
                  key={i}
                  cx={x} cy={y}
                  r={isKey ? 2 : 1}
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: [base - 0.15, base, base - 0.15] }}
                  viewport={{ once: true }}
                  transition={{
                    duration: 3.4,
                    delay: 0.3 + (i % 30) * 0.02,
                    repeat: Infinity,
                    repeatType: "reverse",
                    ease: "easeInOut",
                  }}
                />
              );
            })}
          </g>

          {/* one thin emerald scan line sweeping top→bottom every ~4s */}
          <g clipPath="url(#fmScan)">
            <motion.line
              x1="-10" x2="110"
              stroke="#34d399" strokeWidth="0.4" opacity="0.4"
              animate={{ y1: [0, 100, 0], y2: [0, 100, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            />
          </g>
        </svg>

        {/* restrained readouts */}
        <div className="absolute bottom-2 left-2 font-mono text-[10px] text-neutral-500 flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          468 landmarks · 30fps
        </div>
        <div className="absolute top-2.5 right-6 font-mono text-[10px] text-neutral-500 text-right leading-relaxed">
          gaze&nbsp;&nbsp;on-axis<br />blink&nbsp;&nbsp;0.31 hz
        </div>
      </div>

      <p className="font-sans text-[13px] tracking-normal text-neutral-400">
        Real-time face mesh — gaze, blink, and composure signals extracted on-device.
      </p>
    </div>
  );
}
