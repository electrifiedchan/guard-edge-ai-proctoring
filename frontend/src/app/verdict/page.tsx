"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

export default function VerdictPage() {
  const router = useRouter();
  const [verdictData, setVerdictData] = useState<any>(null);

  useEffect(() => {
    const data = localStorage.getItem("verdictData");
    if (data) {
      setVerdictData(JSON.parse(data));
    } else {
      router.push("/");
    }
  }, [router]);

  if (!verdictData) {
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center font-mono text-sentry-neon">
        Loading Verdict...
      </div>
    );
  }

  // Parse the report paragraphs
  const reportParagraphs = verdictData.report
    .split("\n\n")
    .filter((p: string) => p.trim().length > 0);

  return (
    <main className="min-h-screen bg-[#000000] text-white p-8 font-sans selection:bg-sentry-neon selection:text-black">
      <div className="max-w-4xl mx-auto mt-12">
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-12 border-b border-[#222] pb-8"
        >
          <div className="inline-block bg-[#111] text-gray-400 text-xs font-mono px-3 py-1 rounded-full mb-4 border border-[#333]">
            {verdictData.candidate_id}
          </div>
          <h1 className="text-5xl font-bold tracking-tight text-white mb-2" style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
            G.U.A.R.D. Session <span className="text-sentry-neon">Complete.</span>
          </h1>
          <p className="text-gray-400 text-lg">
            Post-Interview AI Coaching Report
          </p>
        </motion.div>

        {/* Key Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="group relative bg-[#0a0a0a] border border-[#222] p-8 rounded-2xl overflow-hidden hover:border-sentry-neon transition-colors duration-500"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#333] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
            <h2 className="text-gray-500 text-sm mb-2 font-mono uppercase tracking-wider">Violations Logged</h2>
            <div className="text-6xl font-bold text-white tracking-tighter">
              {verdictData.total_violations}
            </div>
          </motion.div>
          
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="group relative bg-[#0a0a0a] border border-[#222] p-8 rounded-2xl overflow-hidden hover:border-red-500 transition-colors duration-500"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-red-900 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
            <h2 className="text-gray-500 text-sm mb-2 font-mono uppercase tracking-wider">Peak Risk Score</h2>
            <div className="text-6xl font-bold text-white tracking-tighter">
              {verdictData.risk_score}<span className="text-2xl text-gray-600">%</span>
            </div>
          </motion.div>
        </div>

        {/* The AI Report (Glowing/Highlighted) */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="relative rounded-3xl p-[1px] bg-gradient-to-b from-[#333] to-[#111] overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-b from-sentry-neon/10 to-transparent opacity-50 blur-xl" />
          <div className="relative bg-[#050505] rounded-3xl p-10 h-full backdrop-blur-sm">
            <h3 className="text-xl font-semibold mb-6 flex items-center text-white">
              <span className="w-3 h-3 rounded-full bg-sentry-neon mr-3 shadow-[0_0_10px_#00FF41]"></span>
              Coach Llama 3.1 Verdict
            </h3>
            
            <div className="space-y-6 text-gray-300 leading-relaxed text-lg font-light">
              {reportParagraphs.map((para: string, idx: number) => (
                <motion.p 
                  key={idx}
                  initial={{ opacity: 0, filter: "blur(4px)" }}
                  animate={{ opacity: 1, filter: "blur(0px)" }}
                  transition={{ duration: 0.8, delay: 0.8 + (idx * 0.3) }}
                  className={idx === 1 ? "text-red-300 mr-4 border-l-2 border-red-500/50 pl-4 py-1" : idx === 2 ? "text-sentry-neon/90" : ""}
                >
                  {para}
                </motion.p>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Return Action */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.5 }}
          className="mt-12 text-center"
        >
          <button 
            onClick={() => router.push("/")}
            className="text-sm font-mono text-gray-500 hover:text-white transition-colors border-b border-transparent hover:border-white pb-1"
          >
            [ RETURN TO DASHBOARD ]
          </button>
        </motion.div>
      </div>
    </main>
  );
}