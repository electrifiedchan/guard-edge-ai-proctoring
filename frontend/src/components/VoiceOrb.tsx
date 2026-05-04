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
  const [isEngaged, setIsEngaged] = useState(false); // Default to false to prevent rogue polling on load

  // Simulate VAD-driven framer motion scale
  const orbScale = useSpring(1, { stiffness: 280, damping: 22 });

  useEffect(() => {
    // GATE THE POLLING: If not engaged, do not set up the interval at all.
    if (!isEngaged) return;

    let lastTranscript = "";

    const fetchVoiceStatus = async () => {
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
  }, [isEngaged, onTranscriptUpdate, orbScale]);

  // ─── Orb visual mappings ────────────────────────────────────────────────
  // Single-token-per-state so palette stays consistent with the rest of the app.
  const stateMeta: Record<VoiceState, { label: string; token: string; rgba: string; rotate: number; duration: number; animScale: number | number[] }> = {
    IDLE:    { label: "Standby",     token: "var(--color-fog)",    rgba: "98,102,109",   rotate: 0,   duration: 4,   animScale: 1 },
    LISTEN:  { label: "Listening",   token: "var(--color-signal)", rgba: "0,217,146",    rotate: 0,   duration: 1.5, animScale: 1 },
    PROCESS: { label: "Processing",  token: "var(--color-mint)",   rgba: "47,214,161",   rotate: 360, duration: 0.8, animScale: 0.94 },
    SPEAK:   { label: "Speaking",    token: "var(--color-info)",   rgba: "76,179,212",   rotate: 0,   duration: 0.3, animScale: [1, 1.12, 0.94, 1.06, 1] },
  };

  const v = stateMeta[voiceState];

  return (
    <div className="lift-1 rounded-lg p-6 relative overflow-hidden flex flex-col items-center">
      <button
        onClick={() => setDevMode(d => !d)}
        className="absolute top-2 right-2 w-4 h-4 bg-transparent hover:bg-[var(--color-surface-2)] rounded cursor-pointer z-50 transition-colors"
        title="Toggle developer controls"
      />

      <span className="absolute top-4 left-4 eyebrow flex items-center gap-2">
        <span
          className={`w-1.5 h-1.5 rounded-full transition-colors ${
            isEngaged ? "bg-[var(--color-signal)] pulse-signal" : "bg-[var(--color-fog)]"
          }`}
        />
        Audio interrogator
      </span>

      <div className="relative w-32 h-32 my-8 flex items-center justify-center">
        <motion.div
          animate={{
            boxShadow: voiceState === "IDLE"
              ? "0 0 0 rgba(0,0,0,0)"
              : `0 0 32px rgba(${v.rgba}, 0.30)`,
            rotate: v.rotate,
            scale: voiceState === "LISTEN" ? undefined : v.animScale,
          }}
          style={{
            scale: voiceState === "LISTEN" ? orbScale : undefined,
            border: `1px solid rgba(${v.rgba}, ${voiceState === "IDLE" ? 0.18 : 0.55})`,
            background: `radial-gradient(circle, rgba(${v.rgba}, ${voiceState === "IDLE" ? 0.04 : 0.16}) 0%, var(--color-surface) 70%)`,
          }}
          transition={{
            duration: v.duration,
            repeat: voiceState === "PROCESS" || voiceState === "SPEAK" ? Infinity : 0,
            ease: voiceState === "PROCESS" ? "linear" : "easeInOut",
          }}
          className="absolute inset-0 rounded-full flex items-center justify-center z-10"
        >
          <div
            className="w-10 h-10 rounded-full transition-colors duration-500"
            style={{
              backgroundColor: voiceState === "IDLE" ? "var(--color-surface-3)" : v.token,
              boxShadow: voiceState === "IDLE" ? "none" : `0 0 12px rgba(${v.rgba}, 0.55)`,
            }}
          />
        </motion.div>
      </div>

      <p
        className="text-[12px] font-medium transition-colors duration-500"
        style={{ color: voiceState === "IDLE" ? "var(--color-slate)" : v.token }}
      >
        {v.label}
      </p>

      <button
        onClick={() => setIsEngaged(!isEngaged)}
        className={`mt-5 h-9 px-4 rounded-md text-[12px] font-medium border transition-colors cursor-pointer ${
          isEngaged
            ? "bg-transparent border-[var(--color-danger)]/40 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10"
            : "bg-[var(--color-surface)] border-[var(--color-hairline)] text-[var(--color-mint)] hover:border-[var(--color-signal)] hover:text-[var(--color-signal)]"
        }`}
      >
        {isEngaged ? "Deactivate sync" : "Activate sync"}
      </button>

      {devMode && (
        <div className="mt-6 pt-4 border-t border-[var(--color-hairline)] w-full flex flex-col items-center gap-2">
          <span className="eyebrow">Dev override</span>
          <div className="flex gap-1.5 flex-wrap justify-center">
            {(["IDLE", "LISTEN", "PROCESS", "SPEAK"] as VoiceState[]).map(state => (
              <button
                key={state}
                onClick={() => setVoiceState(state)}
                className={`px-2.5 h-7 text-[11px] font-medium rounded-md border transition-colors ${
                  voiceState === state
                    ? "bg-[var(--color-surface-2)] border-[var(--color-hairline-strong)] text-[var(--color-snow)]"
                    : "border-[var(--color-hairline)] text-[var(--color-slate)] hover:text-[var(--color-snow)] hover:border-[var(--color-hairline-strong)]"
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
