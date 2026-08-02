"use client";

import { useEffect, useRef } from "react";

/**
 * ParticleText — NuxtLabs-style canvas particle assembly.
 *
 * Samples `text` via an offscreen canvas to get target dot positions, then
 * scatter-to-forms the shape over ~1.5s ease-out on scroll into view (once, at
 * 40% visibility via IntersectionObserver), then holds with a subtle idle drift
 * that self-terminates after 5s. Particles are brand green (not white).
 *
 * Respects prefers-reduced-motion (renders the final static shape immediately).
 * Mobile halves the particle count. Frame loop is rAF-capped to ~60fps.
 */
type P = { x: number; y: number; tx: number; ty: number; sx: number; sy: number };

export default function ParticleText({
  text,
  className,
  fontSize = 88,
  fontWeight = 600,
  fontFamily = "Fraunces, Georgia, serif",
  color = "52,211,153",
}: {
  text: string;
  className?: string;
  fontSize?: number;
  fontWeight?: number;
  fontFamily?: string;
  color?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const gap = isMobile ? 6 : 4; // sampling stride → controls particle count

    let particles: P[] = [];
    let raf = 0;
    let running = false;

    const build = () => {
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      canvas.width = cssW * dpr;
      canvas.height = cssH * dpr;

      // render target text to an offscreen buffer, then read its pixels
      const off = document.createElement("canvas");
      off.width = canvas.width;
      off.height = canvas.height;
      const octx = off.getContext("2d");
      if (!octx) return;
      octx.fillStyle = "#fff";
      octx.textAlign = "center";
      octx.textBaseline = "middle";
      octx.font = `${fontWeight} ${fontSize * dpr}px ${fontFamily}`;
      octx.fillText(text, off.width / 2, off.height / 2);

      const data = octx.getImageData(0, 0, off.width, off.height).data;
      const pts: P[] = [];
      for (let y = 0; y < off.height; y += gap * dpr) {
        for (let x = 0; x < off.width; x += gap * dpr) {
          if (data[(y * off.width + x) * 4 + 3] > 128) {
            pts.push({
              tx: x,
              ty: y,
              x: Math.random() * canvas.width,
              y: Math.random() * canvas.height,
              sx: Math.random() * canvas.width,
              sy: Math.random() * canvas.height,
            });
          }
        }
      }
      particles = pts;
    };

    const drawStatic = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = `rgba(${color},0.85)`;
      const r = 1.1 * dpr;
      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.tx, p.ty, r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

    const animate = () => {
      const DURATION = 1500;
      const IDLE_KILL = 5000;
      const start = performance.now();
      let last = 0;
      const r = 1.1 * dpr;

      const frame = (now: number) => {
        if (now - last < 1000 / 60) {
          raf = requestAnimationFrame(frame);
          return;
        }
        last = now;
        const elapsed = now - start;
        const p01 = Math.min(elapsed / DURATION, 1);
        const e = easeOut(p01);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = `rgba(${color},0.85)`;

        for (const p of particles) {
          if (p01 < 1) {
            p.x = p.sx + (p.tx - p.sx) * e;
            p.y = p.sy + (p.ty - p.sy) * e;
          } else if (elapsed < DURATION + IDLE_KILL) {
            // subtle idle drift (≤1px)
            p.x = p.tx + (Math.random() - 0.5) * dpr;
            p.y = p.ty + (Math.random() - 0.5) * dpr;
          } else {
            p.x = p.tx;
            p.y = p.ty;
          }
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();
        }

        if (elapsed < DURATION + IDLE_KILL) {
          raf = requestAnimationFrame(frame);
        } else {
          drawStatic(); // settle exactly on shape, stop the loop
        }
      };
      raf = requestAnimationFrame(frame);
    };

    let io: IntersectionObserver | null = null;

    // Sample AFTER the web font is ready so particles form the real serif shape,
    // not a fallback font. (This is the only "prerequisite" — no SVG asset needed.)
    const setup = () => {
      build();

      if (reduce) {
        drawStatic();
        return;
      }

      io = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && !running) {
            running = true;
            animate();
            io?.disconnect();
          }
        },
        { threshold: 0.4 }
      );
      io.observe(canvas);
    };

    if (document.fonts && "ready" in document.fonts) {
      document.fonts.ready.then(setup);
    } else {
      setup();
    }

    return () => {
      cancelAnimationFrame(raf);
      io?.disconnect();
    };
  }, [text, fontSize, fontWeight, fontFamily, color]);

  return <canvas ref={canvasRef} className={className} aria-hidden />;
}
