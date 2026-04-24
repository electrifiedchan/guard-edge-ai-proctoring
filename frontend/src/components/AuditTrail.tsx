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
      case "TERMINAL":
        return "text-red-500 font-bold";
      case "WARNING":
        return "text-orange-500 font-bold";
      case "CLEAR":
        return "text-gray-400";
      default:
        return "text-gray-400";
    }
  };

  return (
    <div className="w-full h-full bg-[#0A0A0B] border border-[#2A2A2A] rounded-lg p-4 overflow-hidden flex flex-col font-sans">
      <h2 className="text-xl font-semibold text-white mb-4 uppercase tracking-wider">Security Audit Trail</h2>
      <div className="overflow-y-auto flex-1">
        {loading && logs.length === 0 ? (
          <div className="flex justify-center items-center h-full text-gray-500">
            Scanning temporal logs...
          </div>
        ) : (
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#2A2A2A] text-gray-400">
                <th className="py-2 px-3 font-medium">TIMESTAMP</th>
                <th className="py-2 px-3 font-medium">CANDIDATE</th>
                <th className="py-2 px-3 font-medium">GAZE</th>
                <th className="py-2 px-3 font-medium">RISK</th>
                <th className="py-2 px-3 font-medium">LEVEL</th>
                <th className="py-2 px-3 font-medium w-1/3">AI LOGIC TRACE</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-[#2A2A2A]/50 hover:bg-[#15151A] transition-colors">
                  <td className="py-3 px-3 text-gray-300 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </td>
                  <td className="py-3 px-3 text-gray-300 font-mono text-xs">{log.candidate_id.substring(0, 8)}...</td>
                  <td className="py-3 px-3 text-gray-300">{log.gaze}</td>
                  <td className="py-3 px-3">
                    <span className={`px-2 py-1 rounded bg-[#1A1A1E] ${log.risk_score > 70 ? 'text-red-400' : log.risk_score > 30 ? 'text-orange-400' : 'text-green-400'}`}>
                      {log.risk_score}%
                    </span>
                  </td>
                  <td className={`py-3 px-3 ${getInterventionColor(log.intervention_level)}`}>
                    {log.intervention_level}
                  </td>
                  <td className="py-3 px-3 text-gray-400 font-mono text-xs break-words max-w-xs">
                    {log.ai_logic_trace}
                  </td>
                </tr>
              ))}
              {logs.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="text-center py-6 text-gray-500">
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
