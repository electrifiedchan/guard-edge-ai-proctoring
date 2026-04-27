"use client";

import { useState, useEffect } from "react";
import { motion, useSpring } from "framer-motion";

export type VoiceState = "IDLE" | "LISTEN" | "PROCESS" | "SPEAK";

interface VoiceOrbProps {
  onTranscriptUpdate?: (text: string) => void;
}

export default function VoiceOrb({ onTranscriptUpdate }: VoiceOrbProps) {
  const [voiceState, setVoiceState] = useState<VoiceState>("IDLE");
  const [devMode, setDevMode] = useState(false);
  const [isActive, setIsActive] = useState(true);

  // Simulate VAD-driven framer motion scale
  const orbScale = useSpring(1, { stiffness: 280, damping: 22 });

  useEffect(() => {
    let lastTranscript = "";

    const fetchVoiceStatus = async () => {
      if (!isActive) return;
      try {
        const response = await fetch("http://localhost:8080/api/v1/voice-status");
        if (response.ok) {
          const data = await response.json();
          setVoiceState(data.state);
          
          if (data.transcript && data.transcript !== lastTranscript) {
            lastTranscript = data.transcript;
            if (onTranscriptUpdate) onTranscriptUpdate(data.transcript);
          }
          
          // Simulate audio-reactive bounce during LISTEN
          if (data.state === "LISTEN") {
            orbScale.set(1 + Math.random() * 0.2);
          } else {
            orbScale.set(1);
          }
        }
      } catch (e) {
        console.log("Backend voice sync failed:", (e as Error).message);
      }
    };

    const interval = setInterval(fetchVoiceStatus, 500);
    return () => clearInterval(interval);
  }, [isActive, onTranscriptUpdate, orbScale]);

  // ─── Orb Visual Mappings ─────────────────────────────────────────────────
  const getOrbVisuals = () => {
    switch (voiceState) {
      case "IDLE":    return {
        boxShadow:  "0px 0px 0px rgba(0,0,0,0)",
        border:     "1px solid rgba(255,255,255,0.1)",
        background: "radial-gradient(circle, rgba(20,20,20,1) 0%, rgba(0,0,0,1) 100%)",
        animScale:  1,    rotate: 0,       duration: 4,    text: "STANDBY",
      };
      case "LISTEN":  return {
        boxShadow:  "0px 0px 40px rgba(0,255,65,0.4)",
        border:     "2px solid rgba(0,255,65,0.8)",
        background: "radial-gradient(circle, rgba(0,255,65,0.2) 0%, rgba(0,0,0,1) 100%)",
        animScale:  1,    rotate: 0,       duration: 1.5,  text: "LISTENING...",
      };
      case "PROCESS": return {
        boxShadow:  "0px 0px 20px rgba(255,165,0,0.5)",
        border:     "2px dashed rgba(255,165,0,0.8)",
        background: "radial-gradient(circle, rgba(255,165,0,0.1) 0%, rgba(0,0,0,1) 100%)",
        animScale:  0.9,  rotate: 360,     duration: 0.8,  text: "PROCESSING",
      };
      case "SPEAK":   return {
        boxShadow:  "0px 0px 60px rgba(0,195,255,0.6)",
        border:     "3px solid rgba(0,195,255,1)",
        background: "radial-gradient(circle, rgba(0,195,255,0.3) 0%, rgba(0,0,0,1) 100%)",
        animScale:  [1, 1.2, 0.9, 1.1, 1], rotate: 0,    duration: 0.3,  text: "SPEAKING",
      };
    }
  };

  const v = getOrbVisuals();

  return (
    <div className="flex flex-col items-center justify-center p-8 bg-[#0A0A0B] border border-sentry-border rounded-xl relative overflow-hidden group">
      <button
        onClick={() => setDevMode(d => !d)}
        className="absolute top-2 right-2 w-4 h-4 bg-transparent hover:bg-white/10 rounded cursor-pointer z-50 transition-colors"
        title="Toggle Developer Controls"
      />

      <h3 className="text-[10px] tracking-widest text-gray-500 absolute top-4 left-4 flex items-center gap-2">
        <span className={`w-1 h-1 rounded-full transition-colors duration-300 ${isActive ? "bg-sentry-neon animate-pulse" : "bg-gray-500"}`} />
        AUDIO INTERROGATOR
      </h3>

      <div className="relative w-32 h-32 my-8 flex items-center justify-center">
        <motion.div
          animate={{
            boxShadow: v.boxShadow,
            rotate:    v.rotate,
            scale: voiceState === "LISTEN" ? undefined : v.animScale,
          }}
          style={{
            scale:      voiceState === "LISTEN" ? orbScale : undefined,
            border:     v.border,
            background: v.background,
          }}
          transition={{
            duration: v.duration,
            repeat:   voiceState === "PROCESS" || voiceState === "SPEAK" ? Infinity : 0,
            ease:     voiceState === "PROCESS" ? "linear" : "easeInOut",
          }}
          className="absolute inset-0 rounded-full flex items-center justify-center z-10"
        >
          <div className={`w-12 h-12 rounded-full transition-colors duration-500 ${
            voiceState === "IDLE"    ? "bg-gray-800" :
            voiceState === "LISTEN"  ? "bg-sentry-neon animate-pulse" :
            voiceState === "PROCESS" ? "bg-orange-500" :
            "bg-cyan-400"
          }`} />
        </motion.div>
      </div>

      <p className={`text-xs tracking-widest font-mono transition-colors duration-500 ${
        voiceState === "IDLE"    ? "text-gray-600" :
        voiceState === "LISTEN"  ? "text-sentry-neon" :
        voiceState === "PROCESS" ? "text-orange-400" :
        "text-cyan-400"
      }`}>
        &gt; {v.text}
      </p>

      <button
        onClick={() => setIsActive(!isActive)}
        className={`mt-5 px-6 py-2 text-[10px] tracking-widest font-bold border rounded transition-all cursor-pointer ${
          isActive
            ? "border-red-500/50 text-red-400 hover:bg-red-500/10 hover:border-red-400"
            : "border-sentry-neon/50 text-sentry-neon hover:bg-sentry-neon/10 hover:border-sentry-neon"
        }`}
      >
        {isActive ? "DEACTIVATE SYNC" : "ACTIVATE SYNC"}
      </button>

      {devMode && (
        <div className="mt-6 pt-4 border-t border-sentry-border w-full flex flex-col items-center gap-2">
          <span className="text-[9px] text-gray-500 tracking-widest">DEV OVERRIDE</span>
          <div className="flex gap-2 flex-wrap justify-center">
            {(["IDLE", "LISTEN", "PROCESS", "SPEAK"] as VoiceState[]).map(state => (
              <button
                key={state}
                onClick={() => setVoiceState(state)}
                className={`px-3 py-1 text-[10px] tracking-widest border rounded transition-all ${
                  voiceState === state
                    ? "bg-white text-black border-white font-bold"
                    : "border-gray-700 text-gray-500 hover:border-gray-400"
                }`}
              >
                {state}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}