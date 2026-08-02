"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { HelpCircle, X } from "lucide-react";
import { HEATMAP } from "@/lib/dashboard";
import { PANEL_GUIDES, type PanelGuideKey } from "@/lib/panelGuides";
import { cn } from "@/lib/utils";


/** Shape of the placeholder, so loading looks designed rather than generic. */
export type SkeletonVariant = "block" | "chart" | "rows" | "ring" | "grid";

interface PanelProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  loading?: boolean;
  error?: boolean;
  empty?: boolean;
  emptyMessage?: string;
  skeletonVariant?: SkeletonVariant;
  /**
   * Opts the panel into the "?" explainer. Charts are self-evident to whoever
   * built them and to nobody else; this is the in-product answer to "what am I
   * actually looking at".
   */
  guide?: PanelGuideKey;
  className?: string;
  children: ReactNode;
}

/**
 * Every non-loaded state must occupy the same height as its loaded state, or
 * the grid lurches downward the moment data lands and mis-targets clicks.
 */
const MIN_H: Record<SkeletonVariant, string> = {
  block: "min-h-[7rem]",
  chart: "min-h-[16rem]",
  rows: "min-h-[15rem]",
  ring: "min-h-[16rem]",
  // 7 rows x 16px + the streak caption above the grid = ~140px.
  grid: "min-h-[8.75rem]",
};


function Skeleton({
  variant = "block",
  className,
}: {
  variant?: SkeletonVariant;
  className?: string;
}) {
  const bar = "animate-pulse rounded-md bg-neutral-800/60";

  if (variant === "chart") {
    return (
      <div className={cn("space-y-3", className)} aria-hidden="true">
        <div className={cn(bar, "h-[11rem] w-full")} />
        <div className="flex justify-between">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={cn(bar, "h-2 w-10")} />
          ))}
        </div>
      </div>
    );
  }

  if (variant === "rows") {
    return (
      <div className={cn("space-y-2.5", className)} aria-hidden="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={cn(bar, "h-9 w-full")} />
        ))}
      </div>
    );
  }

  if (variant === "ring") {
    return (
      <div
        className={cn("flex flex-col items-center gap-4", className)}
        aria-hidden="true"
      >
        <div className={cn(bar, "h-40 w-40 rounded-full")} />
        <div className={cn(bar, "h-4 w-28 rounded-full")} />
      </div>
    );
  }

  if (variant === "grid") {
    // Rows are pinned to the real cell height so the skeleton is exactly as
    // tall as the heatmap that replaces it (7 x 13px + gaps) — that height
    // invariant is what keeps the panel from lurching on load.
    // Columns are 1fr rather than 13px so the placeholder spans the panel
    // instead of huddling in the left quarter. Width can flex freely here;
    // only height causes layout shift.
    return (
      <div className={cn("space-y-3", className)} aria-hidden="true">
        <div className={cn(bar, "h-3 w-40")} />
        <div
          className="grid w-full grid-flow-col"
          style={{
            gridTemplateRows: `repeat(${HEATMAP.rows}, ${HEATMAP.cell}px)`,
            gridTemplateColumns: `repeat(${HEATMAP.cols}, minmax(0, 1fr))`,
            gap: `${HEATMAP.gap}px`,
          }}
        >

          {Array.from({ length: HEATMAP.rows * HEATMAP.cols }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-sm bg-neutral-800/60" />
          ))}
        </div>
      </div>
    );
  }


  return <div className={cn(bar, "h-24 w-full", className)} aria-hidden="true" />;
}

/**
 * Quiet per-widget offline state. The loud explanation lives once in the
 * page-level banner — six panels repeating it reads as six separate crashes.
 */
function PanelOffline({ variant }: { variant: SkeletonVariant }) {
  return (
    // Every skeleton variant is now full-width, so `inset-0` centres "offline"
    // over the placeholder itself rather than over empty panel space.
    <div className="relative">

      <Skeleton variant={variant} className="opacity-40" />

      <span className="absolute inset-0 grid place-items-center text-xs text-neutral-600">
        offline
      </span>
    </div>
  );
}

/**
 * Shared surface for every dashboard widget so spacing, radius and header
 * rhythm stay identical. Owns the loading/error/empty branches too, which
 * keeps that logic out of each individual widget.
 */
export default function Panel({
  title,
  subtitle,
  action,
  loading,
  error,
  empty,
  emptyMessage = "Nothing here yet.",
  skeletonVariant = "block",
  guide,
  className,
  children,
}: PanelProps) {
  const settled = !loading && !error && !empty;
  const [showGuide, setShowGuide] = useState(false);

  // Nothing to explain until there's something on screen to point at.
  const canExplain = Boolean(guide) && !loading;
  const guideCopy = guide ? PANEL_GUIDES[guide] : null;

  return (
    <section
      aria-label={title}
      className={cn(
        "group relative overflow-hidden rounded-xl p-5 backdrop-blur",
        "border border-neutral-800/80 bg-gradient-to-b from-neutral-900/70 to-neutral-900/40",
        "ring-1 ring-inset ring-white/[0.04]",
        "transition-colors hover:border-neutral-700/80",
        className,
      )}
    >
      {/* Top-edge highlight: reads as light catching the panel rim. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"
      />

      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-medium text-neutral-200">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-neutral-500">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {action}
          {canExplain && (
            <button
              type="button"
              onClick={() => setShowGuide((v) => !v)}
              aria-expanded={showGuide}
              aria-label={showGuide ? `Hide guide for ${title}` : `What am I looking at? ${title}`}
              title="What am I looking at?"
              className={cn(
                "grid h-6 w-6 place-items-center rounded-md text-neutral-500",
                "transition-colors hover:bg-neutral-800/80 hover:text-neutral-300",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60",
                showGuide && "bg-neutral-800/80 text-emerald-400",
              )}
            >
              {showGuide ? <X size={13} /> : <HelpCircle size={14} />}
            </button>
          )}
        </div>
      </header>

      <div className={cn(!settled && MIN_H[skeletonVariant])}>
        {loading ? (
          <Skeleton variant={skeletonVariant} />
        ) : error ? (
          <PanelOffline variant={skeletonVariant} />
        ) : empty ? (
          <p className="text-xs text-neutral-600">{emptyMessage}</p>
        ) : (
          children
        )}
      </div>

      {/*
        Overlays the panel body rather than expanding it. A popover would be
        clipped by the panel's own overflow-hidden, and pushing content down
        would reflow the whole dashboard grid every time someone asks a
        question.
      */}
      <AnimatePresence>
        {showGuide && guideCopy && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 z-10 flex flex-col gap-3 overflow-y-auto bg-neutral-950/95 p-5 backdrop-blur-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-400/80">
                What am I looking at?
              </p>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Close guide"
                className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-800/80 hover:text-neutral-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
              >
                <X size={13} />
              </button>
            </div>

            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                Reading it
              </p>
              <p className="mt-1 text-xs leading-relaxed text-neutral-300">
                {guideCopy.reading}
              </p>
            </div>

            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                What good looks like
              </p>
              <p className="mt-1 text-xs leading-relaxed text-neutral-300">
                {guideCopy.healthy}
              </p>
            </div>

            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2">
              <p className="text-[11px] font-medium uppercase tracking-wider text-emerald-400/80">
                Move the needle
              </p>
              <p className="mt-1 text-xs leading-relaxed text-neutral-200">
                {guideCopy.action}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
