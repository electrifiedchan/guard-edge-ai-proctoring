"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { fadeUp, stagger, wordStagger, wordReveal } from "@/lib/motion";

const HEADLINES = ["Interview Telemetry", "Composure Mirror", "Verdict Engine"];

export default function Hero() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % HEADLINES.length), 3000);
    return () => clearInterval(t);
  }, []);

  return (
    <section className="relative min-h-screen flex items-center overflow-hidden" style={{ background: "#000" }}>
      <div className="relative z-10 mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-8 px-6 lg:grid-cols-2">
        {/* LEFT — content */}
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="flex flex-col items-start gap-7 text-left"
        >
          <motion.div variants={fadeUp} className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-1.5 backdrop-blur-md">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-neutral-400 sm:text-[11px] sm:tracking-[0.2em]">
              Guided User Assessment &amp; Resume Defense
            </span>
          </motion.div>

          <h1 className="display text-6xl sm:text-7xl lg:text-[5.5rem] font-normal text-neutral-100 leading-[0.98]">
            <motion.span
              variants={wordStagger}
              initial="hidden"
              animate="show"
              className="block"
            >
              {"Your personal".split(" ").map((word, i) => (
                <span key={i} className="inline-block overflow-hidden pb-[0.24em] -mb-[0.24em] align-bottom">
                  <motion.span variants={wordReveal} className="inline-block">
                    {word}
                  </motion.span>
                  {i === 0 && <span>&nbsp;</span>}
                </span>
              ))}
            </motion.span>
            {/* pb/-mb pair: the padding grows the overflow clip box far enough to
                contain italic descenders (the y in "telemetry"), the equal negative
                margin cancels it so the paragraph below doesn't shift down. */}
            <span className="block overflow-hidden pb-[0.3em] -mb-[0.3em]">
              <AnimatePresence mode="wait">
                <motion.span
                  key={idx}
                  initial={{ opacity: 0, y: "0.4em", filter: "blur(10px)" }}
                  animate={{ opacity: 1, y: "0em", filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: "-0.4em", filter: "blur(10px)" }}
                  transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                  className="inline-block italic text-emerald-400"
                >
                  {HEADLINES[idx].toLowerCase()}
                </motion.span>
              </AnimatePresence>
            </span>
          </h1>

          <motion.p variants={fadeUp} className="max-w-md text-[16px] leading-relaxed text-neutral-400">
            Edge-AI composure analysis that runs entirely on your device.
            No cloud. No recording. Just signal.
          </motion.p>

          <motion.div variants={fadeUp} className="flex items-center gap-5 pt-1">
            <Link href="/upload" className="rounded-full bg-white px-6 py-3 text-[14px] font-medium text-black transition-transform hover:scale-[1.03]">
              Enter the Gym
            </Link>
            <a href="#pipeline" className="text-[14px] text-neutral-300 transition-colors hover:text-white">
              View the pipeline →
            </a>
          </motion.div>
        </motion.div>

        {/* RIGHT — cube (lit by the section-level corner light below) */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
          className="relative flex h-[420px] items-center justify-center sm:h-[580px]"
        >
          {/* floor glow under the cube */}
          <div
            className="pointer-events-none absolute bottom-10 left-1/2 h-[80px] w-[380px] -translate-x-1/2 rounded-[50%]"
            style={{
              background: "radial-gradient(ellipse at center, rgba(255,255,255,0.06) 0%, transparent 70%)",
              filter: "blur(18px)",
            }}
          />

          <motion.video
            src="/cube.mp4"
            autoPlay
            loop
            muted
            playsInline
            className="relative h-[360px] w-[360px] object-contain sm:h-[540px] sm:w-[540px]"
            style={{
              WebkitMaskImage: "radial-gradient(circle at center, black 75%, transparent 100%)",
              maskImage: "radial-gradient(circle at center, black 75%, transparent 100%)",
            }}
            animate={{ y: [0, -14, 0] }}
            transition={{ duration: 6, ease: "easeInOut", repeat: Infinity }}
          />

          {/* floating telemetry chips */}
          <motion.div
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.8, duration: 0.5 }}
            className="absolute left-2 top-20 z-20 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 backdrop-blur-xl"
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-neutral-500">Composure</div>
            <div className="font-mono text-base text-emerald-400">94.2%</div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1, duration: 0.5 }}
            className="absolute bottom-24 right-2 z-20 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 backdrop-blur-xl"
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-neutral-500">Latency</div>
            <div className="font-mono text-base text-sky-400">12ms</div>
          </motion.div>
        </motion.div>
      </div>

      {/* corner god ray — light source off-screen top-right, sweeping down-left
          across the cube. Screen blend lightens the video's baked black too, so
          no dark square shows around the cube. */}
      <div className="pointer-events-none absolute inset-0 z-20" style={{ mixBlendMode: "screen" }}>
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 70% 85% at 100% 0%, rgba(255,255,255,0.11) 0%, rgba(255,255,255,0.045) 35%, rgba(255,255,255,0.012) 60%, transparent 80%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "conic-gradient(from 195deg at 100% 0%, transparent 0deg, rgba(255,255,255,0.03) 12deg, rgba(255,255,255,0.055) 26deg, rgba(255,255,255,0.03) 40deg, transparent 55deg)",
            WebkitMaskImage: "radial-gradient(circle at 100% 0%, black 0%, rgba(0,0,0,0.5) 40%, transparent 80%)",
            maskImage: "radial-gradient(circle at 100% 0%, black 0%, rgba(0,0,0,0.5) 40%, transparent 80%)",
            filter: "blur(40px)",
          }}
        />
        <div
          className="absolute -left-[10%] bottom-[18%] h-[120px] w-[120%] -rotate-[4deg]"
          style={{
            background: "linear-gradient(to right, transparent 5%, rgba(255,255,255,0.025) 30%, rgba(255,255,255,0.05) 60%, transparent 90%)",
            filter: "blur(30px)",
          }}
        />
      </div>

      {/* scroll hint */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 font-mono text-[10px] uppercase tracking-[0.3em] text-neutral-600">
        scroll
      </div>
    </section>
  );
}
