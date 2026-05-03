"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface RiskPacket {
  candidate_id: string;
  risk_score: number;
  violation_count: number;
  critical_flags?: string[];
  intervention_level: "CLEAR" | "SOFT_WARNING" | "HARD_WARNING" | "WARNING_LOGGED" | "SEVERE_VIOLATION_LOGGED";
}

interface SniperScopeProps {
  onTelemetryUpdate: (packet: RiskPacket, verdict: string) => void;
}

export default function SniperScope({ onTelemetryUpdate }: SniperScopeProps) {
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

  useEffect(() => {
    // Dynamically inject MediaPipe Face Mesh on mount to avoid Turbopack strictness
    if (typeof window !== "undefined" && !(window as any).FaceMesh) {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js";
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
  const checkHardware = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      
      for (const device of videoDevices) {
        const label = device.label.toLowerCase();
        if (label.includes('obs') || label.includes('virtual') || label.includes('snap')) {
          console.error("🚨 HARDWARE TRIPWIRE: Virtual Camera Detected:", device.label);
          // In production, this would trigger an instant FATAL lock.
          // setSysStatus("LOCKED"); 
        }
      }
    } catch (err) {
      console.error("Hardware scan failed", err);
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
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    });

    faceMesh.setOptions({
      maxNumFaces: 3,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    faceMesh.onResults((results) => {
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
      await checkHardware();
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

      runInferenceLoop();
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
        onTelemetryUpdate({
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
    setIsScanning(false);
    setSysStatus("IDLE");
  };

  // --- 4. THE SELF-HEALING ASYNC LOOP ---
  const runInferenceLoop = useCallback(async () => {
    // Only run if scanning AND FaceMesh actually picked up a face at any point
    if (!videoRef.current || !canvasRef.current || !isScanning) return;

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

          // Pass data up to VoiceOrb
          onTelemetryUpdate(data.risk_packet, data.verdict);


        }
      } catch (error) {
        console.log("Backend unreachable:", (error as Error).message);
        setLatestVerdict("⚠️ ERROR: BACKEND CONNECTION FAILED. CHECK IF EDGE_MAIN.PY IS RUNNING.");
      }
    }

    // Mathematical timing: exactly 5 seconds (12 FPM)
    loopTimerRef.current = setTimeout(runInferenceLoop, 5000);
  }, [isScanning, onTelemetryUpdate]);

  useEffect(() => {
    // Only spin up the loops if we are scanning and the FaceMesh is confirmed downloaded
    if (isScanning && isFaceMeshReady) {
      if (videoRef.current && !gatekeeperRef.current) {
        gatekeeperRef.current = initGatekeeper(videoRef.current) as any;
      }
      runInferenceLoop();
    }
    return () => {
      if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
    };
  }, [isScanning, isFaceMeshReady, runInferenceLoop]);


  return (
    <div className="w-full flex flex-col xl:flex-row gap-8 items-start relative">
      
      {/* Vercel/Linear Inspired Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={`absolute top-0 right-0 z-50 px-4 py-3 min-w-[250px] rounded-lg border font-mono text-xs font-bold tracking-widest backdrop-blur-xl shadow-2xl flex items-center justify-between
              ${toast.type === "error" 
                ? "bg-[#1a0505]/80 border-red-500/50 text-red-400" 
                : "bg-[#051a0a]/80 border-sentry-neon/50 text-sentry-neon"}`}
          >
            <span className="flex items-center gap-2">
              {toast.type === "error" ? (
                <span className="text-red-500 animate-pulse">⚠️</span>
              ) : (
                <span className="w-2 h-2 rounded-full bg-sentry-neon shadow-[0_0_8px_#00FF41]"></span>
              )}
              {toast.message}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* LEFT: THE OPTICS FEED */}
      <div className="relative w-full xl:w-[800px] h-[450px] bg-[#0A0A0B] rounded-xl border border-sentry-border overflow-hidden flex-shrink-0 shadow-2xl">
        
        {/* Hidden Canvas for Cropping */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Video Feed */}
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted 
          className="w-full h-full object-cover"
        />

        {/* Cyberpunk Scanlines */}
        <div className="absolute inset-0 pointer-events-none bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay" />
        <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] z-10" />

        {/* UI Overlay */}
        <div className="absolute top-4 left-4 z-20 flex gap-2">
          <span className={`px-3 py-1 text-[10px] tracking-widest font-bold border rounded bg-black/50 backdrop-blur-sm
            ${sysStatus === 'IDLE' ? 'border-gray-500 text-gray-500' : ''}
            ${sysStatus === 'ACTIVE' ? 'border-sentry-neon text-sentry-neon shadow-[0_0_10px_rgba(0,255,65,0.3)]' : ''}
          `}>
            {sysStatus}
          </span>
        </div>

        {/* The Targeting Crosshair */}
        {sysStatus === 'ACTIVE' && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-20">
            <motion.div 
              animate={{ rotate: 360 }} 
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className="w-[320px] h-[320px] border border-sentry-neon/30 rounded-full flex items-center justify-center relative"
            >
              <div className="absolute w-full h-[1px] bg-sentry-neon/20" />
              <div className="absolute h-full w-[1px] bg-sentry-neon/20" />
              <div className="w-[300px] h-[300px] border border-sentry-neon/10 rounded-full" />
            </motion.div>
          </div>
        )}


        {/* Controls */}
        <div className="absolute bottom-4 right-4 z-20 flex gap-4">
          {!isScanning && (
            <button onClick={startCamera} className="px-6 py-2 bg-sentry-neon text-black font-bold text-xs tracking-widest hover:bg-white transition-colors cursor-pointer">
              ENGAGE SENTRY
            </button>
          )}
          {isScanning && (
            <button onClick={stopCamera} className="px-6 py-2 border border-gray-500 text-gray-300 font-bold text-xs tracking-widest hover:bg-gray-800 transition-colors cursor-pointer bg-black/50 backdrop-blur-sm">
              DISENGAGE
            </button>
          )}
        </div>
      </div>

      {/* RIGHT: THE TELEMETRY STACK */}
      <div className="flex-1 w-full flex flex-col gap-4">
        
        {/* Memory Graph / Risk Score (With react-bits Spotlight logic placeholder) */}
        <div className="border border-sentry-border bg-[#0A0A0B] p-6 rounded-xl relative overflow-hidden group hover:border-sentry-border/80 transition-colors">
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          
          <div className="flex justify-between items-start mb-6">
            <h3 className="text-[10px] tracking-widest text-gray-500 flex items-center gap-2">
              <span className="w-1 h-1 bg-gray-500 rounded-full" />
              BEA TEMPORAL GRAPH
            </h3>
            <button 
              onClick={handleReset}
              className="text-[9px] font-bold tracking-widest text-red-500 border border-red-500/30 bg-red-500/10 px-3 py-1.5 rounded hover:bg-red-500 hover:text-black transition-all duration-300 z-30 relative"
            >
              [ CLEAR MEMORY ]
            </button>
          </div>
          
          <div className="flex flex-col mb-8">
            <span className="text-[10px] tracking-widest text-gray-600 mb-2">CUMULATIVE RISK</span>
            {/* THE GLITCH TEXT INTEGRATION */}
            <h2 
              data-text={riskScore === 100 ? "100%" : `${riskScore}%`}
              className={`text-6xl font-black transition-colors duration-500 ${
                riskScore === 100 
                  ? "text-red-500 glitch-text drop-shadow-[0_0_15px_rgba(239,68,68,0.8)]" 
                  : riskScore >= 40 
                  ? "text-orange-400 drop-shadow-[0_0_10px_rgba(251,146,60,0.5)]" 
                  : riskScore >= 20
                  ? "text-yellow-400"
                  : "text-white"
              }`}
            >
              {riskScore}%
            </h2>
          </div>

          <div className={`p-4 rounded border flex justify-between items-center mb-6 transition-colors duration-500
            ${interventionLevel === 'SEVERE_VIOLATION_LOGGED' ? 'border-red-500/30 bg-red-500/10 text-red-500' : 
              interventionLevel === 'HARD_WARNING' ? 'border-orange-500/30 bg-orange-500/10 text-orange-400' :
              interventionLevel === 'WARNING_LOGGED' ? 'border-orange-500/30 bg-orange-500/10 text-orange-400' : 
              interventionLevel === 'SOFT_WARNING' ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400' : 
              'border-sentry-border bg-white/5 text-gray-400'}`}
          >
            <div className="flex flex-col">
               <span className="text-[9px] tracking-widest opacity-70 mb-1">INTERVENTION TIER</span>
               <span className="text-sm font-bold tracking-widest">{interventionLevel}</span>
            </div>
            {interventionLevel !== 'CLEAR' && <span className="animate-pulse">⚠️</span>}
          </div>

          <div className="grid grid-cols-2 gap-4 border-t border-sentry-border pt-4">
            <div className="flex flex-col">
               <span className="text-[9px] tracking-widest text-gray-600 mb-1">VIOLATIONS</span>
               <span className="text-lg font-bold">{violationCount}</span>
            </div>
            <div className="flex flex-col">
               <span className="text-[9px] tracking-widest text-gray-600 mb-1">WINDOW</span>
               <span className="text-lg font-bold text-gray-400">5m</span>
            </div>
          </div>
        </div>

        {/* Live VLM Inference Log */}
        <div className="border border-sentry-border bg-[#0A0A0B] p-6 rounded-xl flex flex-col min-h-[120px]">
           <h3 className="text-[10px] tracking-widest text-gray-500 mb-4 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-sm ${sysStatus === 'ACTIVE' ? 'bg-sentry-neon animate-pulse' : 'bg-gray-700'}`} />
            VLM INFERENCE LOG
          </h3>
          <p className={`text-xs font-mono leading-relaxed ${latestVerdict.includes('CRITICAL') || latestVerdict.includes('FATAL') ? 'text-red-400' : 'text-gray-400'}`}>
            &gt; {latestVerdict}
          </p>
        </div>

      </div>
    </div>
  );
}