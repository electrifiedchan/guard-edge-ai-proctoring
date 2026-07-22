"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { motion, Variants } from "framer-motion";
import { AlertTriangle, CheckCircle, HelpCircle, Activity } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080";

type Frame = { t: number; composure: number };
type Moment = { t: number; type: string; caption: string; evidence_url?: string };

type TimelineData = {
  headline: string;
  stats: {
    eye_contact_pct: number;
    talking_pct: number;
    longest_focus_streak_s: number;
  };
  frames: Frame[];
  moments: Moment[];
};

// --- Animations ---
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
};

// --- Helpers ---
const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const getMomentConfig = (type: string) => {
  if (type.includes("WARNING") || type.includes("CRITICAL")) {
    return { color: "#fb7185", icon: AlertTriangle, bg: "bg-rose-500/10", border: "border-rose-500/20" }; // rose-400
  }
  if (type.includes("NUDGE")) {
    return { color: "#c084fc", icon: Activity, bg: "bg-violet-500/10", border: "border-violet-500/20" }; // violet-400
  }
  if (type.includes("RECOVERY")) {
    return { color: "#34d399", icon: CheckCircle, bg: "bg-emerald-500/10", border: "border-emerald-500/20" }; // emerald-400
  }
  return { color: "#38bdf8", icon: HelpCircle, bg: "bg-sky-500/10", border: "border-sky-500/20" }; // sky-400 (Question/Default)
};

