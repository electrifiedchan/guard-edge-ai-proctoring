"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

export type VoiceState = "IDLE" | "LISTEN" | "PROCESS" | "SPEAK";

interface VoiceOrbProps {
  /** Called whenever the STT engine produces a transcript (interim or final). */
  onTranscript?: (text: string) => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────
const VAD_THRESHOLD   = 18;   // RMS (0-255) above which we consider "speech"
const SILENCE_HOLD_MS = 1800; // ms of silence before switching to PROCESS

export default function VoiceOrb({ onTranscript }: VoiceOrbProps) {
  const [voiceState, setVoiceState] = useState<VoiceState>("IDLE");
  const [devMode,    setDevMode]    = useState(false);
  const [isActive,   setIsActive]   = useState(false);
  const [micError,   setMicError]   = useState<string | null>(null);
  const [liveText,   setLiveText]   = useState("");

  // ── Stale-closure-safe ref for isActive ──────────────────────────────────
  const isActiveRef = useRef(false);
  useEffect(() => { isActiveRef.current = isActive; }, [isActive]);

  // ── Audio pipeline refs ───────────────────────────────────────────────────
  const audioCtxRef    = useRef<AudioContext | null>(null);
  const analyserRef    = useRef<AnalyserNode | null>(null);
  const micStreamRef   = useRef<MediaStream | null>(null);
  const vadRafRef      = useRef<number>(0);
  const silenceRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recognitionRef = useRef<any>(null);

  // ── Framer Motion audio-reactive scale ───────────────────────────────────
  // Raw motion value driven by the VAD loop (no delay)
  const rawScale   = useMotionValue(1);
  // Spring wraps it so the orb "breathes" smoothly with the voice
  const orbScale   = useSpring(rawScale, { stiffness: 280, damping: 22 });

  // ─── VAD Loop (requestAnimationFrame) ────────────────────────────────────
  const vadLoop = useCallback(() => {
    if (!analyserRef.current) return;

    const buf = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(buf);

    // RMS energy
    const rms = Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length);

    // Map 0-80 RMS → scale 1.0-1.55  (clamp at top)
    const normalised = Math.min(rms / 80, 1);
    rawScale.set(1 + normalised * 0.55);

    if (rms > VAD_THRESHOLD) {
      // Voice detected → ensure we're in LISTEN, cancel any pending silence timer
      setVoiceState("LISTEN");
      if (silenceRef.current) {
        clearTimeout(silenceRef.current);
        silenceRef.current = null;
      }
    }

    vadRafRef.current = requestAnimationFrame(vadLoop);
  }, [rawScale]);

  // ─── SpeechRecognition Setup ──────────────────────────────────────────────
  const buildRecognition = useCallback(() => {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) return null;

    const rec = new SR();
    rec.continuous      = true;
    rec.interimResults  = true;
    rec.lang            = "en-US";

    rec.onresult = (event: any) => {
      let interim = "";
      let final_  = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        event.results[i].isFinal ? (final_ += t) : (interim += t);
      }
      const display = final_ || interim;
      if (display) {
        setLiveText(display);
        onTranscript?.(`CANDIDATE: "${display}"`);
      }
    };

    rec.onspeechend = () => {
      // Brief silence detected by the browser's internal VAD
      setVoiceState("PROCESS");
      rawScale.set(1);
      // Return to LISTEN after processing window
      silenceRef.current = setTimeout(() => {
        if (isActiveRef.current) setVoiceState("LISTEN");
      }, SILENCE_HOLD_MS);
    };

    rec.onerror = (e: any) => {
      // "no-speech" is benign; anything else surfaces to the user
      if (e.error !== "no-speech") setMicError(`STT: ${e.error}`);
    };

    rec.onend = () => {
      // Auto-restart as long as the orb is still active (uses ref, not stale closure)
      if (isActiveRef.current) {
        try { rec.start(); } catch { /* already started */ }
      }
    };

