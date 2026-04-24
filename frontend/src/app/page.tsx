"use client";

import { useState } from "react";
import SniperScope, { RiskPacket } from "@/components/SniperScope";
import VoiceOrb from "@/components/VoiceOrb";

export default function Home() {
  const [hasWarned, setHasWarned] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("SYSTEM STANDBY. WAITING FOR TRIGGER.");
  const [isTranscribing, setIsTranscribing] = useState(false);

  // Receives live transcripts from VoiceOrb's SpeechRecognition engine
  const handleTranscript = (text: string) => {
    setLiveTranscript(text);
    setIsTranscribing(true);
    // Dim the indicator after 2s of silence
    setTimeout(() => setIsTranscribing(false), 2000);
  };

  // --- THE BRAIN: Vision to Voice to Santiago LLM-Judge ---
  const handleTelemetry = (packet: RiskPacket, verdict: string) => {
    
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

  return (
    <main className="min-h-screen bg-[#050505] flex flex-col p-8 font-mono text-gray-300 items-center overflow-x-hidden">
      
      {/* Top Navigation */}
      <header className="w-full max-w-[1400px] mb-8 flex items-end border-b border-sentry-border pb-6">
        <div>
          <h1 className="text-4xl font-black tracking-[0.3em] text-white">G.U.A.R.D.</h1>
          <p className="text-[10px] tracking-widest text-sentry-neon mt-2 font-bold">SOVEREIGN EDGE-AI PROCTORING ECOSYSTEM</p>
        </div>
      </header>

      {/* The Unified Dashboard Grid */}
      <div className="w-full max-w-[1400px] flex flex-col 2xl:flex-row gap-8 items-start justify-center">
        
        {/* Module 1: The Vision Sentry */}
        <div className="flex-1 w-full">
          <SniperScope onTelemetryUpdate={handleTelemetry} />
        </div>

        {/* Module 2: The Interrogator Stack */}
        <div className="flex-shrink-0 flex flex-col gap-8 w-full 2xl:w-[320px] pt-0 xl:pt-8 2xl:pt-0">
           <VoiceOrb onTranscriptUpdate={setLiveTranscript} />
           
           {/* Live Interrogator Transcript */}
           <div className="border border-sentry-border bg-[#0A0A0B] p-6 rounded-xl flex flex-col min-h-[200px] shadow-lg relative overflow-hidden">
             <div className={`absolute top-0 left-0 w-full h-1 transition-colors duration-300 ${isTranscribing ? "bg-sentry-neon shadow-[0_0_12px_rgba(0,255,65,0.5)]" : "bg-gray-800"}`} />
             <span className="text-[10px] tracking-widest text-gray-500 mb-4 font-bold flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full transition-colors duration-300 ${isTranscribing ? "bg-sentry-neon animate-pulse" : "bg-gray-600"}`} />
                VOICE LLM TRANSCRIPT
             </span>
             <p className={`text-xs leading-loose font-mono transition-colors duration-300 ${isTranscribing ? "text-sentry-neon" : "text-gray-300"}`}>
               {liveTranscript || "> WAITING FOR AUDIO..."}
             </p>
           </div>
        </div>
      </div>
    </main>
  );
}