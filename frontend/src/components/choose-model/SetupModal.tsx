"use client";

/**
 * Setup modals for the two pills.
 *
 * Both open over the Morpheus scene with the backdrop blurred, because the
 * still is busy and dark ink over a face is unreadable — the blur is what makes
 * this legible, not decoration.
 *
 * Red (`CloudSetup`) is the one that needs anything: a free API key. The two
 * providers get tabs rather than a dropdown — with exactly two options, a
 * dropdown hides half the answer behind a click and makes the user compare
 * things they cannot see at once. Tabs show both labels up front, and the
 * selected tab *is* the answer, which is why there is no auto-detect-on-paste
 * here; the only mismatch worth catching is a `gsk_` pasted on the NVIDIA tab,
 * and that is a warning, not a rejection (see detectProvider).
 *
 * Blue (`LocalSetup`) needs no key at all, so it is instructions plus one live
 * fact: whether Ollama is actually answering right now. That check is the whole
 * point — "install Ollama" is easy to believe you have done.
 *
 * Both commit the switch themselves, via `onCommit`. They used to only clear the
 * blocker and leave the user to find the pill again behind the blur — which is a
 * second decision to make about something they had already decided. The button
 * appears only when the mode can actually work: a key installed for red, a live
 * probe for blue. Presence of the button is therefore also the setup's receipt.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Pill,
  ShieldAlert,
  X,
} from "lucide-react";
import {
  detectProvider,
  saveKey,
  type CloudProvider,
  type LlmStatus,
} from "@/lib/llmMode";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950";

/** Fallbacks for when the backend is unreachable and status never arrived —
 *  the instructions are still the most useful thing on screen at that point. */
const CONSOLES: Record<CloudProvider, string> = {
  nvidia: "https://build.nvidia.com/meta/llama-3_1-8b-instruct",
  groq: "https://console.groq.com/keys",
};

const PROVIDER_ORDER: CloudProvider[] = ["nvidia", "groq"];

const PROVIDER_STEPS: Record<CloudProvider, string[]> = {
  nvidia: [
    "Open the NVIDIA model page and sign in — free, no card.",
    'Click "Get API Key" in the top right of the code panel.',
    "Copy the key. It starts with nvapi-.",
  ],
  groq: [
    "Open the Groq console and sign in — free, no card.",
    'Click "Create API Key" and give it any name.',
    "Copy it now — it starts with gsk_ and is shown only once.",
  ],
};

const LABELS: Record<CloudProvider, string> = {
  nvidia: "NVIDIA",
  groq: "Groq",
};

/* ── Shell ──────────────────────────────────────────────────────────────── */

