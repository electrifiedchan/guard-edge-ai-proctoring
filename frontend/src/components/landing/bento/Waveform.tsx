"use client";

import { useEffect, useRef } from "react";

/**
 * Siri-style flowing waveform — several sine ribbons layered with a spindle
 * envelope (fat center, thin ends). Animated on a canvas via requestAnimationFrame;
 * `level` (0–1) scales the amplitude so it reacts to the simulated voice volume.
 *
 * `colors` is optional and defaults to the landing page's emerald/teal palette.
 * The sentry page overrides it so the ribbons carry turn state (listening /
 * processing / speaking) instead of needing a second indicator.
 */
const DEFAULT_RIBBON_COLORS = [
  "rgba(52,211,153,0.55)",
  "rgba(45,212,191,0.50)",
  "rgba(56,189,248,0.45)",
  "rgba(94,234,212,0.40)",
];

export default function Waveform({
  level = 0.4,
  colors,
  getLevel,
}: {
  level?: number;
  colors?: string[];
  /**
   * Per-frame level source. Preferred over `level` when the amplitude changes
   * continuously (a live mic, an animated beat) — the RAF loop pulls from it
   * directly, so the waveform animates without re-rendering React 60×/sec.
   */
  getLevel?: () => number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Mirrored into refs so the draw loop reads current values without being
  // torn down and rebuilt on every prop change. Written in an effect rather
  // than during render, which isn't safe under concurrent rendering.
  const levelRef = useRef(level);
  const colorsRef = useRef<string[]>(colors ?? DEFAULT_RIBBON_COLORS);
  const getLevelRef = useRef<(() => number) | undefined>(getLevel);

  useEffect(() => {
    levelRef.current = level;
  }, [level]);

  useEffect(() => {
    colorsRef.current = colors ?? DEFAULT_RIBBON_COLORS;
  }, [colors]);

  useEffect(() => {
    getLevelRef.current = getLevel;
  }, [getLevel]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = canvas;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    };
    resize();
    window.addEventListener("resize", resize);

    // each ribbon: base amplitude, wavelength, speed, phase offset. Colour is
    // pulled from colorsRef at draw time.
    const RIBBONS = [
      { amp: 1.0, k: 1.4, speed: 1.1, phase: 0 },
      { amp: 0.8, k: 2.1, speed: -1.5, phase: 1.7 },
      { amp: 0.65, k: 2.9, speed: 1.9, phase: 3.1 },
      { amp: 0.5, k: 3.7, speed: -2.3, phase: 4.6 },
    ];

    const start = performance.now();
    const draw = (now: number) => {
      const t = (now - start) / 1000;
      const W = canvas.width;
      const H = canvas.height;
      const mid = H / 2;
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      ctx.lineWidth = 1.5 * dpr;

      const source = getLevelRef.current;
      const raw = source ? source() : levelRef.current;
      const lvl = 0.35 + raw * 0.9;

      const palette = colorsRef.current;

      for (let i = 0; i < RIBBONS.length; i++) {
        const r = RIBBONS[i];
        ctx.beginPath();
        for (let px = 0; px <= W; px += 2 * dpr) {
          const x = px / W; // 0..1
          // spindle envelope — sin(pi*x) is 0 at ends, 1 at center
          const env = Math.pow(Math.sin(Math.PI * x), 1.6);
          const y =
            mid +
            Math.sin(x * Math.PI * 2 * r.k + t * r.speed + r.phase) *
              env *
              r.amp *
              lvl *
              (H * 0.32);
          if (px === 0) ctx.moveTo(px, y);
          else ctx.lineTo(px, y);
        }
        ctx.strokeStyle = palette[i % palette.length];
        ctx.stroke();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="h-full w-full" />;
}
