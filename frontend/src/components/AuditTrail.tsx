"use client";

import React, { useEffect, useState } from "react";

interface AuditLog {
  id: number;
  candidate_id: string;
  timestamp: string;
  gaze: string;
  is_critical: boolean;
  risk_score: number;
  intervention_level: string;
  ai_logic_trace: string;
}

export default function AuditTrail() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const response = await fetch("http://localhost:8080/api/v1/logs");
        if (response.ok) {
          const data = await response.json();
          setLogs(data);
        }
      } catch (error) {
        console.error("Failed to fetch audit logs:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, 10000); // Poll every 10 seconds

    return () => clearInterval(interval);
  }, []);

  const getInterventionColor = (level: string) => {
    switch (level) {
      case "SEVERE_VIOLATION_LOGGED":
      case "TERMINAL":
        return "text-[var(--color-danger)]";
      case "HARD_WARNING":
      case "WARNING_LOGGED":
      case "WARNING":
        return "text-[var(--color-amber)]";
      case "SOFT_WARNING":
        return "text-[var(--color-warn)]";
      case "CLEAR":
      default:
        return "text-[var(--color-slate)]";
    }
  };

  const riskPillColor = (s: number) =>
    s >= 80 ? "text-[var(--color-danger)] bg-[var(--color-danger)]/[0.08] border-[var(--color-danger)]/30" :
    s >= 40 ? "text-[var(--color-amber)] bg-[var(--color-amber)]/[0.08] border-[var(--color-amber)]/30"  :
    s >= 20 ? "text-[var(--color-warn)] bg-[var(--color-warn)]/[0.08] border-[var(--color-warn)]/30"     :
              "text-[var(--color-signal)] bg-[var(--color-signal)]/[0.06] border-[var(--color-signal)]/25";

  return (
    <div className="w-full h-full lift-1 rounded-xl p-5 overflow-hidden flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex flex-col">
          <span className="eyebrow mb-1">Audit trail</span>
          <h2 className="font-display text-[18px] font-semibold tracking-tight text-[var(--color-snow)]">
            Security events
          </h2>
        </div>
        <span className="text-[11px] text-[var(--color-slate)] tabular">
          {logs.length} {logs.length === 1 ? "entry" : "entries"}
        </span>
      </div>

      <div className="overflow-y-auto flex-1 -mx-2">
        {loading && logs.length === 0 ? (
          <div className="flex justify-center items-center h-full text-[var(--color-slate)] text-[13px]">
            Scanning temporal logs…
          </div>
        ) : (
          <table className="w-full text-left border-collapse text-[12.5px]">
            <thead className="sticky top-0 bg-[var(--color-surface)] z-10">
              <tr className="text-[var(--color-slate)] border-b border-[var(--color-hairline)]">
                <th className="py-2.5 px-3 font-medium uppercase text-[10px] tracking-[0.12em]">Time</th>
                <th className="py-2.5 px-3 font-medium uppercase text-[10px] tracking-[0.12em]">Candidate</th>
                <th className="py-2.5 px-3 font-medium uppercase text-[10px] tracking-[0.12em]">Gaze</th>
                <th className="py-2.5 px-3 font-medium uppercase text-[10px] tracking-[0.12em]">Risk</th>
                <th className="py-2.5 px-3 font-medium uppercase text-[10px] tracking-[0.12em]">Level</th>
                <th className="py-2.5 px-3 font-medium uppercase text-[10px] tracking-[0.12em] w-1/3">Logic trace</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr
                  key={log.id}
                  className="border-b border-[var(--color-hairline)]/60 hover:bg-[var(--color-surface-2)] transition-colors"
                >
                  <td className="py-2.5 px-3 text-[var(--color-parchment)] whitespace-nowrap tabular">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </td>
                  <td className="py-2.5 px-3 text-[var(--color-parchment)] font-mono text-[11.5px]">
                    {log.candidate_id.substring(0, 8)}…
                  </td>
                  <td className="py-2.5 px-3 text-[var(--color-parchment)] capitalize">{log.gaze}</td>
                  <td className="py-2.5 px-3">
                    <span className={`px-2 py-0.5 rounded-md border text-[11px] tabular font-medium ${riskPillColor(log.risk_score)}`}>
                      {log.risk_score}%
                    </span>
                  </td>
                  <td className={`py-2.5 px-3 font-medium ${getInterventionColor(log.intervention_level)}`}>
                    {log.intervention_level}
                  </td>
                  <td className="py-2.5 px-3 text-[var(--color-slate)] font-mono text-[11px] break-words max-w-xs leading-relaxed">
                    {log.ai_logic_trace}
                  </td>
                </tr>
              ))}
              {logs.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-[var(--color-slate)] text-[13px]">
                    No anomalies detected in recent memory.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
