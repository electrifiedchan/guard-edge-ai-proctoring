"use client";

import { useEffect, useRef, useState } from "react";
import Waveform from "@/components/landing/bento/Waveform";

/**
 * VOICE — Siri-style flowing waveform (landing page only).
 *
 * No microphone, no getUserMedia, no network. We drive a synthetic "volume"
 * (0–1) with a looping sine beat via requestAnimationFrame, and feed it to the
 * <Waveform> canvas so the ribbons breathe like a live "listening" state.
 */

function useSimulatedVolume() {
  const [volume, setVolume] = useState(0.2);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const start = performance.now();
    const loop = (now: number) => {
      const t = (now - start) / 1000;
      // two sines beating together → an organic, non-repetitive "listening" level
      const v = 0.28 + 0.22 * Math.sin(t * 1.7) + 0.12 * Math.sin(t * 0.6 + 1.3);
      setVolume(Math.max(0, Math.min(1, v)));
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
    };
  }, []);

  return volume;
}

export default function CellVoice() {
  const volume = useSimulatedVolume();

  return (
    <div className="flex flex-col gap-3 p-8 h-full">
      <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500">
        Voice · Whisper
      </span>

      {/* inset panel — waveform fills the WHOLE panel so its baseline is the true
          vertical center of the box; readout floats at the bottom edge */}
      <div className="flex-1 relative rounded-xl bg-neutral-950 border border-white/[0.06] overflow-hidden">
        {/* soft emerald glow behind the waveform */}
        <div
          aria-hidden
          className="absolute left-1/2 top-1/2 h-40 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
          style={{ background: "radial-gradient(ellipse, rgba(52,211,153,0.22), transparent 70%)" }}
        />
        {/* Siri-style flowing waveform — baseline centered, reacts to volume */}
        <div className="absolute inset-0">
          <Waveform level={volume} />
        </div>

        {/* technical readout — floats at the bottom edge, over the waveform */}
        <div className="absolute bottom-2 inset-x-0 text-center font-mono text-[10px] text-neutral-500">
          faster-whisper · int8 · offline · <span className="text-neutral-400">{volume.toFixed(2)}</span>
        </div>
      </div>

      <p className="font-sans text-[13px] tracking-normal text-neutral-400">
        Local Whisper transcription — zero audio leaves your machine.
      </p>
    </div>
  );
}
