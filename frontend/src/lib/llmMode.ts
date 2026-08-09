/**
 * LLM mode — which brain answers, and where it runs.
 *
 * Why this exists
 * ---------------
 * The backend picks its LLM backend from `LLM_MODE` in `backend/.env`, read
 * once at process start (see `backend/core_memory/llm_config.py`). That is fine
 * for a server you own, and useless for a person standing in front of a laptop
 * who wants the 8B cloud model for one session and the sovereign local one for
 * the next — changing it meant editing a dotfile and restarting Python.
 *
 * So the backend grew runtime override endpoints, and this module is the client
 * half: it pushes the decision to the server, which is the only place it takes
 * effect, and keeps a local copy so the chooser paints without a flash.
 *
 * The vocabulary here is deliberately the same set of strings `llm_config.py`
 * accepts — `cloud` / `ollama` for the mode, `nvidia` / `groq` for the vendor.
 * Two names for one concept is how a frontend and a backend end up disagreeing
 * about which mode is on. This file previously posted `"nvidia"` as a *mode*,
 * which the backend rejects with a 400, so the red pill could never commit; the
 * split below (mode says where it runs, provider says whose cloud) is what the
 * server has always actually wanted.
 */

const API = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

/** Persisted so the chooser paints the current pill before the server replies. */
const MODE_KEY = "guard_llm_mode";
/** Set once the user has actually chosen. Absence is what makes them "new". */
const CHOSEN_KEY = "guard_llm_mode_chosen";

/** Where the model runs. Matches `set_mode` in llm_config.py. */
export type LlmMode = "cloud" | "ollama";

/** Whose cloud, when the mode is `cloud`. Matches CLOUD_PROVIDERS. */
export type CloudProvider = "nvidia" | "groq";

export interface ModeCopy {
  mode: LlmMode;
  /** Which pill in the scene. Drives colour and hotspot position. */
  pill: "online" | "offline";
  label: string;
  tagline: string;
  model: string;
  /**
   * The one sentence this choice is actually about, shown large and in the
   * pill's own colour. Both pills state their cost or their guarantee outright
   * rather than letting it hide among the bullets — a privacy decision that
   * needs squinting to read is not a decision the user made.
   */
  truth: string;
  pros: string[];
  cons: string[];
}

/**
 * The two choices, as the user meets them.
 *
 * Red is local and blue is the cloud, following what the pills mean in the
 * film: the hero takes red, and red is the one that shows you the machine you
 * are actually sitting in. Here that is Sovereign Mode — the resume stays on
 * this device. Blue is the comfortable default where someone else's server
 * does the thinking.
 *
 * Note this inverts the usual GUARD rule that red means a failing score — here
 * red marks the choice we would recommend. It is a Matrix reference carrying no
 * severity meaning, which is the one sanctioned exception; do not copy the
 * pattern into product surfaces.
 *
 * `pill` is the film's colour, not a connectivity word — `online`/`offline`
 * name which hotspot in the scene, and the scene's red pill sits in Morpheus's
 * left hand. The mode's own connectivity is `mode`, one field up.
 */
export const MODES: Record<LlmMode, ModeCopy> = {
  cloud: {
    mode: "cloud",
    pill: "offline",
    label: "Online",
    tagline: "Cloud model · needs an API key",
    model: "llama-3.1-8b",
    // Stated flat, in the pill's own blue, at the top of the card. The earlier
    // draft filed this under `cons` as a grey "Your resume text is sent to
    // NVIDIA" — technically present, and easy to skip past on the way to the
    // convenient choice. It is not a footnote; it is the whole trade.
    truth: "Your resume leaves this machine.",
    pros: [
      "8B model — sharper, more specific questions",
      "No VRAM cost, so detection keeps the GPU",
      "Nothing to install or download",
    ],
    cons: [
      "Needs a free API key — takes about a minute",
      "Needs a working internet connection",
    ],
  },
  ollama: {
    mode: "ollama",
    pill: "online",
    label: "Offline",
    tagline: "Local Ollama · sovereign",
    model: "qwen2.5:3b",
    truth: "Nothing leaves this machine.",
    pros: [
      "Your resume never touches a network",
      "Works with the cable unplugged",
      "No API key, no quota, no bill",
    ],
    cons: [
      // Not "3B model — blunter than the 8B": which model runs here is whatever
      // OLLAMA_MODEL points at, and how large that can go is set by the VRAM
      // left after detection takes its share. Naming one size dates the copy
      // the moment someone switches model, and misleads everyone whose card
      // could carry more.
      "Smaller models ask blunter questions — your VRAM sets the ceiling",
      "Needs Ollama installed and running",
    ],
  },
};

