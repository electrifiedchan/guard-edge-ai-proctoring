"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.nav
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="fixed top-4 inset-x-0 z-50 flex justify-center pointer-events-none"
    >
      <div className={cn(
        "pointer-events-auto flex items-center gap-8 rounded-full px-6 py-2.5 transition-all duration-300",
        scrolled
          ? "border border-white/[0.08] bg-black/70 backdrop-blur-xl"
          : "border border-transparent bg-transparent"
      )}>
        <span className="font-mono text-[12px] uppercase tracking-[0.25em] text-neutral-100">
          GUARD
        </span>
        <div className="hidden md:flex items-center gap-7">
          {["Telemetry", "Pipeline", "Verdict"].map((item) => (
            <a key={item} href={`#${item.toLowerCase()}`} className="text-[13px] text-neutral-400 hover:text-neutral-100 transition-colors">
              {item}
            </a>
          ))}
          {/* Returning users need a way back to their progress. Without this
              /dashboard had no inbound link anywhere in the app and was only
              reachable by typing the URL. */}
          <Link href="/dashboard" className="text-[13px] text-neutral-400 hover:text-neutral-100 transition-colors">
            Dashboard
          </Link>
        </div>
        <Link
          href="/upload"
          className="rounded-full bg-white px-4 py-1.5 text-[12px] font-medium text-black hover:scale-[1.04] transition-transform"
        >
          Enter the Gym
        </Link>
      </div>
    </motion.nav>
  );
}