function ReplayContent() {
  const searchParams = useSearchParams();
  const sessionParam = searchParams.get("session");
  const [sessionId, setSessionId] = useState(sessionParam || "");
  const [data, setData] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTimeline = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/v1/session/${id}/timeline`);
      if (!res.ok) throw new Error("Failed to fetch session telemetry");
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sessionParam) {
      fetchTimeline(sessionParam);
    }
  }, [sessionParam]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (sessionId) fetchTimeline(sessionId);
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-200 p-8 font-sans relative overflow-hidden">
      {/* Subtle Mesh Glow Background (Clinical/Laboratory vibe) */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-6xl mx-auto space-y-8 relative z-10">
        {/* Header & Search */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-neutral-100 tracking-tight">Session Replay</h1>
            <p className="text-xs text-neutral-500 mt-1 uppercase tracking-[0.2em]">Flight Recorder Diagnostics</p>
          </div>
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              placeholder="Enter Session ID..."
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              className="bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-neutral-600"
            />
            <button
              type="submit"
              className="bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-200 font-medium px-4 py-2 rounded-lg text-sm transition-colors"
            >
              Analyze
            </button>
          </form>
        </header>

        {/* Loading / Error States */}
        {loading && (
          <div className="text-emerald-400/80 text-sm animate-pulse flex items-center gap-2">
            <Activity className="w-4 h-4 animate-spin-slow" /> Awaiting telemetry...
          </div>
        )}
        {error && (
          <div className="text-rose-400 bg-rose-950/30 p-4 rounded-lg border border-rose-900/50 text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> {error}
          </div>
        )}

        {/* Dashboard Content */}
        {data && (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="space-y-6"
          >
            {/* Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <motion.div variants={itemVariants} className="bg-neutral-900/60 backdrop-blur-md border border-neutral-800 rounded-xl p-6">
                <div className="text-[10px] text-neutral-500 uppercase tracking-widest mb-2 font-medium">Eye Contact Synthesis</div>
                <div className="text-3xl font-medium text-emerald-400">{data.stats.eye_contact_pct}%</div>
              </motion.div>
              <motion.div variants={itemVariants} className="bg-neutral-900/60 backdrop-blur-md border border-neutral-800 rounded-xl p-6">
                <div className="text-[10px] text-neutral-500 uppercase tracking-widest mb-2 font-medium">Verbal Activity Ratio</div>
                <div className="text-3xl font-medium text-sky-400">{data.stats.talking_pct}%</div>
              </motion.div>
              <motion.div variants={itemVariants} className="bg-neutral-900/60 backdrop-blur-md border border-neutral-800 rounded-xl p-6">
                <div className="text-[10px] text-neutral-500 uppercase tracking-widest mb-2 font-medium">Diagnostic Summary</div>
                <div className="text-sm text-neutral-300 mt-1 leading-relaxed">{data.headline}</div>
              </motion.div>
            </div>

            {/* Composure Curve */}
            <motion.div variants={itemVariants} className="bg-neutral-900/60 backdrop-blur-md border border-neutral-800 rounded-xl p-6">
              <h2 className="text-[11px] text-neutral-400 uppercase tracking-[0.15em] mb-6 font-medium flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-emerald-500/70" /> Composure Curve
              </h2>
              <div className="h-96 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.frames} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <XAxis
                      dataKey="t"
                      tickFormatter={formatTime}
                      stroke="#404040"
                      tick={{ fill: '#737373', fontSize: 11 }}
                      tickMargin={10}
                    />
                    <YAxis
                      domain={[0, 100]}
                      stroke="#404040"
                      tick={{ fill: '#737373', fontSize: 11 }}
                      tickMargin={10}
                    />
                    <Tooltip
                      cursor={{ stroke: '#525252', strokeWidth: 1, strokeDasharray: '4 4' }}
                      contentStyle={{
                        backgroundColor: 'rgba(23, 23, 23, 0.8)',
                        backdropFilter: 'blur(8px)',
                        borderColor: '#262626',
                        color: '#d4d4d4',
                        borderRadius: '0.75rem',
                        fontSize: '12px'
                      }}
                      labelFormatter={(label) => `Timestamp: ${formatTime(label as number)}`}
                    />
                    <Line
                      type="monotone"
                      dataKey="composure"
                      stroke="#34d399"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 5, fill: "#171717", stroke: "#34d399", strokeWidth: 2 }}
                    />
                    {/* Render Moments as Reference Lines */}
                    {data.moments.map((moment, i) => {
                      const config = getMomentConfig(moment.type);
                      return (
                        <ReferenceLine
                          key={i}
                          x={moment.t}
                          stroke={config.color}
                          strokeDasharray="4 4"
                          strokeOpacity={0.6}
                          strokeWidth={1.5}
                        />
                      );
                    })}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </motion.div>

            {/* Stepper Timeline Feed */}
            <motion.div variants={itemVariants} className="bg-neutral-900/60 backdrop-blur-md border border-neutral-800 rounded-xl p-6">
              <h2 className="text-[11px] text-neutral-400 uppercase tracking-[0.15em] mb-8 font-medium">Session Timeline Registry</h2>
              
              <div className="relative pl-6 space-y-8 before:absolute before:inset-y-0 before:left-[11px] before:w-px before:bg-neutral-800">
                {data.moments.length === 0 ? (
                  <p className="text-neutral-500 text-sm">No critical deviations logged during this session.</p>
                ) : (
                  data.moments.map((moment, i) => {
                    const config = getMomentConfig(moment.type);
                    const Icon = config.icon;
                    return (
                      <div key={i} className="relative flex gap-6 items-start group">
                        {/* Stepper Node */}
                        <div
                          className={`absolute -left-6 w-6 h-6 rounded-full border-4 border-neutral-950 flex items-center justify-center ${config.bg} z-10 transition-transform group-hover:scale-110`}
                          style={{ color: config.color }}
                        >
                          <Icon className="w-3 h-3" />
                        </div>
                        
                        {/* Timestamp */}
                        <div className="text-[11px] font-medium text-neutral-500 mt-1 w-10 flex-shrink-0">
                          {formatTime(moment.t)}
                        </div>

                        {/* Content Card */}
                        <div className="flex-1 transition-all">
                          <div className="flex items-center gap-2 mb-2">
                            <span
                              className={`text-[10px] font-semibold px-2.5 py-1 rounded-md uppercase tracking-wide border ${config.bg} ${config.border}`}
                              style={{ color: config.color }}
                            >
                              {moment.type}
                            </span>
                          </div>
                          <p className="text-sm text-neutral-300 font-medium leading-relaxed">{moment.caption}</p>
                          {moment.evidence_url && (
                            <div className="mt-4 overflow-hidden rounded-lg border border-neutral-800 inline-block">
                              <img
                                src={`${API}${moment.evidence_url}`}
                                alt="Telemetry Evidence"
                                className="max-w-[240px] opacity-75 hover:opacity-100 hover:scale-[1.02] transition-all duration-300"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </div>
    </main>
  );
}

export default function ReplayPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center gap-4 text-emerald-400/80 tracking-widest uppercase text-xs">
      <Activity className="w-5 h-5 animate-spin-slow" />
      <div>Initializing Diagnostics...</div>
    </div>}>
      <ReplayContent />
    </Suspense>
  );
}
