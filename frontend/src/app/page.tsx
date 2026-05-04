"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import SniperScope, { RiskPacket, SniperScopeHandle } from "@/components/SniperScope";
import VoiceOrb from "@/components/VoiceOrb";
import AuditTrail from "@/components/AuditTrail";
import LoadingOverlay from "@/components/LoadingOverlay";


export default function Home() {
  const router = useRouter();
  const sniperRef = useRef<SniperScopeHandle>(null);
  const [sessionStartTime] = useState<number>(Date.now());
  const [hasWarned, setHasWarned] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("SYSTEM STANDBY. WAITING FOR TRIGGER.");
  const [isTranscribing, setIsTranscribing] = useState(false);
  
  const [latestRisk, setLatestRisk] = useState<RiskPacket | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Receives live transcripts from VoiceOrb's SpeechRecognition engine
  const handleTranscript = (text: string) => {
    setLiveTranscript(text);
    setIsTranscribing(true);
    // Dim the indicator after 2s of silence
    setTimeout(() => setIsTranscribing(false), 2000);
  };

  // --- THE BRAIN: Vision to Voice to Santiago LLM-Judge ---
  const handleTelemetry = (packet: RiskPacket, verdict: string) => {
    setLatestRisk(packet);
    
    // Clear warnings if memory is reset
    if (packet.risk_score === 0 || packet.intervention_level === "CLEAR") {
      setHasWarned(false);
    }

    // Trigger at 40% Risk
    if (packet.intervention_level === "HARD_WARNING" && !hasWarned) {
      setHasWarned(true);
      setLiveTranscript("AI: Candidate, anomalous behavior detected. Please explain your deviation from the screen.");
      
      // 1. TEXT TO SPEECH (The Interrogation)
      const utterance = new SpeechSynthesisUtterance(
        "Candidate, anomalous behavior detected. Please explain your deviation from the screen."
      );
      utterance.rate = 0.95;
      utterance.pitch = 0.8;
      
      // 2. SPEECH TO TEXT (The Santiago LLM-Judge Loop)
      utterance.onend = () => {
        // Fallback for different browser implementations
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        
        if (SpeechRecognition) {
          const recognition = new SpeechRecognition();
          recognition.continuous = false;
          recognition.interimResults = true; // Show words as they are spoken

          recognition.onstart = () => {
            setLiveTranscript("MICROPHONE LIVE. RECORDING CANDIDATE AUDIO...");
          };

          recognition.onresult = (event: any) => {
            const current = event.resultIndex;
            const transcript = event.results[current][0].transcript;
            setLiveTranscript(`CANDIDATE: "${transcript}"`);
          };

          recognition.onend = () => {
            setLiveTranscript("TRANSMITTING TO SANTIAGO LLM-JUDGE FOR EVALUATION...");
            
            // Here is where we will eventually POST to your FastAPI backend.
            // For now, we simulate the LLM analyzing the excuse:
            setTimeout(() => {
              setLiveTranscript("EVALUATION COMPLETE. EXCUSE LOGGED. RESUMING STANDBY.");
            }, 4000);
          };

          recognition.start();
        } else {
          setLiveTranscript("ERROR: SPEECH RECOGNITION NOT SUPPORTED IN THIS BROWSER.");
        }
      };

      window.speechSynthesis.speak(utterance);
    }
  };

  const handleEndSession = async () => {
    // Auto-disengage optics immediately so the candidate sees the camera stop the
    // moment the report is requested, and so no further /analyze-frame calls hit
    // the backend while the verdict is being generated.
    sniperRef.current?.stopCamera();

    setIsGenerating(true);
    setLiveTranscript("AI Coach is analyzing your performance...");

    try {
      const actualSessionDuration = Math.floor((Date.now() - sessionStartTime) / 1000);

      const payload = {
        candidate_id: latestRisk?.candidate_id || "major_project_candidate_01",
        total_violations: latestRisk?.violation_count || 0,
        risk_score: latestRisk?.risk_score || 0,
        session_duration_sec: actualSessionDuration,
        critical_flags: latestRisk?.critical_flags || [],
        // Scope the verdict to events from this page-load forward so prior runs
        // don't leak into the report. Backend compares against SQLite TEXT
        // timestamps (sortable lexicographically when in ISO format).
        session_started_at: new Date(sessionStartTime).toISOString(),
      };

      const response = await fetch("http://localhost:8080/generate-verdict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const data = await response.json();
        localStorage.setItem("verdictData", JSON.stringify(data));
        router.push("/verdict");
      } else {
        setLiveTranscript("ERROR: Failed to generate report.");
        setIsGenerating(false);
      }
    } catch {
      setLiveTranscript("ERROR: Backend unreachable.");
      setIsGenerating(false);
    }
  };

  return (
    <main className="min-h-screen bg-[var(--color-canvas)] flex flex-col px-5 md:px-8 py-7 text-[var(--color-parchment)] items-center overflow-x-hidden">
      {/* Top bar — VoltAgent terminal-native: brand left, CTA right */}
      <header className="w-full max-w-[1400px] mb-5 flex justify-between items-center border-b border-[var(--color-hairline)] pb-5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg lift-2 flex items-center justify-center">
            <span className="w-2 h-2 rounded-full bg-[var(--color-signal)] glow-pulse" />
          </div>
          <div className="flex flex-col">
            <h1 className="font-display text-[18px] font-semibold tracking-tight text-[var(--color-snow)] leading-none">
              GUARD
            </h1>
            <span className="eyebrow mt-1.5">Edge-AI Proctoring</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden md:inline-flex items-center gap-2 px-2.5 py-1 rounded-md text-[11px] font-medium border border-[var(--color-hairline)] bg-[var(--color-surface)] text-[var(--color-slate)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-signal)] pulse-signal" />
            Local · 127.0.0.1
          </span>
          <button
            onClick={handleEndSession}
            disabled={isGenerating}
            className="h-9 px-4 rounded-md bg-[var(--color-surface)] text-[var(--color-mint)] text-[12px] font-medium border border-[var(--color-hairline)] hover:border-[var(--color-signal)] hover:text-[var(--color-signal)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {isGenerating ? "Analyzing…" : "End session · generate report"}
          </button>
        </div>
      </header>


      {/* Dashboard grid */}
      <div className="w-full max-w-[1400px] flex flex-col 2xl:flex-row gap-6 items-start justify-center">

        {/* Vision Sentry */}
        <div className="flex-1 w-full">
          <SniperScope ref={sniperRef} onTelemetryUpdate={handleTelemetry} />
        </div>

        {/* Interrogator stack */}
        <div className="flex-shrink-0 flex flex-col gap-4 w-full 2xl:w-[340px]">
          <VoiceOrb onTranscriptUpdate={setLiveTranscript} />

          {/* Live transcript */}
          <div className="lift-1 rounded-lg p-5 flex flex-col min-h-[200px] relative overflow-hidden">
            <div
              className={`absolute top-0 left-0 w-full h-px transition-colors duration-300 ${
                isTranscribing ? "bg-[var(--color-signal)]" : "bg-[var(--color-hairline)]"
              }`}
            />
            <span className="eyebrow mb-3 flex items-center gap-2">
              <span
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  isTranscribing ? "bg-[var(--color-signal)] pulse-signal" : "bg-[var(--color-fog)]"
                }`}
              />
              Voice transcript
            </span>
            <p
              className={`text-[12.5px] leading-relaxed font-mono transition-colors duration-300 ${
                isTranscribing ? "text-[var(--color-signal)]" : "text-[var(--color-parchment)]"
              }`}
            >
              <span className="text-[var(--color-fog)] mr-2">&gt;</span>
              {liveTranscript || "Waiting for audio…"}
            </p>
          </div>
        </div>
      </div>

      {/* Audit trail — full-width security event ledger */}
      <div className="w-full max-w-[1400px] mt-6 h-[420px]">
        <AuditTrail />
      </div>

      {/* Verdict generation overlay — blurs everything while the LLM works */}
      <LoadingOverlay open={isGenerating} />
    </main>
  );
}
