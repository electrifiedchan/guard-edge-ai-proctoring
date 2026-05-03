"use client";

import { useEffect, useRef, useState, useCallback, useImperativeHandle, type Ref } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface RiskPacket {
  candidate_id: string;
  risk_score: number;
  violation_count: number;
  critical_flags?: string[];
  intervention_level: "CLEAR" | "SOFT_WARNING" | "HARD_WARNING" | "WARNING_LOGGED" | "SEVERE_VIOLATION_LOGGED";
}

// Imperative surface exposed to parent for session-level control (auto-disengage on end).
export interface SniperScopeHandle {
  stopCamera: () => void;
}

interface SniperScopeProps {
  onTelemetryUpdate: (packet: RiskPacket, verdict: string) => void;
  ref?: Ref<SniperScopeHandle>;
}

export default function SniperScope({ onTelemetryUpdate, ref }: SniperScopeProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loopTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [isScanning, setIsScanning] = useState(false);
  const [sysStatus, setSysStatus] = useState<"IDLE" | "ACTIVE" | "COMPROMISED">("IDLE");
  
  // Telemetry State
  const [riskScore, setRiskScore] = useState(0);
  const [violationCount, setViolationCount] = useState(0);
  const [interventionLevel, setInterventionLevel] = useState("CLEAR");
  const [latestVerdict, setLatestVerdict] = useState("SYSTEM STANDBY");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const CANDIDATE_ID = "major_project_candidate_01";

  const [isFaceMeshReady, setIsFaceMeshReady] = useState(false);

  // --- MEDIAPIPE GATEKEEPER STATE ---
  const telemetryRef = useRef({
    faces_detected: 0, // Better default so we don't spam multiple face alerts before real data
    is_talking: false,
    head_pose: "center"
  });
  const gatekeeperRef = useRef<{ camera: any; faceMesh: any } | null>(null);

  // Stable reference to parent callback — prevents the inference loop from being
  // re-created on every parent render, which previously spawned parallel loop chains
  // and produced ~10x the intended request rate (DB rows showed 500 ms cadence vs 5 s spec).
  const onTelemetryUpdateRef = useRef(onTelemetryUpdate);
  useEffect(() => {
    onTelemetryUpdateRef.current = onTelemetryUpdate;
  }, [onTelemetryUpdate]);

  // Single-flight guard so duplicate scheduling sources can't start a second chain.
  const loopRunningRef = useRef(false);

  useEffect(() => {
    // Inject MediaPipe Face Mesh from /public/mediapipe (locally bundled, no CDN dependency).
    // Assets are copied from node_modules by scripts/copy-mediapipe.mjs at predev/prebuild.
    if (typeof window !== "undefined" && !(window as any).FaceMesh) {
      const script = document.createElement("script");
      script.src = "/mediapipe/face_mesh.js";
      script.async = true;
      script.onload = () => {
        setIsFaceMeshReady(true);
      };
      document.body.appendChild(script);
    } else {
      setIsFaceMeshReady(true);
    }
  }, []);

  // --- 1. HARDWARE TRIPWIRE: Virtual Camera Detection ---
  // Returns true if a virtual camera was detected (caller should abort startup).
  const checkHardware = async (): Promise<{ compromised: boolean; label?: string }> => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');

      const blocklist = ['obs', 'virtual', 'snap', 'manycam', 'xsplit', 'droidcam', 'iriun', 'epoccam'];
      for (const device of videoDevices) {
        const label = device.label.toLowerCase();
        if (blocklist.some(token => label.includes(token))) {
          console.error("🚨 HARDWARE TRIPWIRE: Virtual Camera Detected:", device.label);
          return { compromised: true, label: device.label };
        }
      }
      return { compromised: false };
    } catch (err) {
      console.error("Hardware scan failed", err);
      return { compromised: false };
    }
  };

  // --- 2. MEDIAPIPE FACE MESH (30fps CPU Gatekeeper) ---
  const initGatekeeper = (videoEl: HTMLVideoElement) => {
    // @ts-ignore
    const FaceMesh = window.FaceMesh || (window as any).FaceMesh;
    if (!FaceMesh) {
      console.warn("FaceMesh not yet loaded. Trying again in 1s.");
      setTimeout(() => {
        if (!gatekeeperRef.current && videoRef.current) {
          gatekeeperRef.current = initGatekeeper(videoRef.current) as any;
        }
      }, 1000);
      return null;
    }

    const faceMesh = new FaceMesh({
      locateFile: (file: string) => `/mediapipe/${file}`,
    });

    faceMesh.setOptions({
      maxNumFaces: 3,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    faceMesh.onResults((results: any) => {
      let faces = 0;
      let talking = false;
      let pose = "center";

      if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        faces = results.multiFaceLandmarks.length;
        
        if (faces > 1) {
          console.warn("🚨 CPU GATEKEEPER: Multiple Faces Detected.");
        }

        const primary = results.multiFaceLandmarks[0];
        
        // 1. Mouth Aspect Ratio (MAR)
        const upperLip = primary[13];
        const lowerLip = primary[14];
        if (Math.abs(upperLip.y - lowerLip.y) > 0.015) {
          talking = true;
        }

        // 2. Head Pose (Yaw/Pitch) using Empirical 2D Morphological Ratios
        const nose = primary[1];
        
        // PITCH (Up/Down) via Forehead vs. Chin proportion
        const forehead = primary[10];
        const chin = primary[152];
        
        const foreheadToNose = nose.y - forehead.y;
        const noseToChin = chin.y - nose.y;
        const pitchRatio = foreheadToNose / noseToChin;

        // YAW (Left/Right) via normalized Eye bounds
        const leftEye = primary[33];
        const rightEye = primary[263];
        const dx = rightEye.x - leftEye.x;
        let noseX = 0.5;
        if (dx !== 0) {
          // How far is the nose from the left eye?
          noseX = (nose.x - leftEye.x) / dx;
        }

        // Determine State
        if (pitchRatio > 1.4) pose = "down";       // Chin compresses, forehead elongates
        else if (pitchRatio < 0.7) pose = "up";    // Forehead compresses, chin elongates
        else if (noseX < 0.40) pose = "right";     // Nose shifts heavily left on-screen
        else if (noseX > 0.60) pose = "left";      // Nose shifts heavily right on-screen
      }

      telemetryRef.current = {
        faces_detected: faces,
        is_talking: talking,
        head_pose: pose
      };
    });

  let isRunning = true;
  let lastVideoTime = -1;

  const onFrame = async () => {
    if (!isRunning || !videoEl) return;
    if (videoEl.readyState >= 3 && videoEl.currentTime !== lastVideoTime) { // readyState 3 is 'HAVE_FUTURE_DATA'
      lastVideoTime = videoEl.currentTime;
      await faceMesh.send({ image: videoEl });
    }
    requestAnimationFrame(onFrame);
  };
  
  videoEl.addEventListener('play', () => {
    requestAnimationFrame(onFrame);
  });

  return { 
    faceMesh,
    stop: () => { isRunning = false; }
  };
};

  // --- 3. OPTICS INITIALIZATION ---
  const startCamera = async () => {
    try {
      // Hardware tripwire: abort if virtual camera is found before any feed opens
      const hw = await checkHardware();
      if (hw.compromised) {
        setSysStatus("COMPROMISED");
        setLatestVerdict(`🚨 HARDWARE TRIPWIRE: Virtual camera detected (${hw.label}). Session blocked.`);
        showToast(`BLOCKED: ${hw.label?.toUpperCase()} DETECTED`, "error");
        // Notify parent — this is a session-fatal event
        onTelemetryUpdateRef.current({
          candidate_id: CANDIDATE_ID,
          risk_score: 100,
          violation_count: 0,
          critical_flags: [`Virtual camera: ${hw.label}`],
          intervention_level: "SEVERE_VIOLATION_LOGGED"
        }, "Session blocked: virtual camera detected.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: "user" }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsScanning(true);
      setSysStatus("ACTIVE");
      setLatestVerdict("OPTICS ONLINE. ANALYZING BEHAVIOR...");

      if (videoRef.current && !gatekeeperRef.current && isFaceMeshReady) {
         // Start the 30fps Gatekeeper
         gatekeeperRef.current = initGatekeeper(videoRef.current) as any;
      }
      // The post-mount useEffect picks up isScanning=true and starts the inference
      // loop. Calling it here too would double-start parallel chains.
    } catch (err) {
      console.error("Camera access denied.", err);
      setSysStatus("COMPROMISED");
      setLatestVerdict("ERROR: OPTICS UNAVAILABLE. CHECK PERMISSIONS.");
    }
  };

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleReset = async () => {
    if (riskScore === 0 && violationCount === 0 && interventionLevel === "CLEAR") {
      showToast("NO DATA TO CLEAR!", "error");
      return;
    }

    try {
      const response = await fetch("http://localhost:8080/reset-session?candidate_id=" + CANDIDATE_ID, {
        method: "POST"
      });
      if (response.ok) {
        setRiskScore(0);
        setViolationCount(0);
        setInterventionLevel("CLEAR");
        setLatestVerdict("SYSTEM STANDBY");
        showToast("MEMORY CLEARED SUCCESSFULLY.", "success");
        console.log("Memory reset successfully.");
        // Ensure parent component un-flags warning too
        onTelemetryUpdateRef.current({
          candidate_id: CANDIDATE_ID,
          risk_score: 0,
          violation_count: 0,
          intervention_level: "CLEAR"
        }, "SYSTEM STANDBY");
      }
    } catch (err) {
      console.error("Failed to reset session:", err);
    }
  };

  const stopCamera = () => {
    if (gatekeeperRef.current) {
      // @ts-ignore
      gatekeeperRef.current.stop();
      if (gatekeeperRef.current.faceMesh) {
        gatekeeperRef.current.faceMesh.close();
      }
      gatekeeperRef.current = null;
    }
    
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
    }
    if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
    loopRunningRef.current = false;
    setIsScanning(false);
    setSysStatus("IDLE");
  };

  // Expose stopCamera so the parent can auto-disengage on "End session".
  useImperativeHandle(ref, () => ({ stopCamera }), []);

  // --- 4. THE SELF-HEALING ASYNC LOOP ---
  // useCallback with no deps + refs for changing values keeps this function reference
  // stable for the component's lifetime. This is critical: if the reference changed
  // on parent re-renders, the scheduling useEffect would re-fire and spawn parallel
  // chains, causing the 500ms-cadence pile-up we observed in the DB.
  const runInferenceLoop = useCallback(async () => {
    if (!loopRunningRef.current) return; // chain was cancelled (disengage / unmount)
    if (!videoRef.current || !canvasRef.current) {
      loopTimerRef.current = setTimeout(runInferenceLoop, 5000);
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    // readyState >= 3 means we have data for the current and future frames
    if (ctx && video.readyState >= 3) {
      // Scale down the whole image to save bandwidth without losing context
      const targetWidth = 640;
      const targetHeight = 360;

      canvas.width = targetWidth;
      canvas.height = targetHeight;
      ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, 0, 0, targetWidth, targetHeight);

      const base64Image = canvas.toDataURL("image/jpeg", 0.8).split(",")[1];

      console.log("🚀 [FRONTEND] OUTGOING PAYLOAD:", {
        faces_detected: telemetryRef.current.faces_detected,
        is_talking: telemetryRef.current.is_talking,
        head_pose: telemetryRef.current.head_pose
      });

      try {
        const response = await fetch("http://localhost:8080/api/v1/analyze-frame", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            candidate_id: CANDIDATE_ID,
            timestamp: Date.now(),
            image_base64: base64Image,
            faces_detected: telemetryRef.current.faces_detected,
            is_talking: telemetryRef.current.is_talking,
            head_pose: telemetryRef.current.head_pose
          })
        });

        const data = await response.json();

        if (data.risk_packet) {
          setRiskScore(data.risk_packet.risk_score);
          setViolationCount(data.risk_packet.violation_count);
          setInterventionLevel(data.risk_packet.intervention_level);
          setLatestVerdict(data.verdict);

          // Pass data up via stable ref — never re-binds the loop.
          onTelemetryUpdateRef.current(data.risk_packet, data.verdict);
        }
      } catch (error) {
        console.log("Backend unreachable:", (error as Error).message);
        setLatestVerdict("⚠️ ERROR: BACKEND CONNECTION FAILED. CHECK IF EDGE_MAIN.PY IS RUNNING.");
      }
    }

    // Schedule next tick only if the chain is still alive.
    if (loopRunningRef.current) {
      loopTimerRef.current = setTimeout(runInferenceLoop, 5000);
    }
  }, []);

  useEffect(() => {
    // Single-flight: only one chain can ever be active at a time.
    if (isScanning && isFaceMeshReady && !loopRunningRef.current) {
      if (videoRef.current && !gatekeeperRef.current) {
        gatekeeperRef.current = initGatekeeper(videoRef.current) as any;
      }
      loopRunningRef.current = true;
      runInferenceLoop();
    }
    return () => {
      // Cancel chain on unmount or when isScanning flips false.
      loopRunningRef.current = false;
      if (loopTimerRef.current) {
        clearTimeout(loopTimerRef.current);
        loopTimerRef.current = null;
      }
    };
  }, [isScanning, isFaceMeshReady, runInferenceLoop]);


  // ── Severity-colour helpers (single source of truth for the panel) ──────
  const tierToken =
    interventionLevel === "SEVERE_VIOLATION_LOGGED" ? "danger" :
    interventionLevel === "HARD_WARNING"            ? "amber"  :
    interventionLevel === "WARNING_LOGGED"          ? "amber"  :
    interventionLevel === "SOFT_WARNING"            ? "warn"   :
    "clear";

  const tierStyles: Record<string, string> = {
    clear:  "border-[var(--color-hairline)] bg-[var(--color-surface-2)] text-[var(--color-slate)]",
    warn:   "border-[var(--color-warn)]/40 bg-[var(--color-warn)]/[0.06] text-[var(--color-warn)]",
    amber:  "border-[var(--color-amber)]/40 bg-[var(--color-amber)]/[0.06] text-[var(--color-amber)]",
    danger: "border-[var(--color-danger)]/45 bg-[var(--color-danger)]/[0.07] text-[var(--color-danger)]",
  };

  const riskColor =
    riskScore >= 80 ? "text-[var(--color-danger)]" :
    riskScore >= 40 ? "text-[var(--color-amber)]"  :
    riskScore >= 20 ? "text-[var(--color-warn)]"   :
    "text-[var(--color-snow)]";

  return (
    <div className="w-full flex flex-col xl:flex-row gap-6 items-start relative">

      {/* Toast — minimal, hairline-bordered, no neon glow spam */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            role="status"
            className={`absolute top-0 right-0 z-50 flex items-center gap-2.5 px-3.5 py-2.5 min-w-[260px] rounded-lg border text-[12px] font-medium backdrop-blur-md ${
              toast.type === "error"
                ? "bg-[var(--color-surface)]/90 border-[var(--color-danger)]/40 text-[var(--color-danger)]"
                : "bg-[var(--color-surface)]/90 border-[var(--color-signal)]/40 text-[var(--color-signal)]"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                toast.type === "error" ? "bg-[var(--color-danger)]" : "bg-[var(--color-signal)]"
              }`}
            />
            <span className="tracking-tight">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* LEFT — Camera frame */}
      <div
        className={`relative w-full xl:w-[800px] h-[450px] rounded-xl overflow-hidden flex-shrink-0 lift-1 haze transition-shadow ${
          sysStatus === "ACTIVE" ? "ring-signal" : ""
        }`}
      >
        <canvas ref={canvasRef} className="hidden" />

        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />

        {/* Idle-state placeholder grid (only when no stream) */}
        {!isScanning && (
          <div className="absolute inset-0 dot-grid flex items-center justify-center text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 rounded-lg lift-2 flex items-center justify-center">
                <span className="w-2 h-2 rounded-full bg-[var(--color-fog)]" />
              </div>
              <span className="eyebrow">Optics offline</span>
              <span className="text-[12px] text-[var(--color-slate)] max-w-[280px] leading-relaxed">
                Engage the sentry to begin local-only behavioural analysis.
              </span>
            </div>
          </div>
        )}

        {/* Status chip — top-left */}
        <div className="absolute top-3 left-3 z-20 flex items-center gap-2">
          <span
            className={`flex items-center gap-2 px-2.5 py-1 rounded-md text-[10px] font-medium tracking-[0.14em] uppercase backdrop-blur-md border ${
              sysStatus === "ACTIVE"
                ? "bg-[var(--color-signal)]/10 border-[var(--color-signal)]/40 text-[var(--color-signal)]"
                : sysStatus === "COMPROMISED"
                ? "bg-[var(--color-danger)]/10 border-[var(--color-danger)]/40 text-[var(--color-danger)]"
                : "bg-[var(--color-surface)]/70 border-[var(--color-hairline)] text-[var(--color-slate)]"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                sysStatus === "ACTIVE"
                  ? "bg-[var(--color-signal)] pulse-signal"
                  : sysStatus === "COMPROMISED"
                  ? "bg-[var(--color-danger)] pulse-danger"
                  : "bg-[var(--color-fog)]"
              }`}
            />
            {sysStatus === "ACTIVE" ? "Live" : sysStatus === "COMPROMISED" ? "Blocked" : "Idle"}
          </span>

          {sysStatus === "ACTIVE" && (
            <span className="px-2.5 py-1 rounded-md text-[10px] font-medium tracking-[0.14em] uppercase backdrop-blur-md border bg-[var(--color-surface)]/70 border-[var(--color-hairline)] text-[var(--color-slate)]">
              5s sample
            </span>
          )}
        </div>

        {/* Controls — bottom-right */}
        <div className="absolute bottom-3 right-3 z-20 flex gap-2">
          {!isScanning ? (
            <button
              onClick={startCamera}
              className="px-4 h-9 rounded-md bg-[var(--color-iris)] text-white text-[12px] font-medium tracking-tight hover:bg-[var(--color-iris-hover)] active:bg-[var(--color-iris-press)] transition-colors cursor-pointer"
            >
              Engage sentry
            </button>
          ) : (
            <button
              onClick={stopCamera}
              className="px-4 h-9 rounded-md bg-[var(--color-surface-2)]/80 backdrop-blur-md border border-[var(--color-hairline-strong)] text-[var(--color-parchment)] text-[12px] font-medium tracking-tight hover:bg-[var(--color-surface-3)] hover:text-[var(--color-snow)] transition-colors cursor-pointer"
            >
              Disengage
            </button>
          )}
        </div>
      </div>

      {/* RIGHT — Telemetry stack */}
      <div className="flex-1 w-full flex flex-col gap-4">

        {/* BEA Temporal panel */}
        <div className="lift-1 rounded-xl p-5">
          <div className="flex justify-between items-center mb-5">
            <span className="eyebrow flex items-center gap-2">
              <span className="w-1 h-1 rounded-full bg-[var(--color-fog)]" />
              BEA · Temporal
            </span>
            <button
              onClick={handleReset}
              className="h-7 px-2.5 rounded-md text-[11px] font-medium text-[var(--color-slate)] border border-[var(--color-hairline)] bg-transparent hover:text-[var(--color-snow)] hover:border-[var(--color-hairline-strong)] hover:bg-[var(--color-surface-2)] transition-colors"
            >
              Clear memory
            </button>
          </div>

          <div className="flex flex-col mb-6">
            <span className="eyebrow mb-2">Cumulative risk</span>
            <h2
              data-text={`${riskScore}%`}
              data-active={riskScore === 100 ? "true" : "false"}
              className={`font-display text-[64px] leading-none tabular font-semibold transition-colors duration-500 ${riskColor} ${
                riskScore === 100 ? "glitch-text" : ""
              }`}
            >
              {riskScore}
              <span className="text-[var(--color-slate)] text-[40px] font-medium">%</span>
            </h2>
          </div>

          {/* Intervention tier */}
          <div className={`px-3.5 py-3 rounded-lg border flex justify-between items-center mb-5 transition-colors duration-500 ${tierStyles[tierToken]}`}>
            <div className="flex flex-col gap-0.5">
              <span className="eyebrow opacity-80">Intervention tier</span>
              <span className="text-[13px] font-medium tracking-tight">{interventionLevel}</span>
            </div>
            {interventionLevel !== "CLEAR" && (
              <span className={`w-1.5 h-1.5 rounded-full bg-current ${
                tierToken === "danger" ? "pulse-danger" : ""
              }`} />
            )}
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 gap-3 pt-4 border-t border-[var(--color-hairline)]">
            <div className="flex flex-col gap-1">
              <span className="eyebrow">Violations</span>
              <span className="text-[18px] font-semibold tabular text-[var(--color-snow)]">{violationCount}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="eyebrow">Window</span>
              <span className="text-[18px] font-semibold tabular text-[var(--color-parchment)]">5m</span>
            </div>
          </div>
        </div>

        {/* VLM inference log */}
        <div className="lift-1 rounded-xl p-5 flex flex-col min-h-[120px]">
          <span className="eyebrow mb-3 flex items-center gap-2">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                sysStatus === "ACTIVE" ? "bg-[var(--color-signal)] pulse-signal" : "bg-[var(--color-fog)]"
              }`}
            />
            VLM inference log
          </span>
          <p
            className={`font-mono text-[12px] leading-relaxed ${
              latestVerdict.includes("CRITICAL") || latestVerdict.includes("FATAL")
                ? "text-[var(--color-danger)]"
                : "text-[var(--color-parchment)]"
            }`}
          >
            <span className="text-[var(--color-fog)] mr-2">&gt;</span>
            {latestVerdict}
          </p>
        </div>

      </div>
    </div>
  );
}