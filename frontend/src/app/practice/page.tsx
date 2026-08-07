"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  FileText,
  Mic,
  ChevronRight,
  Brain,
  Target,
  ArrowLeft,
  RotateCcw,
  Square,
  Eye,
  User,
  Bot,
} from "lucide-react";
import FocusPIP from "@/components/FocusPIP";
import DashboardButton from "@/components/DashboardButton";
import { useVAD } from "@/hooks/useVAD";

type Question = {
  question: string;
  focus: string;
};

type ChatMessage = {
  role: "interviewer" | "candidate";
  content: string;
  persona?: string;
};

type TurnState = "ai-speaking" | "listening" | "processing" | "idle";
type Phase = "upload" | "loading" | "interview" | "active" | "verdict-loading" | "verdict";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

const LOADING_MESSAGES = [
  "Parsing resume sections…",
  "Identifying key accomplishments…",
  "Mapping to STAR competencies…",
  "Generating behavioral questions…",
];

// Colors are theme tokens, not raw Tailwind shades. The old values
// (emerald-400 / sky-400 / amber-400) were tuned for the dark canvas and
// dropped to ~2:1 contrast on the light theme's white surface.
const PERSONA_LABELS: Record<string, { label: string; color: string }> = {
  friendly_hr: { label: "Friendly HR", color: "text-[var(--color-signal)]" },
  curious_peer: { label: "Curious Peer", color: "text-[var(--color-info)]" },
  skeptical_tech_lead: { label: "Tech Lead", color: "text-[var(--color-warn)]" },
};

// The rung the interview opens on. The engine still escalates from here, so
// this sets where the ramp begins rather than pinning the whole session.
const PERSONA_OPTIONS = [
  {
    id: "friendly_hr",
    label: "Friendly HR",
    tagline: "Warm open",
    blurb: "Rapport first. Eases in with broad questions before any technical depth.",
    accent: "var(--color-signal)",
    Icon: User,
  },
  {
    id: "curious_peer",
    label: "Curious Peer",
    tagline: "Straight in",
    blurb: "Skips small talk. Opens on your resume's fundamentals and digs a level deeper.",
    accent: "var(--color-info)",
    Icon: Brain,
  },
  {
    id: "skeptical_tech_lead",
    label: "Tech Lead",
    tagline: "Full pressure",
    blurb: "Probing from turn one — scale, tradeoffs, and failure modes.",
    accent: "var(--color-warn)",
    Icon: Target,
  },
] as const;

type PersonaId = (typeof PERSONA_OPTIONS)[number]["id"];

/** Composure score → theme token. The thresholds (80 / 50) match the backend's
 *  Excellent / Moderate / Needs-Improvement bands in generate_final_verdict. */
function scoreTone(score: number): string {
  if (score >= 80) return "text-[var(--color-signal)]";
  if (score >= 50) return "text-[var(--color-warn)]";
  return "text-[var(--color-danger)]";
}

