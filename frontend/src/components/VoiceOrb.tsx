"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Waveform from "@/components/landing/bento/Waveform";
import { getSpeechEnvelope, NO_BOUNDARY_DATA } from "@/lib/speechLevel";

export type VoiceState = "IDLE" | "LISTEN" | "PROCESS" | "SPEAK";

interface VoiceOrbProps {
  onTranscriptUpdate?: (text: string) => void;
  externalState?: VoiceState;
  /**
   * Real mic level (0–1) from useVAD. When supplied and we're listening, the
   * ribbons track the candidate's actual voice instead of a synthetic beat.
   */
  level?: number;
  /**
   * Per-frame mic level from useVAD. Preferred over `level` when present: the
   * state prop can only update as fast as React re-renders the parent, which
   * is why the ribbons trailed the candidate's voice.
   */
  levelRef?: { current: number };
  /**
   * VAD gating from useVAD — whether speech is actually being detected, as
   * opposed to the mic merely being open. Only refines the LISTEN label.
   */
  voiceActive?: boolean;
}

/**
 * AUDIO INTERROGATOR — the Siri-style ribbon waveform from the landing page,
 * reused here so the marketing surface and the live product show the same
 * thing. The ribbon palette carries the turn state, so the waveform itself is
 * the status indicator rather than sitting next to one.
 */
const STATE_META: Record<
  VoiceState,
  { label: string; token: string; colors: string[]; baseline: number }
> = {
  // Idle: flat, grey, barely moving — clearly "not armed".
  IDLE: {
    label: "Standby",
    token: "var(--color-slate)",
    colors: [
      "rgba(98,102,109,0.45)",
      "rgba(98,102,109,0.32)",
      "rgba(98,102,109,0.22)",
      "rgba(98,102,109,0.16)",
    ],
    baseline: 0.05,
  },
  // Listening: the signal green of the rest of the app.
  LISTEN: {
    label: "Listening",
    token: "var(--color-signal)",
    colors: [
      "rgba(0,217,146,0.60)",
      "rgba(45,212,191,0.50)",
      "rgba(94,234,212,0.42)",
      "rgba(52,211,153,0.35)",
    ],
    baseline: 0.3,
  },
  // Processing: cooler mint, steady mid-level churn.
  PROCESS: {
    label: "Processing",
    token: "var(--color-mint)",
    colors: [
      "rgba(47,214,161,0.55)",
      "rgba(45,212,191,0.45)",
      "rgba(56,189,248,0.38)",
      "rgba(94,234,212,0.30)",
    ],
    baseline: 0.45,
  },
  // Speaking: shifts blue so it reads as "not your turn".
  SPEAK: {
    label: "Speaking",
    token: "var(--color-info)",
    colors: [
      "rgba(76,179,212,0.60)",
      "rgba(56,189,248,0.50)",
      "rgba(125,211,252,0.40)",
      "rgba(103,232,249,0.32)",
    ],
    baseline: 0.55,
  },
};