/**
 * Which vendor a pasted key belongs to, by prefix.
 *
 * Purely a convenience: the modal's tabs already say which provider the user
 * picked, so this only exists to catch the mismatch where someone is on the
 * NVIDIA tab and pastes a `gsk_…`. Returns null when the prefix matches
 * nothing known, which is not an error — an unrecognised prefix still gets
 * saved, because vendors change their formats and a hard reject here would
 * lock the user out of a key that works.
 */
export function detectProvider(key: string): CloudProvider | null {
  const k = key.trim();
  if (k.startsWith("nvapi-")) return "nvidia";
  if (k.startsWith("gsk_")) return "groq";
  return null;
}

export interface ProviderInfo {
  label: string;
  model: string;
  /** Where to go and get a key. */
  console: string;
  prefix: string;
  /** True when a key is already installed for this provider. */
  configured: boolean;
  /** `nvapi-••••3f2a`. Never the raw key. */
  masked: string;
}

export interface LlmStatus {
  /** What the backend will actually use for the next call. */
  effective: LlmMode;
  /** Whose cloud is selected, whether or not cloud is in effect. */
  provider: CloudProvider;
  /** Resolved model name for the effective backend. */
  model: string;
  /** Whether a local Ollama answered a probe just now. */
  ollamaReachable: boolean;
  ollamaModel: string;
  providers: Record<CloudProvider, ProviderInfo>;
}

function normalise(data: Record<string, unknown>): LlmStatus {
  const providers = (data.providers ?? {}) as Record<string, ProviderInfo>;
  return {
    effective: data.effective === "ollama" ? "ollama" : "cloud",
    provider: data.provider === "groq" ? "groq" : "nvidia",
    model: String(data.model ?? ""),
    ollamaReachable: Boolean(data.ollama_reachable),
    ollamaModel: String(data.ollama_model ?? ""),
    providers: providers as Record<CloudProvider, ProviderInfo>,
  };
}

/** Asks the backend what it is currently using. */
export async function fetchStatus(signal?: AbortSignal): Promise<LlmStatus> {
  const res = await fetch(`${API}/api/v1/llm/mode`, { signal });
  if (!res.ok) throw new Error(`mode fetch failed: ${res.status}`);
  return normalise(await res.json());
}

/**
 * Switches the backend over, then remembers it locally.
 *
 * Order matters: the local copy is only written after the server confirms.
 * Writing it first would leave the UI cheerfully showing "Offline / sovereign"
 * while the backend carried on shipping resumes to the cloud — on a privacy
 * switch, a lie is worse than an error.
 */
export async function selectMode(
  mode: LlmMode,
  provider?: CloudProvider,
): Promise<LlmStatus> {
  const res = await fetch(`${API}/api/v1/llm/mode`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, provider: mode === "cloud" ? provider : null }),
  });
  if (!res.ok) throw new Error((await detail(res)) || `mode switch failed: ${res.status}`);
  const status = normalise(await res.json());
  remember(mode);
  return status;
}

