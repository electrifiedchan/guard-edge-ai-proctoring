"use client";

import { motion } from "framer-motion";

const ITEMS = [
  "COMPOSURE · 94.2%", "FOCUS SCORE · 87.5", "LATENCY · 12ms",
  "GAZE STABILITY · 96.1%", "VOICE CLARITY · 91.3%", "SESSIONS · 1,204",
  "AVG VERDICT · A−", "EDGE INFERENCE · ON", "CLOUD UPLOAD · NEVER",
];

const Row = () => (
  <div className="flex items-center gap-12 pr-12">
    {ITEMS.map((item) => (
      <span key={item} className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500 whitespace-nowrap">
        {item}
      </span>
    ))}
  </div>
);

export default function TelemetryStrip() {
  return (
    <div className="relative overflow-hidden border-y border-white/[0.06] py-3 bg-neutral-950">
      <motion.div
        className="flex"
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: 30, ease: "linear", repeat: Infinity }}
      >
        <Row /><Row />
      </motion.div>
    </div>
  );
}
