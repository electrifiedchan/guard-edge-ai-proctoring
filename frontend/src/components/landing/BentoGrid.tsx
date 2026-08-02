"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { fadeUp, stagger } from "@/lib/motion";
import CellVision from "@/components/landing/bento/CellVision";
import CellVoice from "@/components/landing/bento/CellVoice";
import CellLlama from "@/components/landing/bento/CellLlama";
import CellPrivacy from "@/components/landing/bento/CellPrivacy";
import CellStar from "@/components/landing/bento/CellStar";

const glass = "rounded-2xl relative overflow-hidden h-full";

/**
 * CardShell — bento card with an emerald glow that REVOLVES around the border,
 * so every box looks animated and shining. A rotating conic-gradient sweep sits
 * behind an inset inner surface, leaving a ~1px moving highlight along the edge.
 */
function CardShell({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <motion.div variants={fadeUp} className={cn(glass, className)}>
      {/* revolving emerald sweep (the shine that travels around the box) */}
      <motion.div
        aria-hidden
        className="absolute left-1/2 top-1/2 h-[170%] w-[170%] -translate-x-1/2 -translate-y-1/2"
        style={{
          background:
            "conic-gradient(from 0deg, transparent 0deg, rgba(52,211,153,0.65) 35deg, rgba(52,211,153,0.15) 90deg, transparent 150deg)",
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
      />
      {/* inner card surface — opaque so the conic center can't bleed through; only the glowing 1px edge ring shows */}
      <div className="absolute inset-[1px] rounded-2xl border border-white/[0.06] bg-neutral-900 backdrop-blur-md" />
      {/* actual cell content, above the ring */}
      <div className="relative h-full">{children}</div>
    </motion.div>
  );
}


export default function BentoGrid() {
  return (
    <section id="telemetry" className="relative scroll-mt-28 px-6 py-28" style={{ background: "#000" }}>
      <motion.div
        variants={stagger}
        initial="hidden"
        whileInView="show"
        viewport={{ margin: "-80px" }}
        className="mx-auto max-w-6xl"
      >
        <motion.div variants={fadeUp} className="text-center mb-10">
          <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-neutral-500">The Stack</span>
          <h2 className="display mt-3 text-4xl sm:text-5xl font-normal tracking-tight text-neutral-100">Everything runs on your machine.</h2>
        </motion.div>

        {/* Anchor + rail — 12-col lattice.
            Vision is the anchor (cols 1–7, 2 rows tall = ≥2× any other cell); a
            right rail stacks Voice over Verdict; Privacy + Questions form the base
            row. gap-4 = 16px gutter (half of each card's 32px inner padding).
            Responsive: single column on mobile, 2-col on tablet, 12-col on desktop. */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4 lg:auto-rows-[280px]">
          {/* VISION — anchor: cols 1–7, rows 1–2 */}
          <CardShell className="min-h-[320px] md:col-span-2 lg:col-span-7 lg:row-span-2 lg:min-h-0">
            <CellVision />
          </CardShell>

          {/* VOICE — rail top: cols 8–12, row 1 */}
          <CardShell className="min-h-[280px] md:col-span-1 lg:col-span-5 lg:min-h-0">
            <CellVoice />
          </CardShell>

          {/* VERDICT — rail bottom: cols 8–12, row 2 */}
          <CardShell className="min-h-[240px] md:col-span-1 lg:col-span-5 lg:min-h-0">
            <CellLlama />
          </CardShell>

          {/* PRIVACY — base row: cols 1–6, row 3 */}
          <CardShell className="min-h-[240px] md:col-span-1 lg:col-span-6 lg:min-h-0">
            <CellPrivacy />
          </CardShell>

          {/* QUESTIONS — base row: cols 7–12, row 3 */}
          <CardShell className="min-h-[240px] md:col-span-1 lg:col-span-6 lg:min-h-0">
            <CellStar />
          </CardShell>
        </div>
      </motion.div>
    </section>
  );
}
