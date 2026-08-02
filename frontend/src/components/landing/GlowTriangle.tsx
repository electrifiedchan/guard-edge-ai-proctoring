"use client";

import { useEffect, useRef } from "react";

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;

uniform vec2  u_res;
uniform vec2  u_mouse;   // canvas-local pixels, y already flipped to GL space
uniform float u_time;
uniform float u_hover;   // 0..1, smoothed
uniform float u_burst;   // 0..1, spikes on click then decays

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.02; a *= 0.5; }
  return v;
}

// Inigo Quilez's exact-distance triangle SDF — negative inside, and because the
// vertices are explicit we control the orientation instead of guessing at a fold.
float sdTriangle(vec2 p, vec2 p0, vec2 p1, vec2 p2) {
  vec2 e0 = p1 - p0, e1 = p2 - p1, e2 = p0 - p2;
  vec2 v0 = p - p0,  v1 = p - p1,  v2 = p - p2;
  vec2 pq0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0);
  vec2 pq1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0.0, 1.0);
  vec2 pq2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0.0, 1.0);
  float s = sign(e0.x * e2.y - e0.y * e2.x);
  vec2 d = min(min(vec2(dot(pq0, pq0), s * (v0.x * e0.y - v0.y * e0.x)),
                   vec2(dot(pq1, pq1), s * (v1.x * e1.y - v1.y * e1.x))),
                   vec2(dot(pq2, pq2), s * (v2.x * e2.y - v2.y * e2.x)));
  return -sqrt(d.x) * sign(d.y);
}

void main() {
  // aspect-corrected, origin at centre, 1 unit = half canvas height
  vec2 uv    = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
  vec2 mouse = (u_mouse        - 0.5 * u_res) / u_res.y;

  float R = 0.30;
  vec2 A = vec2( 0.0,        R);
  vec2 B = vec2(-R * 0.966, -R * 0.55);
  vec2 C = vec2( R * 0.966, -R * 0.55);
  float d  = sdTriangle(uv, A, B, C);
  float aa = 1.6 / u_res.y;

  // slow drifting noise so the halo breathes rather than sitting static
  float shimmer = 0.80 + 0.34 * fbm(uv * 3.4 + vec2(0.0, -u_time * 0.10));
  // gentle overall pulse, so the white is never completely still
  shimmer *= 0.94 + 0.06 * sin(u_time * 1.3);

  // the mouse uniform's whole job: a soft blob that drags light toward the cursor
  float md     = length(uv - mouse);
  float cursor = exp(-md * md * 7.0);

  // Vignette: forces the field to zero BEFORE it reaches the canvas rectangle,
  // otherwise the glow gets clipped flat and you see the canvas box as a border.
  vec2  q   = (gl_FragCoord.xy / u_res) * 2.0 - 1.0;
  float vig = pow(1.0 - smoothstep(0.35, 1.0, length(q)), 1.5);

  // Two-lobe falloff: a tight rim hugging the edge plus a wide soft bloom.
  // One exponential can't be both crisp at the edge and gone by the canvas bound.
  float spread = 9.0 - 2.2 * u_hover - 1.6 * cursor;
  float rim    = exp(-max(d, 0.0) * (58.0 - 12.0 * u_hover));
  float bloom  = exp(-max(d, 0.0) * spread);
  float k      = shimmer * (0.40 + 0.42 * u_hover + 0.55 * cursor) * vig;

  // WHITE — always present, always animating
  vec3 col = vec3(1.0) * (rim * 0.85 + bloom * 0.40) * k;

  // RGB — chromatic dispersion ADDED over the white during a burst, so both
  // lights animate together instead of the colour replacing the white.
  // Concentric bands: -d shifts hue with distance, u_time makes them travel.
  vec3 spectrum = 0.5 + 0.5 * cos(vec3(0.0, 2.094, 4.188) + atan(uv.y, uv.x) * 2.0
                                  - d * 24.0 + u_time * 3.0);
  float ca = 0.020 * u_burst;
  vec3  disp = vec3(exp(-max(d - ca, 0.0) * spread),
                    exp(-max(d,      0.0) * spread),
                    exp(-max(d + ca, 0.0) * spread));
  col += spectrum * disp * k * u_burst * 2.4;

  // the face: near-black, catching a little light along the base
  vec3  face   = mix(vec3(0.012), vec3(0.075), smoothstep(R, -R * 0.55, uv.y));
  float inside = smoothstep(aa, -aa, d);

  // premultiplied output, so the halo adds over the page's black instead of dimming it
  float alpha = clamp(max(max(col.r, col.g), col.b), 0.0, 1.0);
  col   = mix(col, face, inside);
  alpha = mix(alpha, 1.0, inside);

  // inner rim keeps the edge crisp where it meets the halo
  float inner = exp(-max(-d, 0.0) * 34.0) * inside;
  col += mix(vec3(1.0), spectrum, u_burst) * inner * (0.18 + 0.30 * u_hover + 0.45 * u_burst);

  gl_FragColor = vec4(col, alpha);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    return null;
  }
  return s;
}

/**
 * WebGL triangle mark: an SDF triangle with a shader-driven halo that tracks the
 * pointer. Hover widens and brightens the white; a click drives a spectrum burst
 * with a chromatic edge split. Raw WebGL rather than three/R3F — this is one
 * fullscreen quad, and the libraries would cost ~600KB for it.
 */
export default function GlowTriangle({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", { alpha: true, antialias: false, premultipliedAlpha: true });
    if (!gl) return;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(prog));
      return;
    }
    gl.useProgram(prog);

    // One oversized triangle covers clip space — cheaper than a two-triangle quad.
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, "u_res");
    const uMouse = gl.getUniformLocation(prog, "u_mouse");
    const uTime = gl.getUniformLocation(prog, "u_time");
    const uHover = gl.getUniformLocation(prog, "u_hover");
    const uBurst = gl.getUniformLocation(prog, "u_burst");

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // premultiplied

    // target vs current, lerped per frame so hover/click ease instead of snapping
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    let hover = 0, hoverTarget = 0;
    let burst = 0, burstTarget = 0;

    let w = 0, h = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      w = Math.max(1, Math.round(r.width * dpr));
      h = Math.max(1, Math.round(r.height * dpr));
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      if (!mouse.tx && !mouse.ty) {
        mouse.tx = mouse.x = w / 2;
        mouse.ty = mouse.y = h / 2;
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Listen on window, not the canvas: the headline and buttons sit on top of it,
    // and the glow should still follow the cursor across them.
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      mouse.tx = (e.clientX - r.left) * dpr;
      mouse.ty = (r.bottom - e.clientY) * dpr; // flip to GL's y-up
      const inside =
        e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      hoverTarget = inside ? 1 : 0;
    };
    const onDown = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        // Toggle, not a flash: the spectrum stays up until the next click.
        burstTarget = burstTarget > 0.5 ? 0 : 1;
      }
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });

    // Don't burn GPU while the section is scrolled out of view.
    let visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0 });
    io.observe(canvas);

    let raf = 0;
    const start = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible) return;

      mouse.x += (mouse.tx - mouse.x) * 0.12;
      mouse.y += (mouse.ty - mouse.y) * 0.12;
      hover += (hoverTarget - hover) * 0.08;
      burst += (burstTarget - burst) * 0.07; // eases both ways: white ⇄ spectrum

      gl.uniform2f(uRes, w, h);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.uniform1f(uTime, (now - start) / 1000);
      gl.uniform1f(uHover, hover);
      gl.uniform1f(uBurst, burst);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className={`block ${className ?? ""}`} />;
}
