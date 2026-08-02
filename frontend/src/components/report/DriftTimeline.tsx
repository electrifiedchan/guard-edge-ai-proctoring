"use client";

/**
 * DriftTimeline — "when did I lose the room?"
 *
 * The report page used to show a single averaged focus score, which tells you
 * that you drifted but not when, for how long, or in which direction. The
 * per-frame data was already being written to timeline_frames for every run;
 * nothing was reading it back. This component does.
 *
 * Three layers over one shared time axis:
 *   1. a composure area chart across the session
 *   2. tinted bands marking each sustained drift episode
 *   3. flagged moments (phone, extra face) as markers, with evidence thumbnails
 */

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowDown, ArrowLeftRight, Camera, TriangleAlert } from "lucide-react";

export type TimelineFrame = {
  t: number;
  composure: number | null;
  gaze: string | null;
  head_pose: string | null;
  faces_detected: number | null;
  is_talking: number | boolean | null;
};

export type TimelineMoment = {
  t: number;
  type: string | null;
  caption: string | null;
  evidence_url: string | null;
};

/** A run of consecutive frames in the same non-straight gaze state. */
type Episode = {
  kind: "DOWN" | "SIDE_OR_UP";
  startSec: number;
  endSec: number;
  durationSec: number;
  minComposure: number;
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

/** Frames land ~every 5s, so a single-frame blip is treated as one interval. */
const FRAME_CADENCE_SEC = 5;

/**
 * Floor for showing an episode. Currently equal to the cadence, so every
 * detected drift is listed — at a 5s sample rate a single DOWN frame already
 * means the eyeline was gone for about that long, which is worth naming.
 * Raise this if the list starts feeling nitpicky in real sessions.
 */
const MIN_EPISODE_SEC = FRAME_CADENCE_SEC;

const CHART_W = 640;
const CHART_H = 120;

function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function fmtDuration(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return s ? `${m}m ${s}s` : `${m}m`;
}

/**
 * Collapse the frame stream into drift episodes.
 *
 * Grouping matters: 12 consecutive DOWN frames is one 60-second lapse to talk
 * about, not 12 separate incidents. A per-frame list would read as noise and
 * badly overstate how often the candidate actually drifted.
 */
function buildEpisodes(frames: TimelineFrame[], t0: number): Episode[] {
  const episodes: Episode[] = [];
  let open: Episode | null = null;

  for (const f of frames) {
    const gaze = f.gaze === "DOWN" || f.gaze === "SIDE_OR_UP" ? f.gaze : null;
    const at = f.t - t0;
    const comp = f.composure ?? 100;

    if (gaze && open && open.kind === gaze) {
      open.endSec = at + FRAME_CADENCE_SEC;
      open.durationSec = open.endSec - open.startSec;
      open.minComposure = Math.min(open.minComposure, comp);
      continue;
    }

    if (open) {
      episodes.push(open);
      open = null;
    }

    if (gaze) {
      open = {
        kind: gaze,
        startSec: at,
        endSec: at + FRAME_CADENCE_SEC,
        durationSec: FRAME_CADENCE_SEC,
        minComposure: comp,
      };
    }
  }
  if (open) episodes.push(open);

  return episodes.filter((e) => e.durationSec >= MIN_EPISODE_SEC);
}

export default function DriftTimeline({
  frames,
  moments,
}: {
  frames: TimelineFrame[];
  moments: TimelineMoment[];
}) {
  const [activeShot, setActiveShot] = useState<string | null>(null);

  const model = useMemo(() => {
    if (frames.length === 0) return null;

    const t0 = frames[0].t;
    const span = Math.max(frames[frames.length - 1].t - t0, FRAME_CADENCE_SEC);

    const points = frames.map((f) => ({
      x: ((f.t - t0) / span) * CHART_W,
      y: CHART_H - ((f.composure ?? 100) / 100) * CHART_H,
      sec: f.t - t0,
      composure: Math.round(f.composure ?? 100),
    }));

    const line = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const area = `0,${CHART_H} ${line} ${CHART_W},${CHART_H}`;

    const episodes = buildEpisodes(frames, t0);

    const flagged = moments
      .map((m) => ({ ...m, sec: m.t - t0 }))
      .filter((m) => m.sec >= -1 && m.sec <= span + FRAME_CADENCE_SEC);

    const straight = frames.filter((f) => f.gaze === "STRAIGHT").length;
    const eyeContactPct = Math.round((straight / frames.length) * 100);
    const driftSec = episodes.reduce((sum, e) => sum + e.durationSec, 0);

    return { t0, span, line, area, points, episodes, flagged, eyeContactPct, driftSec };
  }, [frames, moments]);

  if (!model) {
    return (
      <div className="lift-1 rounded-lg p-6">
        <span className="eyebrow mb-3 block">Attention Timeline</span>
        <p className="text-[13px] text-[var(--color-slate)] leading-relaxed">
          No frame telemetry was captured for this session. The timeline appears
          once the sentry runs with the camera engaged.
        </p>
      </div>
    );
  }

  const { span, line, area, episodes, flagged, eyeContactPct, driftSec } = model;
  const toPct = (sec: number) => `${Math.min(Math.max((sec / span) * 100, 0), 100)}%`;

  return (
    <div className="lift-1 rounded-lg p-6 flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="eyebrow">Attention Timeline</span>
          <p className="mt-1 text-[12px] text-[var(--color-slate)]">
            Composure across {fmtDuration(span)} · {frames.length} samples
          </p>
        </div>
        <div className="flex gap-5 text-right">
          <div className="flex flex-col">
            <span className="eyebrow">On camera</span>
            <span className="text-[18px] font-semibold tabular text-[var(--color-snow)]">
              {eyeContactPct}%
            </span>
          </div>
          <div className="flex flex-col">
            <span className="eyebrow">Drifted</span>
            <span className="text-[18px] font-semibold tabular text-[var(--color-parchment)]">
              {fmtDuration(driftSec)}
            </span>
          </div>
        </div>
      </div>

      {/* Chart + overlay bands share one relative box so both use the same axis */}
      <div className="relative w-full" style={{ aspectRatio: `${CHART_W} / ${CHART_H}` }}>
        {/* Drift bands sit behind the curve */}
        <div className="absolute inset-0">
          {episodes.map((e, i) => (
            <motion.div
              key={`${e.kind}-${i}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25 + i * 0.04, duration: 0.3 }}
              className={`absolute top-0 bottom-0 ${
                e.kind === "DOWN"
                  ? "bg-[var(--color-warn)]/[0.10] border-x border-[var(--color-warn)]/25"
                  : "bg-[var(--color-amber)]/[0.10] border-x border-[var(--color-amber)]/25"
              }`}
              style={{
                left: toPct(e.startSec),
                width: toPct(Math.min(e.endSec, span) - e.startSec),
              }}
              title={`${e.kind === "DOWN" ? "Looked down" : "Looked away"} · ${fmtDuration(e.durationSec)}`}
            />
          ))}
        </div>

        <svg
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full overflow-visible"
          role="img"
          aria-label={`Composure over time. On camera ${eyeContactPct} percent. Drifted for ${fmtDuration(driftSec)}.`}
        >
          <defs>
            <linearGradient id="driftFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-signal)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--color-signal)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* 50% reference — the line between "composed" and "struggling" */}
          <line
            x1="0" y1={CHART_H / 2} x2={CHART_W} y2={CHART_H / 2}
            stroke="var(--color-hairline)" strokeWidth="1" strokeDasharray="3 4"
          />

          <motion.polygon
            points={area}
            fill="url(#driftFill)"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          />
          <motion.polyline
            points={line}
            fill="none"
            stroke="var(--color-signal)"
            strokeWidth="1.75"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
          />
        </svg>

        {/* Flagged moments pinned to the axis, above everything */}
        <div className="absolute inset-0">
          {flagged.map((m, i) => (
            <button
              key={`${m.t}-${i}`}
              onClick={() => m.evidence_url && setActiveShot(m.evidence_url)}
              style={{ left: toPct(m.sec) }}
              className="absolute -top-1 -translate-x-1/2 group cursor-pointer"
              aria-label={`Flagged at ${fmtClock(m.sec)}: ${m.caption ?? "event"}`}
              title={`${fmtClock(m.sec)} — ${m.caption ?? "Flagged event"}`}
            >
              <span className="block w-2 h-2 rounded-full bg-[var(--color-danger)] ring-2 ring-[var(--color-canvas)]" />
              <span className="block w-px h-[110px] mx-auto bg-[var(--color-danger)]/35" />
            </button>
          ))}
        </div>
      </div>

      {/* Episode list — the "what actually happened" readout */}
      {episodes.length > 0 ? (
        <ul className="flex flex-col divide-y divide-[var(--color-hairline)]">
          {episodes.map((e, i) => (
            <li key={`row-${i}`} className="flex items-center gap-3 py-2.5">
              <span
                className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
                  e.kind === "DOWN"
                    ? "bg-[var(--color-warn)]/[0.10] text-[var(--color-warn)]"
                    : "bg-[var(--color-amber)]/[0.10] text-[var(--color-amber)]"
                }`}
              >
                {e.kind === "DOWN" ? <ArrowDown size={14} /> : <ArrowLeftRight size={14} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-[var(--color-parchment)]">
                  {e.kind === "DOWN" ? "Looked down" : "Looked away from camera"}
                  <span className="text-[var(--color-slate)]"> for {fmtDuration(e.durationSec)}</span>
                </p>
                <p className="text-[11px] text-[var(--color-slate)] font-mono mt-0.5">
                  {fmtClock(e.startSec)} → {fmtClock(e.endSec)} · composure dipped to{" "}
                  {Math.round(e.minComposure)}%
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-[var(--color-slate)] leading-relaxed">
          No sustained drift. Your eyeline held the camera for the whole session —
          that is the hard part, and you did it.
        </p>
      )}

      {/* Flagged evidence */}
      {flagged.length > 0 && (
        <div className="flex flex-col gap-2.5 pt-1">
          <span className="eyebrow flex items-center gap-2 text-[var(--color-danger)]">
            <TriangleAlert size={12} />
            Flagged moments ({flagged.length})
          </span>
          <div className="flex flex-wrap gap-2">
            {flagged.map((m, i) => (
              <button
                key={`shot-${i}`}
                onClick={() => m.evidence_url && setActiveShot(m.evidence_url)}
                disabled={!m.evidence_url}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/[0.05] text-[11px] text-[var(--color-parchment)] hover:border-[var(--color-danger)]/60 transition-colors disabled:cursor-default disabled:hover:border-[var(--color-danger)]/30 cursor-pointer text-left max-w-[320px]"
              >
                {m.evidence_url && <Camera size={12} className="text-[var(--color-danger)] shrink-0" />}
                <span className="font-mono text-[var(--color-slate)] shrink-0">{fmtClock(m.sec)}</span>
                <span className="truncate">{m.caption ?? "Flagged event"}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {activeShot && (
        <div
          onClick={() => setActiveShot(null)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-8 cursor-zoom-out"
          role="dialog"
          aria-label="Evidence frame"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${API_BASE}${activeShot}`}
            alt="Captured frame from the flagged moment"
            className="max-h-full max-w-full rounded-lg border border-[var(--color-hairline)]"
          />
        </div>
      )}
    </div>
  );
}
