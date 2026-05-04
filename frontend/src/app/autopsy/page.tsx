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
  const [backendOnline, setBackendOnline] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/v1/autopsy-logs`);
        if (response.ok) {
          const data = await response.json();
          setLogs(data);
          setBackendOnline(true);
        } else {
          setBackendOnline(false);
        }
      } catch {
        setBackendOnline(false);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, []);

  const getLevelStyle = (level: string) => {
    if (level.includes("SEVERE")) return "text-[var(--color-danger)] bg-[var(--color-danger)]/10 border-[var(--color-danger)]/30";
    if (level.includes("HARD")) return "text-[var(--color-amber)] bg-[var(--color-amber)]/10 border-[var(--color-amber)]/30";
    if (level.includes("WARNING")) return "text-[var(--color-warn)] bg-[var(--color-warn)]/10 border-[var(--color-warn)]/30";
    return "text-[var(--color-slate)] bg-[var(--color-surface-2)] border-[var(--color-hairline)]";
  };

  return (
    <main className="min-h-screen bg-[var(--color-canvas)] text-[var(--color-parchment)] font-mono p-8 flex flex-col items-center">
      {/* --- HEADER --- */}
      <header className="w-full max-w-[1400px] mb-12 border-b border-[var(--color-hairline)] pb-8">
        <div className="flex items-center gap-3 mb-2">
          <span className="w-2 h-2 rounded-full bg-[var(--color-danger)] pulse-danger" />
          <span className="eyebrow text-[var(--color-danger)]">
            CLASSIFICATION: RESTRICTED
          </span>
        </div>
        <h1 className="font-display text-4xl md:text-5xl font-semibold text-[var(--color-snow)] leading-tight">
          Guard Evidence Autopsy
        </h1>
        <p className="text-sm text-[var(--color-slate)] mt-3">
          Security failures detected — photographic evidence ledger
        </p>
        <div className="flex flex-wrap gap-3 mt-6 text-[11px] text-[var(--color-slate)]">
          <span className="rounded-md border border-[var(--color-hairline)] bg-[var(--color-surface)] px-2.5 py-1">TOTAL VIOLATIONS: <span className="text-[var(--color-danger)] font-bold">{logs.length}</span></span>
          <span className="rounded-md border border-[var(--color-hairline)] bg-[var(--color-surface)] px-2.5 py-1">ENGINE: <span className="text-[var(--color-parchment)]">YOLOv8n + LLAMA 3.1</span></span>
          <span className="rounded-md border border-[var(--color-hairline)] bg-[var(--color-surface)] px-2.5 py-1">DATABASE: <span className="text-[var(--color-parchment)]">SQLite3 / sentry_logs.db</span></span>
        </div>
      </header>

      {/* --- LOADING STATE --- */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-32 text-[var(--color-slate)]">
          <div className="w-8 h-8 border-2 border-[var(--color-iris)]/30 border-t-[var(--color-iris)] rounded-full animate-spin mb-4" />
          <span className="text-xs">Decrypting evidence ledger...</span>
        </div>
      )}

      {/* --- EMPTY STATE --- */}
      {!loading && logs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-32 text-[var(--color-slate)]">
          <span className={`text-5xl mb-4 ${backendOnline ? "text-[var(--color-signal)]" : "text-[var(--color-amber)]"}`}>
            {backendOnline ? "✓" : "!"}
          </span>
          <span className={`text-sm ${backendOnline ? "text-[var(--color-signal)]" : "text-[var(--color-amber)]"}`}>
            {backendOnline ? "No security violations recorded" : "Evidence backend offline"}
          </span>
          <span className="text-xs text-[var(--color-slate)] mt-2">
            {backendOnline ? "Session integrity verified." : "Start FastAPI on port 8080 to load autopsy evidence."}
          </span>
        </div>
      )}

      {/* --- THE EVIDENCE GRID --- */}
      {!loading && logs.length > 0 && (
        <div className="w-full max-w-[1400px] grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {logs.map((log, index) => (
            <div
              key={log.id}
              className="lift-1 rounded-lg overflow-hidden hover:border-[var(--color-danger)]/50 transition-colors duration-300 group"
            >
              {/* Evidence Photo */}
              <div className="relative">
                <img
                  src={resolveEvidenceSrc(log.image_payload)}
                  alt={`Evidence frame ${index + 1}`}
                  loading="lazy"
                  className="w-full h-48 object-cover grayscale opacity-80 group-hover:opacity-100 group-hover:grayscale-0 transition-opacity duration-500"
                />
                {/* Overlay Badge */}
                <div className="absolute top-2 left-2 flex items-center gap-2">
                  <span className="bg-[var(--color-danger)]/90 text-white text-[9px] font-bold px-2 py-1 rounded">
                    EVIDENCE #{String(index + 1).padStart(3, "0")}
                  </span>
                </div>
                <div className="absolute top-2 right-2">
                  <span className={`text-[9px] font-bold px-2 py-1 rounded border ${getLevelStyle(log.intervention_level)}`}>
                    {log.intervention_level}
                  </span>
                </div>
                {/* Risk Score Overlay */}
                <div className="absolute bottom-2 right-2 bg-[var(--color-canvas)]/80 border border-[var(--color-hairline)] rounded px-2 py-1">
                  <span className="text-[var(--color-danger)] text-xs font-bold">{log.risk_score}%</span>
                  <span className="text-[var(--color-slate)] text-[9px] ml-1">RISK</span>
                </div>
              </div>

              {/* Evidence Metadata */}
              <div className="p-4 space-y-3">
                {/* Timestamp */}
                <div className="flex items-center gap-2 text-[10px] text-[var(--color-slate)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-danger)]" />
                  {new Date(log.timestamp).toLocaleString()}
                </div>

                {/* Logic Trace */}
                <div className="bg-[var(--color-canvas)] border border-[var(--color-hairline)] rounded p-3">
                  <span className="eyebrow text-[9px] block mb-1">AI LOGIC TRACE</span>
                  <p className="text-xs text-[var(--color-danger)] font-mono leading-relaxed">
                    {log.ai_logic_trace || "N/A"}
                  </p>
                </div>

                {/* Gaze + Candidate */}
                <div className="flex justify-between items-center text-[10px] text-[var(--color-slate)] pt-1 border-t border-[var(--color-hairline)]">
                  <span>GAZE: <span className="text-[var(--color-parchment)]">{log.gaze}</span></span>
                  <span>{log.candidate_id.substring(0, 8)}...</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* --- FOOTER --- */}
      <footer className="w-full max-w-[1400px] mt-16 pt-6 border-t border-[var(--color-hairline)] text-center">
        <p className="text-[10px] text-[var(--color-slate)]">
          G.U.A.R.D. EVIDENCE AUTOPSY MODULE — POWERED BY EDGE-AI ENGINE
        </p>
        <p className="text-[9px] text-[var(--color-fog)] mt-1">
          ALL EVIDENCE IS CRYPTOGRAPHICALLY TIMESTAMPED AND TAMPER-PROOF
        </p>
      </footer>
    </main>
  );
}
