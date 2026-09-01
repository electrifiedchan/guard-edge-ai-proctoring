"use client";

/**
 * /choose-model — pick the brain before you start.
 *
 * The scene is a Morpheus still with two invisible circular hotspots parked
 * over the pills painted into it. Hovering one reveals what that choice
 * actually costs you; clicking it commits.
 *
 * Why a photo and not two cards: the decision is cloud-versus-local, which is
 * a privacy tradeoff, and a pair of radio buttons makes it feel like a settings
 * toggle nobody reads. The reference makes you stop and choose.
 *
 * Every offset that positions something over the image lives in globals.css
 * under `.pill-scene` as a percentage of the image box, because the pills are
 * pixels in morpheus.png (930×802) rather than elements — swap the asset and
 * those percentages need revisiting.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion } from "framer-motion";
import { ArrowLeft, Check, Loader2, Pill, Settings2 } from "lucide-react";
import { useForceDark } from "@/lib/theme";
import { CloudSetup, LocalSetup } from "@/components/choose-model/SetupModal";
import {
  MODES,
  fetchStatus,
  selectMode,
  type CloudProvider,
  type LlmMode,
  type LlmStatus,
  type ModeCopy,
} from "@/lib/llmMode";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950";

/**
 * Where to go once a pill is committed.
 *
 * The dashboard links here with `?next=/dashboard`, because someone switching
 * brains mid-project is not starting a run and should not be dropped into the
 * upload screen. Everyone else is arriving on the way to a session.
 *
 * Read off `location` rather than `useSearchParams` so this page stays out of a
 * Suspense boundary, and only accept a same-origin path — honouring an absolute
 * URL here would turn our own link into an open redirect.
 */
function destination(): string {
  if (typeof window === "undefined") return "/upload";
  const next = new URLSearchParams(window.location.search).get("next");
  return next && /^\/[A-Za-z0-9/_-]*$/.test(next) ? next : "/upload";
}

/** Red pill is local, blue is the cloud. See MODES for why that mapping.
 *  The keys name the hotspot in the scene, not the connectivity — red sits in
 *  Morpheus's left hand, which is `online` because that is where it is painted. */
const PILL_TINT: Record<ModeCopy["pill"], string> = {
  online: "var(--color-danger)",
  offline: "var(--color-info)",
};

function PillCard({
  copy,
  model,
  ready,
  readyNote,
  setupLabel,
  pending,
  onCommit,
  onSetup,
}: {
  copy: ModeCopy;
  model: string;
  /** Key installed (blue) or Ollama answering (red). Drives the setup nudge. */
  ready: boolean;
  /** Live receipt for the ready state — "NVIDIA key installed", not a promise. */
  readyNote: string;
  /** Accessible name and tooltip for the gear. Must describe what the modal
   *  can actually do: it edits keys and probes Ollama, it does not pick models. */
  setupLabel: string;
  pending: boolean;
  onCommit: () => void;
  onSetup: () => void;
}) {
  const tint = PILL_TINT[copy.pill];
  return (
    <div className="pill-card" style={{ color: tint }}>
      <p className="font-mono text-[11px] uppercase tracking-[0.22em]">
        {copy.label}
      </p>

      {/* The headline claim, in the pill's own colour and at body size. This is
          the sentence the whole page exists to make someone read. */}
      <p className="mt-1 text-[13.5px] font-semibold leading-snug" style={{ color: tint }}>
        {copy.truth}
      </p>

      <p className="mt-1 text-[12px] text-parchment">{copy.tagline}</p>
      <p className="font-mono text-[11px] text-slate">{model}</p>

      <div className="mt-2.5 space-y-1">
        {copy.pros.map((p) => (
          <p key={p} className="flex gap-1.5 text-[12px] leading-snug text-parchment">
            <span aria-hidden="true" style={{ color: tint }}>
              +
            </span>
            {p}
          </p>
        ))}
        {copy.cons.map((c) => (
          <p key={c} className="flex gap-1.5 text-[12px] leading-snug text-fog">
            <span aria-hidden="true">−</span>
            {c}
          </p>
        ))}
      </div>

      {/* Ready: commit from in here. The pill itself already commits, but it is
          an invisible hotspot on a photo — someone reading the card has no way
          to know the thing they are hovering is also the button. A labelled
          control beside the claim it just read is the whole point.

          State stays a line of text above rather than folding into the label.
          "NVIDIA API key is present, use it" is a sentence, and a button that
          long stops reading as an action. */}
      {ready ? (
        <div className="mt-3">
          <p
            className="mb-1.5 flex items-center gap-1 text-[11px] font-medium"
            style={{ color: tint }}
          >
            <Check size={11} strokeWidth={2.5} aria-hidden="true" />
            {readyNote}
          </p>

          {/* Split control: commit takes the width, setup is the gear. Two
              siblings in a bordered row, not a button inside a button — that
              is invalid HTML and the inner click never lands. */}
          <div
            className="flex overflow-hidden rounded-lg border"
            style={{ borderColor: `color-mix(in srgb, ${tint} 45%, transparent)` }}
          >
            <button
              type="button"
              onClick={onCommit}
              disabled={pending}
              className={`inline-flex flex-1 items-center justify-center gap-1.5 px-2.5 py-1.5 text-[11.5px] font-semibold text-snow transition hover:bg-white/[0.06] disabled:opacity-60 ${FOCUS_RING}`}
            >
              {pending ? (
                <Loader2 size={12} strokeWidth={2} className="animate-spin" />
              ) : (
                <Pill size={12} strokeWidth={1.5} />
              )}
              Take the {copy.pill === "online" ? "red" : "blue"} pill
            </button>

            {/* Icon-only, so it carries its own name for screen readers and a
                native tooltip for everyone else. */}
            <button
              type="button"
              onClick={onSetup}
              aria-label={setupLabel}
              title={setupLabel}
              className={`grid w-8 shrink-0 place-items-center border-l text-slate transition hover:bg-white/[0.06] hover:text-snow ${FOCUS_RING}`}
              style={{ borderColor: `color-mix(in srgb, ${tint} 45%, transparent)` }}
            >
              <Settings2 size={12} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      ) : (
        /* Not ready: there is nothing to commit to yet, so the only action is
           the one that fixes that. Full width, no split. */
        <button
          type="button"
          onClick={onSetup}
          className={`mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-medium text-snow transition hover:bg-white/[0.06] ${FOCUS_RING}`}
          style={{ borderColor: `color-mix(in srgb, ${tint} 45%, transparent)` }}
        >
          <Settings2 size={12} strokeWidth={1.5} />
          {copy.mode === "cloud" ? "Get a free API key" : "Install Ollama"}
        </button>
      )}
    </div>
  );
}

