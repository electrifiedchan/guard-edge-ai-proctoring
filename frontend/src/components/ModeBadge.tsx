"use client";

/**
 * "Which brain is running" chip, and the way back to /choose-model.
 *
 * The chooser tells people "You can switch any time from the dashboard", so
 * something here has to make that true. It doubles as the only honest answer to
 * "is my resume leaving this machine right now" — which is why it reads the
 * backend's *effective* mode rather than the remembered local choice. Those two
 * disagree in the case that matters most: the user picked Offline, Ollama later
 * died, and the backend fell back to the cloud. Showing the stored choice there
 * would be a privacy claim we cannot back.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Cloud, HardDrive } from "lucide-react";
import { fetchStatus, type LlmStatus } from "@/lib/llmMode";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950";

export default function ModeBadge({ className = "" }: { className?: string }) {
  const [status, setStatus] = useState<LlmStatus | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    fetchStatus(ac.signal).then(setStatus, () => {
      /* Backend down. Render the neutral "Model" label below rather than
         guessing a mode — claiming "Offline · sovereign" while we cannot
         reach the engine to check is the one failure mode worth avoiding. */
    });
    return () => ac.abort();
  }, []);

  const local = status?.effective === "ollama";
  const Icon = !status ? Cloud : local ? HardDrive : Cloud;

  return (
    <Link
      href="/choose-model?next=/dashboard"
      title={
        status
          ? `${local ? "Running locally" : "Running in the cloud"} · ${status.model} — click to switch`
          : "Choose which model writes your questions"
      }
      className={`inline-flex items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2.5 text-sm font-medium text-neutral-300 transition hover:border-neutral-700 hover:text-neutral-100 ${FOCUS_RING} ${className}`}
    >
      {/* Tints track the pills: local is the red pill, cloud is the blue one.
          Keep these two in step with MODES — a badge that colours local blue
          while the chooser paints it red makes the user doubt which one they
          actually picked, which is the one thing this chip exists to settle. */}
      <Icon
        size={14}
        strokeWidth={1.5}
        className={
          !status ? "text-neutral-500" : local ? "text-rose-400" : "text-sky-400"
        }
        aria-hidden="true"
      />
      {!status ? "Model" : local ? "Offline" : "Online"}
    </Link>
  );
}