function ModalShell({
  title,
  subtitle,
  tint,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  tint: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  /* Whatever had focus when this opened — usually the Setup button, which is
     inside a hover card that will be gone by the time we close. Restoring to a
     detached node silently drops focus to <body>, so the check below matters. */
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    restoreTo.current = document.activeElement as HTMLElement | null;
    panel.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
      if (e.key !== "Tab") return;
      // Minimal trap. Without it, Tab walks out of the dialog and onto the
      // pills behind the blur, which are still hoverable and clickable.
      const focusables = panel.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables?.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const target = restoreTo.current;
      if (target?.isConnected) target.focus();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center p-4"
      role="presentation"
      onClick={onClose}
    >
      {/* The blur. Sits under the panel and over everything else. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
      />

      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-2xl border bg-[rgba(8,8,10,0.97)] p-6 shadow-2xl outline-none"
        style={{ borderColor: `color-mix(in srgb, ${tint} 40%, transparent)` }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className={`absolute right-4 top-4 rounded-lg p-1.5 text-fog transition hover:bg-white/5 hover:text-snow ${FOCUS_RING}`}
        >
          <X size={16} strokeWidth={1.5} />
        </button>

        <p
          className="font-mono text-[10px] uppercase tracking-[0.24em]"
          style={{ color: tint }}
        >
          {subtitle}
        </p>
        <h2 className="mt-1.5 pr-8 text-[19px] font-semibold text-snow">
          {title}
        </h2>

        {children}
      </div>
    </div>
  );
}

function Steps({ steps }: { steps: string[] }) {
  return (
    <ol className="mt-4 space-y-2.5">
      {steps.map((step, i) => (
        <li key={step} className="flex gap-3 text-[13px] leading-relaxed text-parchment">
          <span className="mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full border border-hairline font-mono text-[10px] text-slate">
            {i + 1}
          </span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  );
}

/* ── Blue pill — cloud key ──────────────────────────────────────────────── */

export function CloudSetup({
  status,
  initialProvider,
  onSaved,
  onCommit,
  committing,
  onClose,
}: {
  status: LlmStatus | null;
  initialProvider: CloudProvider;
  onSaved: (next: LlmStatus) => void;
  /** Take the pill from in here, on the tab the user is looking at. */
  onCommit: (provider: CloudProvider) => void;
  committing: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<CloudProvider>(initialProvider);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  /* Set when the user chooses to overwrite a key that is already installed, so
     the field appears in place of the "configured" summary. */
  const [replacing, setReplacing] = useState(false);

  const info = status?.providers?.[tab];
  const consoleUrl = info?.console ?? CONSOLES[tab];
  const configured = Boolean(info?.configured) && !replacing;
  const guessed = detectProvider(key);
  const mismatch = guessed !== null && guessed !== tab;

  const submit = useCallback(async () => {
    if (busy || !key.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const next = await saveKey(tab, key);
      setKey("");
      setSaved(true);
      setReplacing(false);
      onSaved(next);
    } catch (e) {
      // The backend's 400 messages are written for this exact spot — show them
      // as-is rather than replacing them with something vaguer.
      setError(e instanceof Error ? e.message : "Couldn't save that key.");
    } finally {
      setBusy(false);
    }
  }, [busy, key, tab, onSaved]);

  return (
    <ModalShell
      subtitle="Blue pill · online"
      title="Get a free API key"
      tint="var(--color-info)"
      onClose={onClose}
    >
      <p className="mt-3 text-[13px] leading-relaxed text-fog">
        The online model runs on someone else&apos;s hardware, so it needs a key.
        Both of these are free and neither asks for a card. Pick whichever you
        already have an account with.
      </p>

      {/* Tabs. role=tablist so a screen reader announces this as one control
          with two states rather than two unrelated buttons. */}
      <div
        role="tablist"
        aria-label="Provider"
        className="mt-4 flex gap-1 rounded-xl border border-hairline bg-white/[0.02] p-1"
      >
        {PROVIDER_ORDER.map((p) => {
          const active = p === tab;
          const has = Boolean(status?.providers?.[p]?.configured);
          return (
            <button
              key={p}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => {
                setTab(p);
                setError(null);
                setSaved(false);
                setReplacing(false);
                setKey("");
              }}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium transition ${FOCUS_RING} ${
                active
                  ? "bg-white/[0.07] text-snow"
                  : "text-slate hover:text-parchment"
              }`}
            >
              {LABELS[p]}
              {has && (
                <Check
                  size={12}
                  strokeWidth={2}
                  className="text-signal"
                  aria-label="key installed"
                />
              )}
            </button>
          );
        })}
      </div>

      <div role="tabpanel">
        <Steps steps={PROVIDER_STEPS[tab]} />

        <a
          href={consoleUrl}
          target="_blank"
          rel="noreferrer noopener"
          className={`mt-4 inline-flex items-center gap-2 rounded-lg border border-[var(--color-info)]/35 bg-[var(--color-info)]/[0.08] px-3.5 py-2 text-[12px] font-medium text-snow transition hover:bg-[var(--color-info)]/[0.14] ${FOCUS_RING}`}
        >
          Open {LABELS[tab]} console
          <ExternalLink size={13} strokeWidth={1.5} />
        </a>

        {configured ? (
          <div className="mt-5 rounded-xl border border-hairline bg-white/[0.02] p-3.5">
            <p className="flex items-center gap-2 text-[13px] text-snow">
              <Check size={14} strokeWidth={2} className="text-signal" />
              {LABELS[tab]} key installed
            </p>
            <p className="mt-1 font-mono text-[12px] text-slate">{info?.masked}</p>
            <button
              type="button"
              onClick={() => setReplacing(true)}
              className={`mt-2.5 rounded-md text-[12px] text-fog underline underline-offset-2 transition hover:text-parchment ${FOCUS_RING}`}
            >
              Replace it
            </button>
          </div>
        ) : (
          <div className="mt-5">
            <label
              htmlFor="api-key"
              className="block font-mono text-[10px] uppercase tracking-[0.2em] text-slate"
            >
              Paste your {LABELS[tab]} key
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id="api-key"
                type="password"
                value={key}
                autoComplete="off"
                spellCheck={false}
                placeholder={info?.prefix ?? (tab === "nvidia" ? "nvapi-" : "gsk_")}
                onChange={(e) => {
                  setKey(e.target.value);
                  setError(null);
                  setSaved(false);
                }}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                className={`min-w-0 flex-1 rounded-lg border border-hairline bg-black/40 px-3 py-2 font-mono text-[13px] text-snow placeholder:text-fog/60 ${FOCUS_RING}`}
              />
              <button
                type="button"
                onClick={submit}
                disabled={busy || !key.trim()}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-snow px-3.5 py-2 text-[12px] font-semibold text-black transition hover:bg-white disabled:opacity-40 ${FOCUS_RING}`}
              >
                {busy && <Loader2 size={13} className="animate-spin" />}
                Save
              </button>
            </div>

            {mismatch && (
              <p className="mt-2 flex items-start gap-1.5 text-[12px] leading-snug text-[var(--color-warn)]">
                <ShieldAlert size={13} strokeWidth={1.5} className="mt-px shrink-0" />
                That looks like a {LABELS[guessed]} key. Switch to the{" "}
                {LABELS[guessed]} tab, or save it here anyway if you know better.
              </p>
            )}

            <p className="mt-2 text-[11px] leading-snug text-fog">
              Stored in <span className="font-mono">backend/.env</span> on this
              machine, which is gitignored. It is never sent anywhere except the
              provider you picked.
            </p>
          </div>
        )}

        {saved && (
          <p
            role="status"
            className="mt-3 flex items-center gap-1.5 text-[12px] text-signal"
          >
            <Check size={13} strokeWidth={2} />
            Saved.
          </p>
        )}

        {/* Commit from in here rather than sending them back out to the pill.
            Keyed on this tab's own key, not the page's selected provider: someone
            who arrived on NVIDIA and pasted a Groq key wants Groq, and passing
            `tab` up is what makes the switch follow the tab they are reading. */}
        {Boolean(info?.configured) && (
          <button
            type="button"
            onClick={() => onCommit(tab)}
            disabled={committing}
            className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-info)] px-4 py-2.5 text-[13px] font-semibold text-black transition hover:brightness-110 disabled:opacity-60 ${FOCUS_RING}`}
          >
            {committing ? (
              <Loader2 size={14} strokeWidth={2} className="animate-spin" />
            ) : (
              <Pill size={14} strokeWidth={2} />
            )}
            Take the blue pill with {LABELS[tab]}
          </button>
        )}

        {error && (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/[0.07] px-3 py-2 text-[12px] leading-snug text-[var(--color-danger)]"
          >
            {error}
          </p>
        )}
      </div>
    </ModalShell>
  );
}

/* ── Red pill — local Ollama ────────────────────────────────────────────── */

function CopyRow({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-2 flex items-center gap-2 rounded-lg border border-hairline bg-black/40 px-3 py-2">
      <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-snow">
        {command}
      </code>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard?.writeText(command).then(
            () => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            },
            () => {
              /* Clipboard blocked (insecure origin or denied permission). The
                 command is visible and selectable, so there is nothing to say. */
            },
          );
        }}
        aria-label={`Copy: ${command}`}
        className={`shrink-0 rounded-md p-1 text-fog transition hover:text-snow ${FOCUS_RING}`}
      >
        {copied ? (
          <Check size={13} strokeWidth={2} className="text-signal" />
        ) : (
          <Copy size={13} strokeWidth={1.5} />
        )}
      </button>
    </div>
  );
}

export function LocalSetup({
  status,
  onRecheck,
  onCommit,
  committing,
  onClose,
}: {
  status: LlmStatus | null;
  onRecheck: () => Promise<void>;
  /** Take the pill from in here, once the probe says Ollama is up. */
  onCommit: () => void;
  committing: boolean;
  onClose: () => void;
}) {
  const [checking, setChecking] = useState(false);
  const up = Boolean(status?.ollamaReachable);
  const model = status?.ollamaModel || "qwen2.5:3b";

  return (
    <ModalShell
      subtitle="Red pill · offline"
      title="Run the model on this machine"
      tint="var(--color-danger)"
      onClose={onClose}
    >
      <p className="mt-3 text-[13px] leading-relaxed text-fog">
        No key, no account, no bill — the model runs here. You need Ollama
        installed and one model pulled, about 2&nbsp;GB once.
      </p>

      {/* The live check comes first, because someone who already has Ollama
          running does not need to read any of the steps below it. */}
      <div
        className="mt-4 flex items-center gap-3 rounded-xl border p-3.5"
        style={{
          borderColor: up
            ? "color-mix(in srgb, var(--color-signal) 35%, transparent)"
            : "var(--color-hairline, rgba(255,255,255,0.08))",
        }}
      >
        <span
          aria-hidden="true"
          className={`h-2 w-2 shrink-0 rounded-full ${up ? "animate-pulse" : ""}`}
          style={{ background: up ? "var(--color-signal)" : "var(--color-fog)" }}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-snow">
            {up ? "Ollama is running" : "Ollama is not answering"}
          </p>
          <p className="truncate font-mono text-[11px] text-slate">
            {up ? `localhost:11434 · ${status?.model || model}` : "localhost:11434"}
          </p>
        </div>
        <button
          type="button"
          disabled={checking}
          onClick={async () => {
            setChecking(true);
            try {
              await onRecheck();
            } finally {
              setChecking(false);
            }
          }}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-hairline px-2.5 py-1.5 text-[11px] text-parchment transition hover:text-snow disabled:opacity-50 ${FOCUS_RING}`}
        >
          {checking && <Loader2 size={12} className="animate-spin" />}
          Re-check
        </button>
      </div>

      {/* Sits directly under the probe and above the steps: someone whose Ollama
          is already answering is done here and should never have to read an
          install guide to get out. Hidden rather than disabled while it is down —
          committing to a backend that is not there would fail on the first
          question, which is the whole failure this page exists to prevent. */}
      {up && (
        <button
          type="button"
          onClick={onCommit}
          disabled={committing}
          className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-danger)] px-4 py-2.5 text-[13px] font-semibold text-black transition hover:brightness-110 disabled:opacity-60 ${FOCUS_RING}`}
        >
          {committing ? (
            <Loader2 size={14} strokeWidth={2} className="animate-spin" />
          ) : (
            <Pill size={14} strokeWidth={2} />
          )}
          Take the red pill
        </button>
      )}

      <Steps
        steps={[
          "Install Ollama, then launch it — it lives in the tray and serves on port 11434.",
          `Pull the model once. Roughly 2 GB.`,
          "Leave it running. GUARD talks to it over localhost only.",
        ]}
      />

      <CopyRow command={`ollama pull ${model}`} />

      <a
        href="https://ollama.com/download"
        target="_blank"
        rel="noreferrer noopener"
        className={`mt-4 inline-flex items-center gap-2 rounded-lg border border-[var(--color-danger)]/35 bg-[var(--color-danger)]/[0.08] px-3.5 py-2 text-[12px] font-medium text-snow transition hover:bg-[var(--color-danger)]/[0.14] ${FOCUS_RING}`}
      >
        Download Ollama
        <ExternalLink size={13} strokeWidth={1.5} />
      </a>

      {/* Called out because it is the failure everyone hits second: the pull
          works, then the system drive is full. Ollama reads this at start, so
          it has to be set before `ollama serve`, not after. */}
      <details className="mt-5 rounded-xl border border-hairline bg-white/[0.02] p-3.5">
        <summary
          className={`cursor-pointer text-[12px] text-parchment transition hover:text-snow ${FOCUS_RING}`}
        >
          Short on space on your system drive?
        </summary>
        <p className="mt-2 text-[12px] leading-relaxed text-fog">
          Models land next to your user profile by default. Point{" "}
          <span className="font-mono text-slate">OLLAMA_MODELS</span> at another
          drive <em>before</em> starting Ollama, then pull again:
        </p>
        <CopyRow command="setx OLLAMA_MODELS D:\Ollama\models" />
      </details>
    </ModalShell>
  );
}
