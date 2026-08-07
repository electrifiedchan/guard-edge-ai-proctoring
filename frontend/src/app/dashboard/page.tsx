"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import type { DashboardSummary } from "@/lib/dashboard";
import { fetchSummary, fmtDuration, TALKING_BAND } from "@/lib/dashboard";

import { buildDemoSummary } from "@/lib/demoSummary";

import { resolveDisplayName } from "@/lib/greeting";
import { activeCandidateId } from "@/lib/resumeMemory";


import Panel from "@/components/dashboard/Panel";
import StatCard from "@/components/dashboard/StatCard";
import ReadinessRing from "@/components/dashboard/ReadinessRing";
import ComposureTrend from "@/components/dashboard/ComposureTrend";
import PracticeStreak from "@/components/dashboard/PracticeStreak";
import GazeSplit from "@/components/dashboard/GazeSplit";
import FocusArea from "@/components/dashboard/FocusArea";
import SessionList from "@/components/dashboard/SessionList";
import EmptyDashboard from "@/components/dashboard/EmptyDashboard";
import DashboardTour, { useTourSeen } from "@/components/dashboard/DashboardTour";
import ThemeToggle from "@/components/ThemeToggle";



const DAYS = 84;
const PREFERRED_NAME_KEY = "guard.preferredName";



/**
 * Declared up front so the stat row always renders four *labelled* cards, even
 * when the fetch fails and no metric objects exist. Without this the row
 * degrades into anonymous grey boxes, which is not one of the three states.
 */
const STAT_SLOTS = [
  { key: "eye_contact_pct", label: "Eye contact" },
  { key: "talking_pct", label: "Speaking time" },
  { key: "longest_focus_streak_s", label: "Longest focus streak" },
  { key: "recovery_count", label: "Recoveries" },
] as const;

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950";