export default function ChooseModelPage() {
  const router = useRouter();
  const [pending, setPending] = useState<LlmMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<LlmStatus | null>(null);
  const [modal, setModal] = useState<LlmMode | null>(null);

  /* Pinned dark for the same reason as the landing page (see ForceDark):
     morpheus.png has black baked in, so on the light canvas it reads as a grey
     slab. The wordmark fails harder — `snow` inverts to near-black and the
     glitch bands keep their literal `#000` backdrop, so GUARD disappears into
     its own mask, and the hover cards put dark ink on a dark card. */
  useForceDark();

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      setStatus(await fetchStatus(signal));
    } catch {
      // Backend down. The cards still render from MODES and the instructions
      // are still correct — only the live bits (which key is installed, whether
      // Ollama answers) go missing, and those degrade to "not configured".
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    refresh(ac.signal);
    return () => ac.abort();
  }, [refresh]);

  const provider: CloudProvider = status?.provider ?? "nvidia";
  const hasKey = Boolean(status?.providers?.[provider]?.configured);
  const ollamaUp = Boolean(status?.ollamaReachable);

  /**
   * Push the mode to the backend and move on. The only place that navigates.
   *
   * `chosenProvider` comes from the setup modal's active tab, so saving a Groq
   * key and committing from that tab switches the provider too. Falling back to
   * `provider` is for the pills, which follow whatever the backend already has
   * selected.
   */
  const commit = useCallback(
    async (mode: LlmMode, chosenProvider?: CloudProvider) => {
      if (pending) return;
      setPending(mode);
      setError(null);
      try {
        await selectMode(
          mode,
          mode === "cloud" ? (chosenProvider ?? provider) : undefined,
        );
        router.push(destination());
      } catch (e) {
        // The backend override endpoint may not be reachable. Say so plainly
        // rather than navigating on — landing in a session running the wrong
        // brain is exactly what this page exists to prevent.
        //
        // Close the modal on the way out: the failure is the engine, not
        // anything the user typed in there, and the message renders on the page.
        setModal(null);
        setError(
          e instanceof Error && e.message
            ? e.message
            : "Couldn't reach the engine. Is the backend running on 8080?",
        );
        setPending(null);
      }
    },
    [pending, provider, router],
  );

  const choose = useCallback(
    async (mode: LlmMode) => {
      if (pending) return;

      /* Stop short when the choice cannot possibly work yet, and open the setup
         instead of committing. Letting this through would navigate to /upload
         and fail on the first LLM call, several screens away from the cause. */
      /* Both arms wait for `status`. Without that guard the gate reads a
         not-yet-loaded status as "nothing is configured", so clicking a pill
         within the first moment of page load opens the setup modal at someone
         who is already set up. When status never arrives at all the click falls
         through to selectMode, which fails loudly below — the right outcome,
         since a dead backend is the actual problem, not a missing key. */
      if (mode === "cloud" && status && !hasKey) {
        setModal("cloud");
        return;
      }
      /* Has a key but the machine is offline: selectMode would "succeed" and the
         failure would land on the first interview question, several screens from
         its cause. Open the setup so the network flag is what they see instead. */
      if (mode === "cloud" && status && status.cloudReachable === false) {
        setModal("cloud");
        return;
      }
      if (mode === "ollama" && status && !ollamaUp) {
        setModal("ollama");
        return;
      }

      commit(mode);
    },
    [pending, hasKey, ollamaUp, status, commit],
  );

  const READY: Record<LlmMode, boolean> = { cloud: hasKey, ollama: ollamaUp };

  return (
    <main className="pill-scene relative h-screen overflow-hidden bg-canvas">
      {/* A single low emerald wash keeps the page from reading as a bare photo
          on black without competing with the two pill glows. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 45% at 50% 0%, rgba(0, 217, 146, 0.07), transparent 70%)",
        }}
      />

      <button
        type="button"
        onClick={() => router.back()}
        className={`absolute left-5 top-5 z-30 inline-flex items-center gap-2 rounded-lg border border-hairline bg-surface/70 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-parchment transition hover:border-hairline-strong hover:text-snow ${FOCUS_RING}`}
      >
        <ArrowLeft size={14} strokeWidth={1.5} />
        Back
      </button>

      {/* h-full + min-h-0 on the frame row is what makes this fit one screen:
          the header and footer take their natural height, the image absorbs
          whatever is left. min-h-0 is required — a flex child defaults to
          min-height:auto and would refuse to shrink below the image's
          intrinsic size, reintroducing the scrollbar. */}
      <div className="relative z-10 mx-auto flex h-full max-w-4xl flex-col items-center justify-center gap-3 px-5 py-6">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="shrink-0 font-mono text-[11px] uppercase tracking-[0.28em] text-slate"
        >
          Choose your reality
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
          className="shrink-0 text-center text-[15px] text-parchment"
        >
          Which brain writes your questions?
        </motion.h1>

        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="morpheus-frame min-h-0 flex-1"
        >
          <Image
            src="/morpheus.png"
            alt=""
            width={930}
            height={802}
            priority
            className="h-full w-full select-none object-contain"
            draggable={false}
          />

          {/* Wordmark across the sunglasses, opaque-band glitch. */}
          <div className="lens-word" aria-hidden="true">
            <span className="lens-glitch" data-text="GUARD">
              GUARD
            </span>
          </div>

          {(Object.values(MODES) as ModeCopy[]).map((copy) => {
            const isPending = pending === copy.mode;
            /* Cloud follows whichever provider is selected; local follows
               whatever OLLAMA_MODEL is actually set to. The name is sourced only
               from live backend status (which reads llm_config.py) — no hardcoded
               model string to drift; "…" shows for the blink before status lands. */
            const model =
              copy.mode === "cloud"
                ? (status?.providers?.[provider]?.model ?? "…")
                : (status?.ollamaModel ?? "…");

            return (
              <div key={copy.mode} className={`pill-slot pill-${copy.pill}`}>
                <button
                  type="button"
                  onClick={() => choose(copy.mode)}
                  disabled={pending !== null}
                  aria-label={`${copy.label} — ${copy.truth}`}
                  className={`pill-zone ${FOCUS_RING}`}
                  style={{ color: PILL_TINT[copy.pill] }}
                >
                  {isPending && (
                    <span className="absolute inset-0 grid place-items-center">
                      <Loader2 size={18} strokeWidth={1.5} className="animate-spin" />
                    </span>
                  )}
                </button>

                <PillCard
                  copy={copy}
                  model={model}
                  ready={READY[copy.mode]}
                  /* Reads off live status, not MODES, so the receipt names the
                     provider whose key is actually installed. */
                  readyNote={
                    copy.mode === "cloud"
                      ? `${status?.providers?.[provider]?.label ?? "Cloud"} key installed`
                      : "Ollama is running"
                  }
                  setupLabel={
                    copy.mode === "cloud" ? "Change API key" : "Ollama setup"
                  }
                  pending={isPending}
                  /* choose(), not commit(): identical for a ready pill, but it
                     keeps one gate in front of every commit rather than letting
                     the card bypass it if `ready` and the gate ever disagree. */
                  onCommit={() => choose(copy.mode)}
                  onSetup={() => setModal(copy.mode)}
                />
              </div>
            );
          })}
        </motion.div>

        <p className="shrink-0 text-center font-mono text-[11px] uppercase tracking-[0.2em] text-fog">
          Hover a pill to see what it costs you
        </p>

        {error && (
          <p
            role="alert"
            className="shrink-0 rounded-lg border border-[var(--color-warn)]/25 bg-[var(--color-warn)]/[0.06] px-3.5 py-2 text-[13px] text-[var(--color-warn)]"
          >
            {error}
          </p>
        )}

        <p className="flex shrink-0 items-center gap-1.5 text-[12px] text-fog">
          <Check size={13} strokeWidth={1.5} className="text-signal" />
          You can switch any time from the dashboard.
        </p>
      </div>

      {modal === "cloud" && (
        <CloudSetup
          status={status}
          initialProvider={provider}
          onSaved={setStatus}
          onRecheck={() => refresh()}
          onCommit={(p) => commit("cloud", p)}
          committing={pending === "cloud"}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "ollama" && (
        <LocalSetup
          status={status}
          onRecheck={() => refresh()}
          onCommit={() => commit("ollama")}
          committing={pending === "ollama"}
          onClose={() => setModal(null)}
        />
      )}
    </main>
  );
}
