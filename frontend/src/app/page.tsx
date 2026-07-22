"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Upload, FileText, ChevronRight, Shield } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

const LOADING_MESSAGES = [
  "Parsing resume sections…",
  "Identifying key accomplishments…",
  "Mapping to STAR competencies…",
  "Generating behavioral questions…",
];

async function hashFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getCachedResult(hash: string) {
  try {
    const cached = localStorage.getItem(`guard_resume_cache_${hash}`);
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    // Expire after 24h
    if (Date.now() - parsed.timestamp > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(`guard_resume_cache_${hash}`);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

function setCachedResult(hash: string, data: { questions: string[]; resume_text: string }) {
  try {
    localStorage.setItem(
      `guard_resume_cache_${hash}`,
      JSON.stringify({ data, timestamp: Date.now() })
    );
  } catch {
    // localStorage full — ignore
  }
}

export default function UploadPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "loading">("idle");
  const [fileName, setFileName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const [loadingStep, setLoadingStep] = useState(0);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are accepted.");
      return;
    }

    setError("");
    setFileName(file.name);
    setPhase("loading");
    setLoadingStep(0);

    const stepInterval = setInterval(() => {
      setLoadingStep((prev) =>
        prev < LOADING_MESSAGES.length - 1 ? prev + 1 : prev
      );
    }, 1800);

    try {
      // Check cache first
      const fileHash = await hashFile(file);
      const cached = getCachedResult(fileHash);

      if (cached) {
        clearInterval(stepInterval);
        sessionStorage.setItem(
          "guard_session",
          JSON.stringify({
            questions: cached.questions,
            resume_text: cached.resume_text,
            file_name: file.name,
          })
        );
        router.push("/sentry");
        return;
      }

      // No cache hit — call backend
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${API_BASE}/api/v1/interview/upload-resume`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.detail || `Server responded with ${res.status}`);
      }

      const data = await res.json();
      clearInterval(stepInterval);

      // Cache the result
      setCachedResult(fileHash, {
        questions: data.questions || [],
        resume_text: data.resume_text || "",
      });

      sessionStorage.setItem(
        "guard_session",
        JSON.stringify({
          questions: data.questions || [],
          resume_text: data.resume_text || "",
          file_name: file.name,
        })
      );

      router.push("/sentry");
    } catch (err: unknown) {
      clearInterval(stepInterval);
      const message = err instanceof Error ? err.message : "Upload failed";
      setError(message);
      setPhase("idle");
    }
  }, [router]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <main className="min-h-screen bg-[var(--color-canvas)] text-[var(--color-parchment)] flex flex-col items-center justify-center px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-[520px] flex flex-col items-center"
      >
        {/* Brand */}
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 rounded-lg lift-2 flex items-center justify-center">
            <Shield size={20} className="text-[var(--color-signal)]" />
          </div>
          <div className="flex flex-col">
            <h1 className="font-display text-[22px] font-semibold tracking-tight text-[var(--color-snow)] leading-none">
              G.U.A.R.D.
            </h1>
            <span className="eyebrow mt-1">Edge-AI Interview Mirror</span>
          </div>
        </div>

        {phase === "idle" && (
          <motion.div
            key="upload"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full"
          >
            <label
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`w-full flex flex-col items-center justify-center gap-4 p-10 rounded-xl border-2 border-dashed cursor-pointer transition-all duration-200 ${
                dragOver
                  ? "border-[var(--color-signal)] bg-[var(--color-signal)]/[0.04]"
                  : "border-[var(--color-hairline)] hover:border-[var(--color-signal)]/50 bg-[var(--color-surface)]"
              }`}
            >
              <input
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={handleSelect}
              />
              <div className="w-14 h-14 rounded-xl bg-[var(--color-signal-soft)] flex items-center justify-center">
                <Upload size={24} className="text-[var(--color-signal)]" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-[var(--color-snow)]">
                  Drop your resume here
                </p>
                <p className="text-[12px] text-[var(--color-slate)] mt-1">
                  PDF only · Processed locally on edge
                </p>
              </div>
            </label>

            {error && (
              <p className="mt-4 text-sm text-[var(--color-danger)] text-center">{error}</p>
            )}

            <p className="mt-8 text-[12px] text-[var(--color-slate)] text-center leading-relaxed max-w-[400px] mx-auto">
              Upload your resume and the AI will generate tailored STAR behavioral
              questions. You&apos;ll practice answering while the mirror captures your
              focus and body language — all processed locally on your device.
            </p>
          </motion.div>
        )}

        {phase === "loading" && (
          <motion.div
            key="loading"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full flex flex-col items-center gap-6"
          >
            <div className="flex items-center gap-3">
              <FileText size={18} className="text-[var(--color-signal)]" />
              <span className="text-sm font-medium text-[var(--color-snow)]">{fileName}</span>
            </div>

            <div className="w-full max-w-[360px] flex flex-col gap-3">
              {LOADING_MESSAGES.map((msg, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2.5 text-[12px] font-mono transition-all duration-300 ${
                    i <= loadingStep ? "text-[var(--color-signal)]" : "text-[var(--color-slate)]/40"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    i < loadingStep
                      ? "bg-[var(--color-signal)]"
                      : i === loadingStep
                      ? "bg-[var(--color-signal)] pulse-signal"
                      : "bg-[var(--color-fog)]"
                  }`} />
                  {msg}
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 mt-4">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-signal)] pulse-signal" />
              <span className="text-[11px] text-[var(--color-slate)] uppercase tracking-wider">
                Processing on edge
              </span>
            </div>
          </motion.div>
        )}

        {/* Footer badge */}
        <div className="mt-12 flex items-center gap-2 px-3 py-1.5 rounded-md border border-[var(--color-hairline)] bg-[var(--color-surface)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-signal)] pulse-signal" />
          <span className="text-[10px] font-medium text-[var(--color-slate)] uppercase tracking-wider">
            Local · Edge Processing · No data leaves your device
          </span>
        </div>
      </motion.div>
    </main>
  );
}