    return rec;
  }, [rawScale, onTranscript]);

  // ─── Activate: mic + VAD + STT ───────────────────────────────────────────
  const startListening = useCallback(async () => {
    try {
      setMicError(null);
      setLiveText("");

      // 1. Microphone
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      // 2. AudioContext analyser
      const AC = window.AudioContext ?? (window as any).webkitAudioContext;
      const ctx = new AC();
      audioCtxRef.current  = ctx;
      const analyser       = ctx.createAnalyser();
      analyser.fftSize                = 256;
      analyser.smoothingTimeConstant  = 0.75;
      analyserRef.current  = analyser;
      ctx.createMediaStreamSource(stream).connect(analyser);

      // 3. VAD loop
      vadRafRef.current = requestAnimationFrame(vadLoop);

      // 4. SpeechRecognition
      const rec = buildRecognition();
      if (rec) {
        recognitionRef.current = rec;
        rec.start();
      } else {
        setMicError("Speech Recognition not supported in this browser.");
      }

      setIsActive(true);
      setVoiceState("LISTEN");
    } catch (err: any) {
      setMicError(`Mic: ${err.message}`);
      setVoiceState("IDLE");
    }
  }, [vadLoop, buildRecognition]);

  // ─── Deactivate: full teardown ────────────────────────────────────────────
  const stopListening = useCallback(() => {
    // Stop RAF
    cancelAnimationFrame(vadRafRef.current);

    // Stop STT (remove onend first so it doesn't restart)
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      try { recognitionRef.current.stop(); } catch { /* already stopped */ }
      recognitionRef.current = null;
    }

    // Stop mic tracks
    micStreamRef.current?.getTracks().forEach(t => t.stop());
    micStreamRef.current = null;

    // Close AudioContext
    audioCtxRef.current?.close();
    audioCtxRef.current  = null;
    analyserRef.current  = null;

    // Clear silence timer
    if (silenceRef.current) { clearTimeout(silenceRef.current); silenceRef.current = null; }

    rawScale.set(1);
    setIsActive(false);
    setVoiceState("IDLE");
    setLiveText("");
  }, [rawScale]);

  // Cleanup on unmount
  useEffect(() => () => stopListening(), [stopListening]);

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

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col items-center justify-center p-8 bg-[#0A0A0B] border border-sentry-border rounded-xl relative overflow-hidden group">

      {/* ── Hidden dev-mode toggle (top-right corner) ── */}
      <button
        onClick={() => setDevMode(d => !d)}
        className="absolute top-2 right-2 w-4 h-4 bg-transparent hover:bg-white/10 rounded cursor-pointer z-50 transition-colors"
        title="Toggle Developer Controls"
      />

      {/* ── Header ── */}
      <h3 className="text-[10px] tracking-widest text-gray-500 absolute top-4 left-4 flex items-center gap-2">
        <span className={`w-1 h-1 rounded-full transition-colors duration-300 ${isActive ? "bg-sentry-neon animate-pulse" : "bg-gray-500"}`} />
        AUDIO INTERROGATOR
      </h3>

      {/* ── THE AURA ORB ── */}
      <div className="relative w-32 h-32 my-8 flex items-center justify-center">
        <motion.div
          animate={{
            boxShadow: v.boxShadow,
            rotate:    v.rotate,
            // In LISTEN mode the spring scale (driven by VAD) takes over visually;
            // for all other states we pulse or contract via animate.
            scale: voiceState === "LISTEN" ? undefined : v.animScale,
          }}
          style={{
            // Spring scale drives the orb during LISTEN (audio-reactive)
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
          {/* Inner core dot */}
          <div className={`w-12 h-12 rounded-full transition-colors duration-500 ${
            voiceState === "IDLE"    ? "bg-gray-800" :
            voiceState === "LISTEN"  ? "bg-sentry-neon animate-pulse" :
            voiceState === "PROCESS" ? "bg-orange-500" :
            "bg-cyan-400"
          }`} />
        </motion.div>
      </div>

      {/* ── State label ── */}
      <p className={`text-xs tracking-widest font-mono transition-colors duration-500 ${
        voiceState === "IDLE"    ? "text-gray-600" :
        voiceState === "LISTEN"  ? "text-sentry-neon" :
        voiceState === "PROCESS" ? "text-orange-400" :
        "text-cyan-400"
      }`}>
        &gt; {v.text}
      </p>

      {/* ── ACTIVATE / DEACTIVATE button ── */}
      <button
        onClick={isActive ? stopListening : startListening}
        className={`mt-5 px-6 py-2 text-[10px] tracking-widest font-bold border rounded transition-all cursor-pointer ${
          isActive
            ? "border-red-500/50 text-red-400 hover:bg-red-500/10 hover:border-red-400"
            : "border-sentry-neon/50 text-sentry-neon hover:bg-sentry-neon/10 hover:border-sentry-neon"
        }`}
      >
        {isActive ? "DEACTIVATE MIC" : "ACTIVATE MIC"}
      </button>

      {/* ── Error display ── */}
      {micError && (
        <p className="mt-3 text-[9px] text-red-400 tracking-widest font-mono text-center px-2">
          ⚠ {micError}
        </p>
      )}

      {/* ── Live interim transcript preview ── */}
      {liveText && (
        <p className="mt-2 text-[9px] text-gray-500 tracking-wide font-mono text-center max-w-full line-clamp-2 px-2">
          "{liveText}"
        </p>
      )}

      {/* ── DEV PANEL (invisible to candidates) ── */}
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