export default function DashboardPage() {
  const reduceMotion = useReducedMotion();

  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Name resolution runs after mount only — reading localStorage during render
  // would cause a hydration mismatch and flash the fallback name.
  const [mounted, setMounted] = useState(false);
  const [storedName, setStoredName] = useState<string | null>(null);
  const [confirmDismissed, setConfirmDismissed] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  // Guided tour. useTourSeen returns null until mounted (localStorage is
  // client-only), so first-run auto-open waits for a definite false rather than
  // flashing the modal during hydration.
  const [tourOpen, setTourOpen] = useState(false);
  const tourSeen = useTourSeen();


  useEffect(() => {
    setMounted(true);
    try {
      setStoredName(window.localStorage.getItem(PREFERRED_NAME_KEY));
    } catch {
      // localStorage can throw in private mode — non-fatal, fall back to parsing.
    }
  }, []);

  // Single fetch for the whole page. No widget fetches its own data.
  // fetchSummary resolves to null on failure rather than throwing, so there is
  // no unhandled rejection to leak to the console here.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    // ?demo=1 renders the populated state with no backend running, for design
    // review. Read from window.location rather than useSearchParams: the latter
    // would force a Suspense boundary around this whole client page.
    // Client-side only, so it cannot leak fixture data into a server render.
    const isDemo = new URLSearchParams(window.location.search).get("demo") === "1";
    if (isDemo) {
      setData(buildDemoSummary(DAYS));
      setLoading(false);
      return;
    }

    // History is scoped to the resume, not the browser — see activeCandidateId.
    // Resolved inside the effect rather than at module scope: it reads
    // localStorage, which does not exist during the server render.
    const candidateId = activeCandidateId();

    (async () => {
      const summary = await fetchSummary(candidateId, DAYS);

      if (cancelled) return;
      if (!summary) setError(true);
      else setData(summary);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);



  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  // First-run auto-open: only when we know for certain the tour was never seen.
  // Gated on a loaded dashboard so the tour narrates panels that are actually
  // on screen, not a wall of skeletons.
  useEffect(() => {
    if (tourSeen === false && !loading && !error) setTourOpen(true);
  }, [tourSeen, loading, error]);


  const greeting = useMemo(
    () =>
      resolveDisplayName({
        preferredName: storedName ?? data?.candidate.preferred_name ?? null,
        resumeName: data?.candidate.display_name ?? null,
      }),
    [storedName, data],
  );

  const fullName = data?.candidate.display_name ?? greeting.name;
  const showConfirm = mounted && greeting.needsConfirm && !confirmDismissed && !storedName;

  const savePreferredName = () => {
    const clean = nameDraft.trim();
    if (!clean) return;
    try {
      window.localStorage.setItem(PREFERRED_NAME_KEY, clean);
    } catch {
      // Non-fatal — the name still applies for this session.
    }
    setStoredName(clean);
    setConfirmDismissed(true);
  };

  // Stagger children in once on mount. Nothing loops, nothing bounces.
  const container = {
    hidden: {},
    show: { transition: { staggerChildren: reduceMotion ? 0 : 0.06 } },
  };
  const item = {
    hidden: { opacity: 0, y: reduceMotion ? 0 : 8 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.35, ease: "easeOut" as const },
    },
  };

  const metrics = data?.metrics ?? [];
  const isEmpty = !loading && !error && (data?.totals.sessions ?? 0) === 0;
  const totals = data?.totals;

  // Canvas token, not bg-neutral-950: html/body and every other route paint
  // --color-canvas (#050507), so a hardcoded #0a0a0a left two different blacks
  // in one product and a visible seam below the fold.
  return (
    <main className="relative min-h-screen bg-[var(--color-canvas)] px-6 py-8 text-neutral-200 selection:bg-emerald-400/25 md:px-12">

      {/*
        Ambient top tint — page backdrop, not an element glow.

        Height is 240px rather than the spec's 420px. At alpha 0.07 the wash
        lifts the canvas from #050507 to #061210: only +13/255 on green, but a
        ~3x relative jump, and on a near-black background the eye reads the
        relative change, so it renders as a visible cast. Ending the box above
        the panel grid keeps the glow on the header where it was intended.
        The gradient reaches transparent at 70% (~168px), so shortening the box
        does not introduce a hard cutoff edge.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[240px] bg-[radial-gradient(60%_100%_at_50%_0%,rgba(16,185,129,0.07),transparent_70%)]"
      />


      <div className="relative mx-auto max-w-6xl space-y-6">

        {/* Greeting row */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-emerald-400/80">
              Interview readiness
            </p>
            <h1 className="mt-2 flex items-baseline gap-2 text-3xl font-semibold tracking-tight text-neutral-50">
              <span className="shrink-0">Welcome back,</span>
              {/* min-w-0 is what lets truncate actually engage: a flex child
                  defaults to min-width:auto and refuses to shrink below its
                  nowrap text, so at 375px this row overflowed instead of
                  ellipsising. */}
              {mounted ? (
                <span className="min-w-0 max-w-[14ch] truncate text-emerald-400" title={fullName}>

                  {greeting.name}
                </span>
              ) : (
                <span className="h-8 w-28 animate-pulse rounded bg-neutral-800" />
              )}
            </h1>

            {/* This line always occupies space. Dropping it on the error path
                leaves the header top-heavy and shifts everything below it. */}
            {loading || error || !totals ? (
              <div className="mt-1 flex h-5 items-center" aria-hidden="true">
                <div className="h-4 w-64 animate-pulse rounded bg-neutral-800/60" />
              </div>
            ) : (
              <p className="mt-1 h-5 text-sm tabular-nums text-neutral-500">
                {totals.sessions > 0
                  ? `${totals.sessions} session${totals.sessions === 1 ? "" : "s"} · ${fmtDuration(totals.practice_seconds)} practiced · ${totals.current_streak_days}-day streak`
                  : "Your baseline starts with one session."}
              </p>
            )}


            {showConfirm && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-xs">
                <label htmlFor="preferred-name" className="text-neutral-400">
                  Call you something shorter?
                </label>
                <input
                  id="preferred-name"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  placeholder={greeting.name}
                  className="w-28 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-neutral-100 outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={savePreferredName}
                  className={`rounded-md bg-emerald-500/15 px-2 py-1 font-medium text-emerald-400 transition-colors hover:bg-emerald-500/25 ${FOCUS_RING}`}
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDismissed(true)}
                  className={`rounded-md px-1 text-neutral-500 transition-colors hover:text-neutral-300 ${FOCUS_RING}`}
                >
                  Keep it
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Appearance switch. Lives on the dashboard rather than the landing
                page because the landing page is pinned dark (see ForceDark). */}
            <ThemeToggle />

            {/* "What am I looking at" — the same guided-tour copy the "?" on each

                panel shows, but as one narrated walkthrough. A first-timer
                doesn't know the per-panel "?" exists, so this is the discoverable
                entry point. Ghost styling keeps it secondary to the CTA. */}
            <button
              type="button"
              onClick={() => setTourOpen(true)}
              className={`inline-flex items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2.5 text-sm font-medium text-neutral-300 transition hover:border-neutral-700 hover:text-neutral-100 ${FOCUS_RING}`}
            >
              <span
                aria-hidden="true"
                className="grid h-4 w-4 place-items-center rounded-full border border-neutral-600 text-[10px] leading-none text-neutral-400"
              >
                ?
              </span>
              How to read this
            </button>

            {/* /upload, not /session: there is no /session route. Upload is the
                real entry to a run — it resumes remembered resume data and hands
                off to /sentry, so it works for both first-time and repeat users. */}
            <Link
              href="/upload"
              className={`group inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-neutral-950 transition hover:bg-emerald-400 active:scale-[0.98] ${FOCUS_RING}`}
            >
              Start a session
              <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </Link>
          </div>
        </div>


        {/* One banner for one failure. Each panel stays quiet. */}
        {error && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[var(--color-warn)]/20 bg-[var(--color-warn)]/[0.06] px-4 py-3"
          >
            <p className="text-sm text-[var(--color-warn)]">
              Couldn&apos;t reach the engine. Your data is safe — nothing was lost.
            </p>
            <button
              type="button"
              onClick={retry}
              className={`shrink-0 rounded-md border border-[var(--color-warn)]/30 px-3 py-1.5 text-xs font-medium text-[var(--color-warn)] transition hover:bg-[var(--color-warn)]/10 ${FOCUS_RING}`}
            >
              Retry now
            </button>
          </div>
        )}

        {isEmpty ? (
          <EmptyDashboard />
        ) : (
          <motion.div
            className="space-y-6"
            variants={container}
            initial="hidden"
            animate="show"
          >

            {/* Stat row — one card per slot in every state, never a bare box */}
            <motion.div
              variants={item}
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
            >
              {STAT_SLOTS.map((slot) => (
                <StatCard
                  key={slot.key}
                  label={slot.label}
                  metric={metrics.find((m) => m.key === slot.key) ?? null}
                  loading={loading}
                  error={error}
                  targetBand={slot.key === "talking_pct" ? TALKING_BAND : undefined}

                />
              ))}
            </motion.div>

            {/* Trend + readiness */}
            <motion.div variants={item} className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                {/* guide= turns on the "?" in each panel header. Charts read as
                    decoration until someone tells you what the marks mean and
                    what number to aim for — that copy lives in panelGuides.ts. */}
                <Panel
                  title="Composure over time"
                  subtitle="Average and lowest point per session"
                  loading={loading}
                  error={error}
                  skeletonVariant="chart"
                  guide="composure"
                  empty={!!data && data.composure_trend.length === 0}
                  emptyMessage="Run a session to start the curve."
                >
                  <ComposureTrend trend={data?.composure_trend ?? []} />
                </Panel>
              </div>
              <div>
                <Panel
                  title="Readiness"
                  loading={loading}
                  error={error}
                  skeletonVariant="ring"
                  guide="readiness"
                >
                  <ReadinessRing readiness={data?.readiness ?? null} />
                </Panel>
              </div>
            </motion.div>

            {/* Streak + gaze */}
            <motion.div variants={item} className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <Panel
                  title="Practice streak"
                  loading={loading}
                  error={error}
                  skeletonVariant="grid"
                  guide="streak"
                >
                  <PracticeStreak
                    activity={data?.activity ?? []}
                    currentStreak={data?.totals.current_streak_days ?? 0}
                    bestStreak={data?.totals.best_streak_days ?? 0}
                    days={DAYS}
                  />
                </Panel>
              </div>
              <div>
                <Panel
                  title="Where your eyes go"
                  loading={loading}
                  error={error}
                  skeletonVariant="block"
                  guide="gaze"
                  empty={!!data && !data.gaze_split}
                  emptyMessage="No gaze data yet."
                >
                  {data?.gaze_split && <GazeSplit split={data.gaze_split} />}
                </Panel>
              </div>
            </motion.div>

            {/* Focus + sessions */}
            <motion.div variants={item} className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div>
                {data?.focus_area ? (
                  <FocusArea focus={data.focus_area} />
                ) : (
                  <Panel
                    title="Work on this next"
                    loading={loading}
                    error={error}
                    skeletonVariant="block"
                    empty={!loading && !error}
                    emptyMessage="Run a couple more sessions and we'll pinpoint what to drill."
                  >
                    <div />
                  </Panel>
                )}
              </div>
              <div className="lg:col-span-2">
                <Panel
                  title="Recent sessions"
                  loading={loading}
                  error={error}
                  skeletonVariant="rows"
                  guide="sessions"
                  empty={!!data && data.recent_sessions.length === 0}
                  emptyMessage="No sessions logged yet."
                >
                  <SessionList sessions={data?.recent_sessions ?? []} />
                </Panel>
              </div>
            </motion.div>

          </motion.div>
        )}
      </div>

      {/* Guided tour overlay — controlled here, copy sourced from PANEL_GUIDES. */}
      <DashboardTour open={tourOpen} onClose={() => setTourOpen(false)} />
    </main>
  );
}