export default function PracticeGym() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("upload");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [fileName, setFileName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const [loadingStep, setLoadingStep] = useState(0);
  const [resumeText, setResumeText] = useState("");

  // Conversational interview state
  const [sessionId, setSessionId] = useState("");
  const sessionIdRef = useRef("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [currentPersona, setCurrentPersona] = useState("friendly_hr");
  const [startingPersona, setStartingPersona] = useState<PersonaId>("friendly_hr");
  const [turnState, setTurnState] = useState<TurnState>("idle");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  // Vision Gatekeeper state
  const [focusScore, setFocusScore] = useState<number>(100);
  const focusScoreRef = useRef(100);
  const isInterviewActive = phase === "active";

  // Verdict state
  const [verdictReport, setVerdictReport] = useState("");
  const [avgFocusScore, setAvgFocusScore] = useState(0);
  const [turnsCompleted, setTurnsCompleted] = useState(0);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // VAD hook for auto-silence detection
  const { isListening, isVoiceActive, audioLevel, startListening, stopListening } = useVAD({
    silenceThresholdMs: 2500,
    volumeThreshold: 0.01,
    onSpeechEnd: handleSpeechEnd,
  });

  useEffect(() => {
    if (phase !== "loading") return;
    const interval = setInterval(() => {
      setLoadingStep((prev) =>
        prev < LOADING_MESSAGES.length - 1 ? prev + 1 : prev
      );
    }, 1800);
    return () => clearInterval(interval);
  }, [phase]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  // -- TTS: speak text using browser speechSynthesis --
  const speakText = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!("speechSynthesis" in window)) { resolve(); return; }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.92;
      utterance.pitch = 0.85;
      const voices = window.speechSynthesis.getVoices();
      const preferred =
        voices.find(
          (v) =>
            v.lang.startsWith("en") &&
            /\b(male|david|james|guy|mark|daniel|richard)\b/i.test(v.name)
        ) ||
        voices.find(
          (v) => v.lang.startsWith("en") && v.name.toLowerCase().includes("natural")
        ) ||
        voices.find((v) => v.lang.startsWith("en"));
      if (preferred) utterance.voice = preferred;
      setIsSpeaking(true);
      utterance.onend = () => { setIsSpeaking(false); resolve(); };
      utterance.onerror = () => { setIsSpeaking(false); resolve(); };
      window.speechSynthesis.speak(utterance);
    });
  }, []);

  // -- Handle file upload --
  const handleFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are accepted.");
      return;
    }

    setError("");
    setFileName(file.name);
    setPhase("loading");
    setLoadingStep(0);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API_BASE}/api/v1/interview/upload-resume`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.detail || `Server responded with ${res.status}`);
      }

      const data = await res.json();
      setQuestions(data.questions || []);
      setResumeText(data.resume_text || "");
      setPhase("interview");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setError(message);
      setPhase("upload");
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleReset = () => {
    setPhase("upload");
    setQuestions([]);
    setFileName("");
    setError("");
    setLoadingStep(0);
    setSessionId("");
    sessionIdRef.current = "";
    setChatHistory([]);
    setCurrentPersona("friendly_hr");
    setStartingPersona("friendly_hr");
    setTurnState("idle");
    setFocusScore(100);
    setVerdictReport("");
    setAvgFocusScore(0);
    setTurnsCompleted(0);
    setResumeText("");
    window.speechSynthesis?.cancel();
    stopListening();
  };

  // -- Start conversational interview session --
  const startInterview = useCallback(async () => {
    setPhase("active");
    setChatHistory([]);
    setTurnState("processing");

    try {
      const res = await fetch(`${API_BASE}/api/v1/interview/start-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resume_text: resumeText,
          questions,
          starting_persona: startingPersona,
        }),
      });

      if (!res.ok) throw new Error("Failed to start session");
      const data = await res.json();

      setSessionId(data.session_id);
      sessionIdRef.current = data.session_id;
      setCurrentPersona(data.persona);
      setChatHistory([{ role: "interviewer", content: data.opening_message, persona: data.persona }]);

      setTurnState("ai-speaking");
      await speakText(data.opening_message);

      setTurnState("listening");
      startListening();
    } catch (err) {
      console.error("Session start failed:", err);
      setError("Failed to start interview session. Check backend.");
      setPhase("interview");
    }
  }, [resumeText, questions, startingPersona, speakText, startListening]);

  // -- Called by VAD when silence detected after speech --
  async function handleSpeechEnd(blob: Blob) {
    setTurnState("processing");
    setIsTranscribing(true);

    try {
      // 1. Transcribe audio
      const formData = new FormData();
      formData.append("file", blob, "recording.webm");
      const transcribeRes = await fetch(`${API_BASE}/api/v1/voice/transcribe`, {
        method: "POST",
        body: formData,
      });

      if (!transcribeRes.ok) {
        const detail = await transcribeRes.json().catch(() => null);
        throw new Error(detail?.detail || `Transcription failed (${transcribeRes.status})`);
      }
      const { transcript } = await transcribeRes.json();
      setIsTranscribing(false);

      if (!transcript || transcript.trim().length === 0) {
        setTurnState("listening");
        startListening();
        return;
      }

      // 2. Add candidate message to chat
      setChatHistory((prev) => [...prev, { role: "candidate", content: transcript }]);

      // 3. Send to conversation engine
      const turnRes = await fetch(`${API_BASE}/api/v1/interview/conversation-turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionIdRef.current,
          transcript,
          focus_score: focusScoreRef.current,
        }),
      });

      if (!turnRes.ok) {
        const detail = await turnRes.json().catch(() => null);
        throw new Error(detail?.detail || `Conversation turn failed (${turnRes.status})`);
      }
      const turnData = await turnRes.json();

      setCurrentPersona(turnData.persona);
      setChatHistory((prev) => [...prev, {
        role: "interviewer",
        content: turnData.response,
        persona: turnData.persona,
      }]);

      // 4. Check if interview complete
      if (turnData.is_complete) {
        setTurnState("ai-speaking");
        await speakText(turnData.response);
        setTurnState("processing");
        await generateVerdict();
        return;
      }

      // 5. Speak AI response, then listen again
      setTurnState("ai-speaking");
      await speakText(turnData.response);
      setTurnState("listening");
      startListening();

    } catch (err) {
      console.error("Turn processing error:", err);
      setError(err instanceof Error ? err.message : "Something went wrong");
      setIsTranscribing(false);
      setTurnState("listening");
      startListening();
    }
  }

  // -- Generate final verdict --
  const generateVerdict = useCallback(async () => {
    setPhase("verdict-loading");

    try {
      const res = await fetch(`${API_BASE}/api/v1/interview/end-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });

      if (!res.ok) throw new Error("Verdict generation failed");
      const data = await res.json();

      setVerdictReport(data.report);
      // The endpoint's field is `focus_score`. Reading `average_focus_score`
      // here got undefined, and `|| 0` then presented the missing value as a
      // real score of 0 — the reported "focus score always 0%" bug, while
      // turns_completed (spelled the same on both sides) came through fine.
      setAvgFocusScore(Math.round(data.focus_score ?? 0));
      setTurnsCompleted(data.turns_completed || 0);
      setPhase("verdict");
    } catch (err) {
      console.error("Verdict error:", err);
      setError(err instanceof Error ? err.message : "Failed to generate report");
      setPhase("active");
    }
  }, [sessionId]);

  // -- End session early --
  const endSessionEarly = useCallback(async () => {
    stopListening();
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
    await generateVerdict();
  }, [stopListening, generateVerdict]);

  return (
    <main className="min-h-screen bg-[var(--color-canvas)] text-[var(--color-parchment)] px-6 py-10 flex flex-col">
      <div className="max-w-[960px] w-full mx-auto flex flex-col gap-8 flex-1">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex items-center justify-between border-b border-[var(--color-hairline)] pb-6"
        >
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-[var(--color-signal-soft)] flex items-center justify-center">
              <Brain size={20} className="text-[var(--color-signal)]" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-signal)] pulse-signal" />
                <span className="eyebrow text-[var(--color-signal)]">
                  Practice Gym
                </span>
              </div>
              <h1 className="text-lg font-semibold text-[var(--color-snow)] tracking-tight">
                AI Interview Trainer
              </h1>
            </div>
          </div>

          {/* Was a pill labelled "Dashboard" that actually pushed /upload.
              Now the shared identity chip, and it goes where it says. */}
          <DashboardButton />

        </motion.header>

        {/* Content */}
        <AnimatePresence mode="wait">
          {/* Phase 1: Upload */}
          {phase === "upload" && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
              className="flex-1 flex flex-col justify-center"
            >
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={`
                  lift-1 rounded-lg p-16 flex flex-col items-center gap-6 cursor-pointer relative overflow-hidden
                  border-2 border-dashed transition-colors duration-200
                  ${
                    dragOver
                      ? "border-[var(--color-signal)] bg-[var(--color-signal-soft)]"
                      : "border-[var(--color-hairline)] hover:border-[var(--color-signal)]"
                  }
                `}
              >
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handleSelect}
                  className="hidden"
                />

                <div className="w-16 h-16 rounded-2xl bg-[var(--color-surface)] flex items-center justify-center border border-[var(--color-hairline)]">
                  <Upload size={28} className="text-[var(--color-mint)]" />
                </div>

                <div className="flex flex-col items-center gap-2 text-center">
                  <p className="text-base font-medium text-[var(--color-snow)]">
                    Upload your resume to begin
                  </p>
                  <p className="text-sm text-[var(--color-slate)]">
                    Drag a PDF here, or click to browse. Your file stays on this
                    device.
                  </p>
                </div>

                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--color-signal)] text-[var(--color-canvas)] text-xs font-semibold pointer-events-none">
                  <FileText size={13} />
                  Select PDF
                </span>
              </label>

              {error && (
                <p className="text-sm text-red-400 mt-4 text-center">{error}</p>
              )}
            </motion.div>
          )}

          {/* Phase 2: Loading */}
          {phase === "loading" && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex-1 flex flex-col items-center justify-center gap-8"
            >
              <div className="w-14 h-14 rounded-full border-2 border-[var(--color-signal)] border-t-transparent animate-spin" />
              <div className="flex flex-col items-center gap-3 max-w-xs text-center">
                {LOADING_MESSAGES.map((msg, i) => (
                  <motion.p
                    key={msg}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{
                      opacity: i <= loadingStep ? 1 : 0.3,
                      y: 0,
                    }}
                    className="text-sm text-[var(--color-slate)]"
                  >
                    {i < loadingStep ? "✓" : i === loadingStep ? "▸" : "○"}{" "}
                    {msg}
                  </motion.p>
                ))}
              </div>
            </motion.div>
          )}

          {/* Phase 3: Interview (question list) */}
          {phase === "interview" && (
            <motion.div
              key="interview"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col gap-6"
            >
              {/* Title bar */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Target
                    size={16}
                    className="text-[var(--color-signal)]"
                  />
                  <h2 className="text-base font-semibold text-[var(--color-snow)]">
                    {questions.length} STAR Questions Generated
                  </h2>
                </div>
                <button
                  onClick={handleReset}
                  className="text-[var(--color-slate)] hover:text-[var(--color-signal)] transition-colors cursor-pointer"
                >
                  <RotateCcw size={15} />
                </button>
              </div>

              {/* Question list */}
              <div className="flex flex-col gap-3">
                {questions.map((q, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.06 }}
                    className="lift-1 rounded-lg p-4 flex items-start gap-4 border border-[var(--color-hairline)]"
                  >
                    <span className="w-7 h-7 rounded-full bg-[var(--color-signal-soft)] text-[var(--color-signal)] flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <div className="flex flex-col gap-1.5">
                      <p className="text-sm text-[var(--color-snow)] leading-relaxed">
                        {q.question}
                      </p>
                      {q.focus && (
                        <span className="inline-flex items-center gap-1 w-fit px-2 py-0.5 rounded-full bg-[var(--color-signal-soft)] text-[var(--color-signal)] text-[10px] font-medium uppercase tracking-wider">
                          <Target size={9} />
                          {q.focus}
                        </span>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Interviewer style — sets the rung the session opens on */}
              <div className="flex flex-col gap-3 mt-2">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-sm font-semibold text-[var(--color-snow)]">
                    Choose your interviewer
                  </h3>
                  <span className="text-[11px] text-[var(--color-slate)]">
                    Difficulty still ramps up as you go
                  </span>
                </div>

                <div
                  role="radiogroup"
                  aria-label="Interviewer style"
                  className="grid gap-3 sm:grid-cols-3"
                >
                  {PERSONA_OPTIONS.map(({ id, label, tagline, blurb, accent, Icon }) => {
                    const selected = startingPersona === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setStartingPersona(id)}
                        style={
                          {
                            borderColor: selected ? accent : undefined,
                            // color-mix keeps the tint derived from the same token
                            // the theme already swapped, so the wash works on the
                            // dark canvas and the light surface without a second palette.
                            backgroundColor: selected
                              ? `color-mix(in srgb, ${accent} 10%, transparent)`
                              : undefined,
                          } as React.CSSProperties
                        }
                        className={`group relative text-left rounded-lg p-4 border transition-all cursor-pointer
                          focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-signal)]
                          ${
                            selected
                              ? "shadow-sm"
                              : "border-[var(--color-hairline)] bg-[var(--color-surface)] hover:border-[var(--color-hairline-strong)]"
                          }`}
                      >
                        <div className="flex items-center gap-2">
                          <Icon
                            size={15}
                            style={{ color: selected ? accent : undefined }}
                            className={selected ? "" : "text-[var(--color-slate)]"}
                          />
                          <span
                            className="text-sm font-semibold text-[var(--color-snow)]"
                          >
                            {label}
                          </span>
                          {selected && (
                            <motion.span
                              layoutId="persona-check"
                              className="ml-auto w-1.5 h-1.5 rounded-full"
                              style={{ backgroundColor: accent }}
                            />
                          )}
                        </div>

                        <span
                          className="mt-2 inline-block text-[10px] font-medium uppercase tracking-wider"
                          style={{ color: selected ? accent : undefined }}
                        >
                          <span className={selected ? "" : "text-[var(--color-fog)]"}>
                            {tagline}
                          </span>
                        </span>

                        <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-slate)]">
                          {blurb}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* CTA */}
              <div className="flex items-center gap-3 mt-2">
                <button
                  onClick={startInterview}
                  className="h-10 px-6 rounded-md bg-[var(--color-signal)] text-[var(--color-canvas)] text-sm font-semibold hover:brightness-110 transition-all cursor-pointer flex items-center gap-2"
                >
                  <Mic size={15} />
                  Start Interview Sequence
                  <ChevronRight size={14} />
                </button>
              </div>

              {/* Footer */}
              <div className="mt-6 flex items-center justify-between border-t border-[var(--color-hairline)] pt-6">
                <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md text-[11px] font-medium border border-[var(--color-hairline)] bg-[var(--color-surface)] text-[var(--color-slate)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-signal)] pulse-signal" />
                  Local &middot; Edge Processing
                </span>
                <button
                  onClick={() => router.push("/dashboard")}
                  className="h-9 px-4 rounded-md bg-[var(--color-surface)] text-[var(--color-mint)] text-[12px] font-medium border border-[var(--color-hairline)] hover:border-[var(--color-signal)] hover:text-[var(--color-signal)] transition-colors cursor-pointer"
                >
                  Return to Dashboard
                </button>
              </div>
            </motion.div>
          )}

          {/* Phase 4: Active Interview (Conversational) */}
          {phase === "active" && (
            <motion.div
              key="active"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col gap-4 flex-1"
            >
              {/* Status Bar */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--color-surface)] border border-[var(--color-hairline)] text-[11px] font-medium uppercase tracking-wider ${PERSONA_LABELS[currentPersona]?.color || "text-[var(--color-slate)]"}`}>
                    <Bot size={11} />
                    {PERSONA_LABELS[currentPersona]?.label || "Interviewer"}
                  </span>
                  <span className="text-[10px] text-[var(--color-slate)] uppercase tracking-wider">
                    {turnState === "ai-speaking" && "Speaking…"}
                    {turnState === "listening" && "Listening…"}
                    {turnState === "processing" && "Thinking…"}
                    {turnState === "idle" && "Ready"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Eye size={12} className="text-[var(--color-slate)]" />
                  <span className={`text-xs font-mono font-bold tabular-nums ${scoreTone(focusScore)}`}>
                    {focusScore}
                  </span>
                </div>
              </div>

              {/* Chat Transcript */}
              <div className="flex-1 overflow-y-auto max-h-[420px] rounded-xl border border-[var(--color-hairline)] bg-[var(--color-surface)] p-5 space-y-4">
                {chatHistory.map((msg, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 }}
                    className={`flex gap-3 ${msg.role === "candidate" ? "flex-row-reverse" : ""}`}
                  >
                    {/* Both bubbles resolve through theme tokens. The candidate
                        side used sky-500/10 + sky-100 text, which inverted to
                        near-white ink on a pale wash in the light theme. */}
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                      msg.role === "interviewer"
                        ? "bg-[var(--color-signal-soft)] text-[var(--color-signal)]"
                        : "bg-[var(--color-surface-2)] text-[var(--color-info)]"
                    }`}>
                      {msg.role === "interviewer" ? <Bot size={13} /> : <User size={13} />}
                    </div>
                    <div
                      style={
                        msg.role === "candidate"
                          ? {
                              backgroundColor:
                                "color-mix(in srgb, var(--color-info) 10%, transparent)",
                              borderColor:
                                "color-mix(in srgb, var(--color-info) 30%, transparent)",
                            }
                          : undefined
                      }
                      className={`max-w-[75%] rounded-lg px-4 py-2.5 text-sm leading-relaxed border text-[var(--color-snow)] ${
                        msg.role === "interviewer"
                          ? "bg-[var(--color-surface-2)] border-[var(--color-hairline)]"
                          : ""
                      }`}
                    >
                      {msg.content}
                    </div>
                  </motion.div>
                ))}

                {(isTranscribing || turnState === "processing") && (
                  <div className="flex items-center gap-2 text-[var(--color-slate)]">
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-signal)] animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-signal)] animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-signal)] animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                    <span className="text-[10px] uppercase tracking-wider">
                      {isTranscribing ? "Transcribing…" : "Generating response…"}
                    </span>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Audio Level Visualizer */}
              {turnState === "listening" && (
                <div className="flex items-center justify-center gap-3 py-3">
                  <div className="flex items-center gap-1 h-8">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <motion.div
                        key={i}
                        className="w-1 rounded-full bg-[var(--color-signal)]"
                        animate={{
                          height: isVoiceActive
                            ? `${Math.max(4, audioLevel * 32 * (0.5 + Math.random() * 0.5))}px`
                            : "4px",
                        }}
                        transition={{ duration: 0.1 }}
                      />
                    ))}
                  </div>
                  <span className="text-[10px] text-[var(--color-slate)] uppercase tracking-wider">
                    {isVoiceActive ? "Speaking detected" : "Waiting for voice…"}
                  </span>
                </div>
              )}

              {/* Bottom Controls */}
              <div className="flex items-center justify-between pt-3 border-t border-[var(--color-hairline)]">
                <button
                  onClick={endSessionEarly}
                  className="h-9 px-4 rounded-md bg-[var(--color-surface)] text-[var(--color-slate)] text-[12px] font-medium border border-[var(--color-hairline)] hover:border-[var(--color-signal)] hover:text-[var(--color-signal)] transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Square size={11} />
                  End Interview
                </button>
                <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md text-[11px] font-medium border border-[var(--color-hairline)] bg-[var(--color-surface)] text-[var(--color-slate)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-signal)] pulse-signal" />
                  Local &middot; Edge Processing
                </span>
              </div>
            </motion.div>
          )}
          {/* Phase 5a: Verdict Loading */}
          {phase === "verdict-loading" && (
            <motion.div
              key="verdict-loading"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col items-center justify-center gap-6"
            >
              <div className="w-16 h-16 rounded-full border-2 border-[var(--color-signal)] border-t-transparent animate-spin" />
              <div className="flex flex-col items-center gap-2">
                <h2 className="text-lg font-semibold text-[var(--color-snow)]">
                  Synthesizing Coaching Report…
                </h2>
                <p className="text-sm text-[var(--color-slate)]">
                  Analyzing conversation + focus telemetry
                </p>
              </div>
            </motion.div>
          )}

          {/* Phase 5b: Verdict Report */}
          {phase === "verdict" && (
            <motion.div
              key="verdict"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.4 }}
              className="flex-1 flex flex-col gap-6"
            >
              {/* Report Card */}
              {/* Gradient lands on --color-surface-2 rather than neutral-950 so
                  the card doesn't stay near-black under the light theme. */}
              <div className="relative lift-2 rounded-xl p-8 border border-[var(--color-hairline)] bg-gradient-to-br from-[var(--color-surface)] to-[var(--color-surface-2)] overflow-hidden">
                {/* Glow effect */}
                <div className="absolute -top-24 -right-24 w-48 h-48 rounded-full bg-[var(--color-signal-soft)] blur-3xl pointer-events-none" />

                {/* Header */}
                <div className="flex items-start justify-between mb-6 relative">
                  <div className="flex flex-col gap-1">
                    <span className="eyebrow text-[var(--color-signal)]">AI Coaching Verdict</span>
                    <h2 className="text-xl font-bold text-[var(--color-snow)] tracking-tight">
                      Executive Interview Report
                    </h2>
                  </div>

                  {/* Focus Score Badge */}
                  <div className="flex flex-col items-center gap-1 px-4 py-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-hairline)]">
                    <span className={`text-3xl font-bold tabular-nums font-mono ${scoreTone(avgFocusScore)}`}>
                      {avgFocusScore}
                    </span>
                    <span className="text-[9px] uppercase tracking-widest text-[var(--color-slate)]">
                      Focus Score
                    </span>
                  </div>
                </div>

                {/* Report Content */}
                <div className="relative space-y-4">
                  {verdictReport.split("\n\n").map((paragraph, i) => (
                    <motion.p
                      key={i}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 + i * 0.15, duration: 0.3 }}
                      className="text-sm leading-relaxed text-[var(--color-parchment)]"
                    >
                      {paragraph}
                    </motion.p>
                  ))}
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-4 mt-8 pt-6 border-t border-[var(--color-hairline)]">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-wider text-[var(--color-slate)]">Turns</span>
                    <span className="text-lg font-semibold text-[var(--color-snow)] tabular-nums">{turnsCompleted}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-wider text-[var(--color-slate)]">Avg Focus</span>
                    <span className={`text-lg font-semibold tabular-nums ${scoreTone(avgFocusScore)}`}>
                      {avgFocusScore}%
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-wider text-[var(--color-slate)]">Processing</span>
                    <span className="text-lg font-semibold text-[var(--color-snow)]">Edge</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleReset}
                  className="h-10 px-5 rounded-md bg-[var(--color-signal)] text-[var(--color-canvas)] text-sm font-semibold hover:brightness-110 transition-all cursor-pointer flex items-center gap-2"
                >
                  <RotateCcw size={14} />
                  New Session
                </button>
                <button
                  onClick={() => router.push("/dashboard")}
                  className="h-10 px-5 rounded-md bg-[var(--color-surface)] text-[var(--color-mint)] text-sm font-medium border border-[var(--color-hairline)] hover:border-[var(--color-signal)] hover:text-[var(--color-signal)] transition-colors cursor-pointer flex items-center gap-2"
                >
                  <ArrowLeft size={14} />
                  Dashboard
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {error && phase === "active" && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Vision Gatekeeper PIP — only active during interview */}
      <FocusPIP active={isInterviewActive} onScoreUpdate={(s) => { setFocusScore(s); focusScoreRef.current = s; }} />
    </main>
  );
}
