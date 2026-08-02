"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { fadeUp, stagger } from "@/lib/motion";
import GlowTriangle from "@/components/landing/GlowTriangle";

export default function CTASection() {
  return (
    <section id="verdict" className="relative scroll-mt-28 px-6 py-24 overflow-hidden" style={{ background: "#000" }}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(52,211,153,0.06),transparent_60%)]" />
      <motion.div
        variants={stagger}
        initial="hidden"
        whileInView="show"
        viewport={{ margin: "-80px" }}
        className="mx-auto max-w-2xl text-center flex flex-col items-center gap-6"
      >
        <motion.p variants={fadeUp} className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500">
          no account · no upload · no excuses
        </motion.p>
        {/* Canvas is much larger than the mark itself — the shader draws the
            triangle at 30% of half-height, leaving the rest as bleed room for
            the halo. Negative margins keep it from inflating the section. */}
        <motion.div variants={fadeUp} className="-my-6">
          <GlowTriangle className="h-[240px] w-[300px] sm:h-[300px] sm:w-[380px]" />
        </motion.div>
        <motion.h2 variants={fadeUp} className="display text-4xl sm:text-5xl font-normal tracking-tight text-neutral-100">
          Start your first session in 60 seconds.
        </motion.h2>
        <motion.div variants={fadeUp} className="flex items-center gap-4">
          <Link href="/upload" className="rounded-full bg-emerald-400 px-8 py-3 text-[13px] font-medium text-neutral-950 hover:bg-emerald-300 transition-colors">
            Enter the Gym →
          </Link>
          <a href="#" className="text-[13px] text-neutral-400 hover:text-neutral-100 transition-colors">
            Read the docs
          </a>
        </motion.div>
      </motion.div>
    </section>
  );
}