export default function VoiceOrb({
  onTranscriptUpdate,
  externalState,
  level,
  levelRef,
  voiceActive,
}: VoiceOrbProps) {
  // Internal state only matters when nothing external is driving us — the
  // standalone/dev path. Derived rather than synced through an effect so there's
  // no render-then-correct flash when the parent changes turn.
  const [internalState, setInternalState] = useState<VoiceState>("IDLE");
  const [devMode, setDevMode] = useState(false);
  const [isEngaged, setIsEngaged] = useState(false);

  const voiceState = externalState ?? internalState;

  useEffect(() => {
    // GATE THE POLLING: If not engaged, do not set up the interval at all.
    if (!isEngaged) return;

    let lastTranscript = "";

    const fetchVoiceStatus = async () => {
      try {
        const response = await fetch("http://localhost:8080/api/v1/voice-status");
        if (response.ok) {
          const data = await response.json();
          setInternalState(data.state);

          if (data.transcript && data.transcript !== lastTranscript) {
            lastTranscript = data.transcript;
            if (onTranscriptUpdate) onTranscriptUpdate(data.transcript);
          }
        }
      } catch (e) {
        console.log("Backend voice sync failed:", (e as Error).message);
      }
    };

    const interval = setInterval(fetchVoiceStatus, 500);
    return () => clearInterval(interval);
  }, [isEngaged, onTranscriptUpdate]);

  const v = STATE_META[voiceState];
  const isLive = voiceState !== "IDLE";
  // Mic audio only exists while listening. SPEAK reads the TTS envelope
  // instead; PROCESS has no audio at all and stays synthetic.
  const useRealLevel =
    voiceState === "LISTEN" && (levelRef !== undefined || typeof level === "number");

  // The canvas pulls amplitude per frame through getLevel, so everything it
  // needs lives in a ref. Driving it through state instead would re-render this
  // component (and the sentry page's whole sidebar) on every animation frame.
  const frame = useRef({
    baseline: v.baseline,
    useRealLevel,
    level: level ?? 0,
    isLive,
    isSpeaking: voiceState === "SPEAK",
  });

  useEffect(() => {
    frame.current = {
      baseline: v.baseline,
      useRealLevel,
      level: level ?? 0,
      isLive,
      isSpeaking: voiceState === "SPEAK",
    };
  }, [v.baseline, useRealLevel, level, isLive, voiceState]);

  // Smoothed across frames so the ribbons ease between samples instead of
  // snapping — raw RMS and the TTS envelope are both quite jumpy per frame.
  const smoothed = useRef(0);

  const getLevel = useCallback(() => {
    const f = frame.current;

    const synthetic = () => {
      // Two beating sines — the same organic motion as the landing page's
      // CellVoice, for states where no audio signal is observable.
      const t = performance.now() / 1000;
      return f.baseline + 0.22 * Math.sin(t * 1.7) + 0.12 * Math.sin(t * 0.6 + 1.3);
    };

    let target: number;

    if (f.isSpeaking) {
      // The AI's turn: follow the synthesiser's word boundaries so the ribbons
      // rise and fall with the sentence actually being spoken.
      const envelope = getSpeechEnvelope();
      target =
        envelope === NO_BOUNDARY_DATA
          ? synthetic() // voice reports no boundaries — better than flatlining
          : 0.12 + envelope * 0.85;
    } else if (f.useRealLevel) {
      // useVAD already scales RMS by 10. The extra x3 here pushed anything
      // above a murmur to a clipped 1.0, so the waveform sat pinned at full
      // height and stopped tracking the voice; x1.6 keeps headroom. The old
      // baseline floor (0.3 while listening) also swallowed the bottom third
      // of the range, which is exactly where quiet speech lives.
      const mic = levelRef ? levelRef.current : f.level;
      target = Math.min(1, 0.06 + mic * 1.6);
    } else if (!f.isLive) {
      target = f.baseline;
    } else {
      target = synthetic();
    }

    target = Math.max(0, Math.min(1, target));
    // Attack faster than release: catch the onset of a word, then fall away.
    const k = target > smoothed.current ? 0.45 : 0.14;
    smoothed.current += (target - smoothed.current) * k;
    return smoothed.current;
  }, [levelRef]);

  // While the mic is open, distinguish "we hear you" from "waiting" — the one
  // piece of information the old separate level bar carried.
  const label =
    voiceState === "LISTEN" && voiceActive === false ? "Waiting for voice" : v.label;

  return (
    <div
      className={`lift-1 rounded-lg relative overflow-hidden flex flex-col ${
        externalState ? "p-4" : "p-6"
      }`}
    >
      <button
        onClick={() => setDevMode((d) => !d)}
        className="absolute top-2 right-2 w-4 h-4 bg-transparent hover:bg-[var(--color-surface-2)] rounded cursor-pointer z-50 transition-colors"
        title="Toggle developer controls"
      />

      <span className="eyebrow flex items-center gap-2">
        <span
          className={`w-1.5 h-1.5 rounded-full transition-colors ${
            isLive || isEngaged
              ? "bg-[var(--color-signal)] pulse-signal"
              : "bg-[var(--color-fog)]"
          }`}
        />
        Audio interrogator
      </span>

      {/* Inset panel — the waveform fills it entirely so its baseline is the
          true vertical center, with the state label floating at the bottom. */}
      <div
        className={`relative mt-3 rounded-xl bg-[var(--color-void)] border border-[var(--color-hairline)] overflow-hidden ${
          externalState ? "h-28" : "h-40"
        }`}
      >
        {/* soft state-coloured glow behind the ribbons */}
        <div
          aria-hidden
          className="absolute left-1/2 top-1/2 h-32 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl transition-opacity duration-700"
          style={{
            background: `radial-gradient(ellipse, ${v.colors[0]}, transparent 70%)`,
            opacity: isLive ? 0.5 : 0.15,
          }}
        />

        <div className="absolute inset-0">
          <Waveform getLevel={getLevel} colors={v.colors} />
        </div>

        <div className="absolute bottom-2 inset-x-0 text-center">
          <span
            className="text-[11px] font-medium transition-colors duration-500"
            style={{ color: isLive ? v.token : "var(--color-slate)" }}
          >
            {label}
          </span>
        </div>
      </div>

      {!externalState && (
        <button
          onClick={() => setIsEngaged(!isEngaged)}
          className={`mt-4 self-center h-9 px-4 rounded-md text-[12px] font-medium border transition-colors cursor-pointer ${
            isEngaged
              ? "bg-[var(--color-danger)]/10 border-[var(--color-danger)]/30 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/20 hover:border-[var(--color-danger)]/60"
              : "bg-[var(--color-signal)]/15 border-[var(--color-signal)]/40 text-[var(--color-signal)] hover:bg-[var(--color-signal)]/25 hover:border-[var(--color-signal)]"
          }`}
        >
          {isEngaged ? "Deactivate sync" : "Activate sync"}
        </button>
      )}

      {devMode && !externalState && (
        <div className="mt-6 pt-4 border-t border-[var(--color-hairline)] w-full flex flex-col items-center gap-2">
          <span className="eyebrow">Dev override</span>
          <div className="flex gap-1.5 flex-wrap justify-center">
            {(["IDLE", "LISTEN", "PROCESS", "SPEAK"] as VoiceState[]).map((state) => (
              <button
                key={state}
                onClick={() => setInternalState(state)}
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