/** Saves a key for one provider. Resolves with the refreshed status. */
export async function saveKey(
  provider: CloudProvider,
  key: string,
): Promise<LlmStatus> {
  const res = await fetch(`${API}/api/v1/llm/key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, key }),
  });
  if (!res.ok) throw new Error((await detail(res)) || `key save failed: ${res.status}`);
  return normalise(await res.json());
}

/** One row of the local-model picker. Mirrors ollama_model_guide.MODELS. */
export interface OllamaModelOption {
  /** Exact Ollama tag — also the `ollama pull` argument. */
  tag: string;
  sizeGb: number;
  vramGb: number;
  params: string;
  why: string;
  /** A caveat worth reading before picking. Null when there isn't one. */
  avoid: string | null;
  /** Already pulled, so switching is instant and works offline. */
  installed: boolean;
  /** Fits the VRAM left after GUARD's reserve. True everywhere when no GPU. */
  fits: boolean;
}

export interface ModelReport {
  /** Total on the card. Null when no GPU was found — not an error. */
  vramGb: number | null;
  /** What GUARD's own detection and transcription hold during a session. */
  reserveGb: number;
  vramGb_usable: number | null;
  installed: string[];
  models: OllamaModelOption[];
}

/**
 * What this machine can run locally, and what it already has.
 *
 * Its own endpoint rather than part of `fetchStatus` because it shells out to
 * nvidia-smi and makes a second hop to Ollama — too slow to sit on the path
 * every chooser visit takes.
 */
export async function fetchModelReport(signal?: AbortSignal): Promise<ModelReport> {
  const res = await fetch(`${API}/api/v1/llm/models`, { signal });
  if (!res.ok) throw new Error(`model report failed: ${res.status}`);
  const d = await res.json();
  return {
    vramGb: typeof d.vram_gb === "number" ? d.vram_gb : null,
    reserveGb: Number(d.reserve_gb ?? 0),
    vramGb_usable: typeof d.usable_gb === "number" ? d.usable_gb : null,
    installed: Array.isArray(d.installed) ? d.installed : [],
    models: (d.models ?? []).map(
      (m: Record<string, unknown>): OllamaModelOption => ({
        tag: String(m.tag ?? ""),
        sizeGb: Number(m.size_gb ?? 0),
        vramGb: Number(m.vram_gb ?? 0),
        params: String(m.params ?? ""),
        why: String(m.why ?? ""),
        avoid: typeof m.avoid === "string" ? m.avoid : null,
        installed: Boolean(m.installed),
        fits: Boolean(m.fits),
      }),
    ),
  };
}

/** Points local mode at a different Ollama model. Resolves with fresh status. */
export async function selectOllamaModel(tag: string): Promise<LlmStatus> {
  const res = await fetch(`${API}/api/v1/llm/model`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tag }),
  });
  if (!res.ok) throw new Error((await detail(res)) || `model switch failed: ${res.status}`);
  return normalise(await res.json());
}

/**
 * Pulls the human-readable reason out of a FastAPI error body.
 *
 * The key endpoint answers 400 with `{"detail": "That does not look like an
 * API key — …"}`, written to be shown to the user verbatim. Without this the
 * modal would surface the raw JSON, and the one message that explains what
 * they pasted wrong would arrive wrapped in braces.
 */
async function detail(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return typeof body?.detail === "string" ? body.detail : "";
  } catch {
    return "";
  }
}

/** Reads the remembered choice. Returns null when the user has never picked. */
export function readStoredMode(): LlmMode | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(MODE_KEY);
    return raw === "cloud" || raw === "ollama" ? raw : null;
  } catch {
    // Private-browsing / storage-disabled. Not fatal: the server still holds
    // the real mode, this cache only exists to avoid a first-paint flicker.
    return null;
  }
}

/** True once the user has been through the chooser at least once. */
export function hasChosenMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(CHOSEN_KEY) === "1";
  } catch {
    return false;
  }
}

function remember(mode: LlmMode) {
  try {
    window.localStorage.setItem(MODE_KEY, mode);
    window.localStorage.setItem(CHOSEN_KEY, "1");
  } catch {
    /* see readStoredMode */
  }
}
