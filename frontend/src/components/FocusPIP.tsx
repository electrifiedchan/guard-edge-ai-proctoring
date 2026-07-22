"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/**
 * FocusPIP — Practice Gym vision gatekeeper.
 * Lightweight PIP webcam with local-only Focus Score via MediaPipe Face Mesh.
 * No frames leave the device. No backend calls.
 */

interface FocusPIPProps {
  /** Whether the monitor is active (controls camera + inference) */
  active?: boolean;
  /** Called each frame with the current focus score 0-100 */
  onScoreUpdate?: (score: number) => void;
}

export default function FocusPIP({ active = true, onScoreUpdate }: FocusPIPProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const faceMeshRef = useRef<any>(null);
  const rafRef = useRef<number | null>(null);
  const scoreCallbackRef = useRef(onScoreUpdate);

  const [score, setScore] = useState(100);
  const [status, setStatus] = useState<"locked" | "distracted" | "no-face">("locked");
  const [cameraReady, setCameraReady] = useState(false);

  // Keep callback ref stable
  useEffect(() => {
    scoreCallbackRef.current = onScoreUpdate;
  }, [onScoreUpdate]);

  // Smoothing: exponential moving average to avoid jittery score
  const emaRef = useRef(100);
  const SMOOTHING = 0.3; // higher = more responsive, lower = smoother

  const computeFocusScore = useCallback((landmarks: any[]): number => {
    if (!landmarks || landmarks.length === 0) return 0;

    const primary = landmarks[0];
    if (!primary || primary.length < 469) return 0;

    const nose = primary[1];
    const forehead = primary[10];
    const chin = primary[152];
    const leftEye = primary[33];
    const rightEye = primary[263];

    // --- PITCH (up/down) ---
    const foreheadToNose = nose.y - forehead.y;
    const noseToChin = chin.y - nose.y;
    const pitchRatio = foreheadToNose / (noseToChin || 0.001);
    // Neutral pitchRatio ~0.7-1.0; deviation means looking up/down
    const pitchDeviation = Math.abs(pitchRatio - 0.85);

    // --- YAW (left/right) ---
    const dx = rightEye.x - leftEye.x;
    const noseX = dx !== 0 ? (nose.x - leftEye.x) / dx : 0.5;
    // Neutral noseX ~0.5; deviation means turned head
    const yawDeviation = Math.abs(noseX - 0.5);

    // --- GAZE (iris tracking if available) ---
    let gazeDeviation = 0;
    if (primary.length >= 478) {
      const lIris = primary[468];
      const lInner = primary[133];
      const lOuter = primary[33];
      const lWidth = Math.abs(lOuter.x - lInner.x) || 0.001;
      const lGazeX = (lIris.x - lOuter.x) / lWidth;

      const rIris = primary[473];
      const rInner = primary[362];
      const rOuter = primary[263];
      const rWidth = Math.abs(rOuter.x - rInner.x) || 0.001;
      const rGazeX = (rIris.x - rOuter.x) / rWidth;

      const avgGaze = (lGazeX + rGazeX) / 2;
      gazeDeviation = Math.abs(avgGaze - 0.5);
    }

    // --- Composite score ---
    // Each factor penalises from 100. Weights: yaw is most noticeable,
    // pitch secondary, gaze tertiary.
    let rawScore = 100;
    rawScore -= yawDeviation * 200;   // 0.25 deviation = -50 pts
    rawScore -= pitchDeviation * 100; // 0.3 deviation = -30 pts
    rawScore -= gazeDeviation * 80;   // 0.2 deviation = -16 pts

    return Math.max(0, Math.min(100, Math.round(rawScore)));
  }, []);

  // --- Camera + FaceMesh init ---
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraReady(true);
      }
    } catch (err) {
      console.error("FocusPIP: Camera access denied", err);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (faceMeshRef.current) {
      try { faceMeshRef.current.close(); } catch {}
      faceMeshRef.current = null;
    }
    setCameraReady(false);
  }, []);

  const initFaceMesh = useCallback(() => {
    const FaceMesh = (window as any).FaceMesh;
    if (!FaceMesh) {
      setTimeout(initFaceMesh, 500);
      return;
    }

    const fm = new FaceMesh({
      locateFile: (file: string) => `/mediapipe/${file}`,
    });

    fm.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    fm.onResults((results: any) => {
      const landmarks = results.multiFaceLandmarks;
      if (!landmarks || landmarks.length === 0) {
        emaRef.current = emaRef.current * (1 - SMOOTHING) + 0 * SMOOTHING;
        const smoothed = Math.round(emaRef.current);
        setScore(smoothed);
        setStatus("no-face");
        scoreCallbackRef.current?.(smoothed);
        return;
      }

      const raw = computeFocusScore(landmarks);
      emaRef.current = emaRef.current * (1 - SMOOTHING) + raw * SMOOTHING;
      const smoothed = Math.round(emaRef.current);

      setScore(smoothed);
      setStatus(smoothed >= 60 ? "locked" : "distracted");
      scoreCallbackRef.current?.(smoothed);

      // Draw iris dots on overlay
      if (overlayRef.current && landmarks[0].length >= 478) {
        const ctx = overlayRef.current.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, 320, 240);
          ctx.fillStyle = smoothed >= 60 ? "#00e5a0" : "#ff4444";
          const lIris = landmarks[0][468];
          const rIris = landmarks[0][473];
          ctx.beginPath();
          ctx.arc(lIris.x * 320, lIris.y * 240, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(rIris.x * 320, rIris.y * 240, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });

    faceMeshRef.current = fm;

    // Start rAF inference loop
    let lastTime = -1;
    const onFrame = async () => {
      if (!videoRef.current || !faceMeshRef.current) return;
      const video = videoRef.current;
      if (video.readyState >= 3 && video.currentTime !== lastTime) {
        lastTime = video.currentTime;
        await faceMeshRef.current.send({ image: video });
      }
      rafRef.current = requestAnimationFrame(onFrame);
    };
    rafRef.current = requestAnimationFrame(onFrame);
  }, [computeFocusScore]);

  // Load the FaceMesh script
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ((window as any).FaceMesh) return;
    const script = document.createElement("script");
    script.src = "/mediapipe/face_mesh.js";
    script.async = true;
    document.head.appendChild(script);
  }, []);

  // Start/stop based on active prop
  useEffect(() => {
    if (active) {
      startCamera().then(() => {
        setTimeout(initFaceMesh, 300);
      });
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [active, startCamera, stopCamera, initFaceMesh]);

  const statusColor =
    status === "locked"
      ? "bg-emerald-400"
      : status === "distracted"
      ? "bg-red-400"
      : "bg-neutral-500";

  const statusLabel =
    status === "locked"
      ? "Locked In"
      : status === "distracted"
      ? "Distracted"
      : "No Face";

  const scoreColor =
    score >= 80
      ? "text-emerald-400"
      : score >= 50
      ? "text-amber-400"
      : "text-red-400";

  if (!active) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {/* PIP Camera Window */}
      <div className="relative w-[200px] h-[150px] rounded-xl overflow-hidden border border-neutral-700 shadow-2xl shadow-black/60 bg-neutral-950">
        <video
          ref={videoRef}
          muted
          playsInline
          className="w-full h-full object-cover scale-x-[-1]"
        />
        <canvas
          ref={overlayRef}
          width={320}
          height={240}
          className="absolute inset-0 w-full h-full pointer-events-none scale-x-[-1]"
        />

        {/* Telemetry overlay */}
        <div className="absolute top-0 left-0 right-0 px-2.5 py-1.5 bg-gradient-to-b from-black/80 to-transparent flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${statusColor} ${status === "locked" ? "animate-pulse" : ""}`} />
            <span className="text-[9px] font-mono uppercase tracking-wider text-neutral-300">
              {statusLabel}
            </span>
          </div>
          <span className={`text-[11px] font-mono font-bold tabular-nums ${scoreColor}`}>
            {score}
          </span>
        </div>

        {/* Bottom score bar */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-neutral-800">
          <div
            className="h-full transition-all duration-300 ease-out"
            style={{
              width: `${score}%`,
              backgroundColor:
                score >= 80 ? "#00e5a0" : score >= 50 ? "#f5a623" : "#ff4444",
            }}
          />
        </div>

        {/* No camera fallback */}
        {!cameraReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-950">
            <span className="text-[10px] text-neutral-500 font-mono">
              Initializing camera…
            </span>
          </div>
        )}
      </div>

      {/* Label */}
      <span className="text-[9px] font-mono uppercase tracking-widest text-neutral-600 pr-1">
        Focus Monitor · Edge
      </span>
    </div>
  );
}
