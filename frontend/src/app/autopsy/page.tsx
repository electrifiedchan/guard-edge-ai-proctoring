"use client";

import React, { useEffect, useState } from "react";

interface AutopsyLog {
  id: number;
  candidate_id: string;
  timestamp: string;
  gaze: string;
  is_critical: boolean;
  risk_score: number;
  intervention_level: string;
  ai_logic_trace: string;
  image_payload: string; // URL path served by backend StaticFiles, or legacy base64
}

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

// Resolves an image_payload field into a usable <img src>. Supports the new
// filesystem URL scheme as well as legacy base64-encoded rows still in the DB.
function resolveEvidenceSrc(payload: string): string {
  if (!payload) return "";
  if (payload.startsWith("data:")) return payload;
  if (payload.startsWith("http://") || payload.startsWith("https://")) return payload;
  if (payload.startsWith("/")) return `${API_BASE}${payload}`;
  return `data:image/jpeg;base64,${payload}`;
}

export default function AutopsyPage() {
  const [logs, setLogs] = useState<AutopsyLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/v1/autopsy-logs`);
        if (response.ok) {
          const data = await response.json();
          setLogs(data);
        }
      } catch (error) {
        console.error("Failed to fetch autopsy logs:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, []);

  const getLevelStyle = (level: string) => {
    if (level.includes("SEVERE")) return "text-red-500 bg-red-500/10 border-red-500/30";
    if (level.includes("HARD")) return "text-orange-400 bg-orange-500/10 border-orange-500/30";
    if (level.includes("WARNING")) return "text-yellow-400 bg-yellow-500/10 border-yellow-500/30";
    return "text-gray-400 bg-gray-500/10 border-gray-500/30";
  };

  return (
    <main className="min-h-screen bg-[#0A0A0B] text-gray-300 font-mono p-8 flex flex-col items-center">
      {/* --- HEADER --- */}
      <header className="w-full max-w-[1400px] mb-12 border-b border-red-900/50 pb-8">
        <div className="flex items-center gap-3 mb-2">
          <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse shadow-[0_0_12px_rgba(239,68,68,0.6)]" />
          <span className="text-[10px] tracking-[0.4em] text-red-400 font-bold">
            CLASSIFICATION: RESTRICTED
          </span>
        </div>
        <h1 className="text-4xl md:text-5xl font-black tracking-wider text-red-500 leading-tight">
          S.P.A.R.T.A. TERMINAL AUTOPSY
        </h1>
        <p className="text-sm tracking-widest text-red-400/70 mt-3 uppercase">
          Security Failures Detected — Irrefutable Photographic Evidence
        </p>
        <div className="flex gap-6 mt-6 text-[11px] tracking-widest text-gray-500">
          <span>TOTAL VIOLATIONS: <span className="text-red-400 font-bold">{logs.length}</span></span>
          <span>ENGINE: <span className="text-gray-300">YOLOv8n + LLAMA 3.1</span></span>
          <span>DATABASE: <span className="text-gray-300">SQLite3 / sentry_logs.db</span></span>
        </div>
      </header>

      {/* --- LOADING STATE --- */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-32 text-gray-600">
          <div className="w-8 h-8 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin mb-4" />
          <span className="text-xs tracking-widest">DECRYPTING EVIDENCE LEDGER...</span>
        </div>
      )}

      {/* --- EMPTY STATE --- */}
      {!loading && logs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-32 text-gray-600">
          <span className="text-6xl mb-4">✓</span>
          <span className="text-sm tracking-widest text-green-500">NO SECURITY VIOLATIONS RECORDED</span>
          <span className="text-xs tracking-widest text-gray-600 mt-2">Session integrity verified.</span>
        </div>
      )}

      {/* --- THE EVIDENCE GRID --- */}
      {!loading && logs.length > 0 && (
        <div className="w-full max-w-[1400px] grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {logs.map((log, index) => (
            <div
              key={log.id}
              className="bg-[#0E0E10] border border-red-900/40 rounded-lg overflow-hidden hover:border-red-500/60 transition-all duration-300 group"
            >
              {/* Evidence Photo */}
              <div className="relative">
                <img
                  src={resolveEvidenceSrc(log.image_payload)}
                  alt={`Evidence frame ${index + 1}`}
                  loading="lazy"
                  className="w-full h-48 object-cover grayscale opacity-80 group-hover:opacity-100 group-hover:grayscale-0 transition-all duration-500"
                />
                {/* Overlay Badge */}
                <div className="absolute top-2 left-2 flex items-center gap-2">
                  <span className="bg-red-600/90 text-white text-[9px] tracking-widest font-bold px-2 py-1 rounded">
                    EVIDENCE #{String(index + 1).padStart(3, "0")}
                  </span>
                </div>
                <div className="absolute top-2 right-2">
                  <span className={`text-[9px] tracking-widest font-bold px-2 py-1 rounded border ${getLevelStyle(log.intervention_level)}`}>
                    {log.intervention_level}
                  </span>
                </div>
                {/* Risk Score Overlay */}
                <div className="absolute bottom-2 right-2 bg-black/80 border border-red-900/50 rounded px-2 py-1">
                  <span className="text-red-400 text-xs font-bold">{log.risk_score}%</span>
                  <span className="text-gray-500 text-[9px] ml-1">RISK</span>
                </div>
              </div>

              {/* Evidence Metadata */}
              <div className="p-4 space-y-3">
                {/* Timestamp */}
                <div className="flex items-center gap-2 text-[10px] text-gray-500 tracking-widest">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                  {new Date(log.timestamp).toLocaleString()}
                </div>

                {/* Logic Trace */}
                <div className="bg-[#0A0A0B] border border-[#1A1A1E] rounded p-3">
                  <span className="text-[9px] tracking-widest text-gray-600 block mb-1">AI LOGIC TRACE</span>
                  <p className="text-xs text-red-400/90 font-mono leading-relaxed">
                    {log.ai_logic_trace || "N/A"}
                  </p>
                </div>

                {/* Gaze + Candidate */}
                <div className="flex justify-between items-center text-[10px] text-gray-500 tracking-widest pt-1 border-t border-[#1A1A1E]">
                  <span>GAZE: <span className="text-gray-300">{log.gaze}</span></span>
                  <span className="text-gray-600">{log.candidate_id.substring(0, 8)}...</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* --- FOOTER --- */}
      <footer className="w-full max-w-[1400px] mt-16 pt-6 border-t border-[#1A1A1E] text-center">
        <p className="text-[10px] tracking-[0.3em] text-gray-600">
          G.U.A.R.D. TERMINAL AUTOPSY MODULE — POWERED BY S.P.A.R.T.A. EDGE-AI ENGINE
        </p>
        <p className="text-[9px] tracking-widest text-gray-700 mt-1">
          ALL EVIDENCE IS CRYPTOGRAPHICALLY TIMESTAMPED AND TAMPER-PROOF
        </p>
      </footer>
    </main>
  );
}
