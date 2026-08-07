/**
 * The interviewer personas, in one place.
 *
 * Why this module exists
 * ----------------------
 * `/practice` and `/sentry` each held their own copy of this table, and they had
 * already drifted: practice used theme tokens for the badge colours while sentry
 * still used raw Tailwind shades (emerald-400 / sky-400 / amber-400) that drop to
 * roughly 2:1 contrast once the light theme swaps the surface underneath them.
 *
 * That drift is the mild version. The same pattern has bitten this codebase twice
 * for real — the candidate id hardcoded in both the telemetry writer and the
 * dashboard reader, and the heatmap date format restated in the demo fixture so
 * `?demo=1` faithfully reproduced the bug it should have exposed. So the ids, the
 * labels and the copy live here, and every surface imports them.
 *
 * The ids are a wire contract: they must match `Persona` in
 * `backend/core_memory/conversation_engine.py`, which validates
 * `starting_persona` against that enum and falls back to friendly_hr with a
 * warning on anything it does not recognise.
 */

import { Brain, Target, User } from "lucide-react";

/**
 * The rung the interview opens on. The engine still escalates from here, so this
 * sets where the ramp begins rather than pinning the whole session.
 */
export const PERSONA_OPTIONS = [
  {
    id: "friendly_hr",
    label: "Friendly HR",
    tagline: "Warm open",
    blurb: "Rapport first. Eases in with broad questions before any technical depth.",
    accent: "var(--color-signal)",
    Icon: User,
  },
  {
    id: "curious_peer",
    label: "Curious Peer",
    tagline: "Straight in",
    blurb: "Skips small talk. Opens on your resume's fundamentals and digs a level deeper.",
    accent: "var(--color-info)",
    Icon: Brain,
  },
  {
    id: "skeptical_tech_lead",
    label: "Tech Lead",
    tagline: "Full pressure",
    blurb: "Probing from turn one — scale, tradeoffs, and failure modes.",
    accent: "var(--color-warn)",
    Icon: Target,
  },
] as const;

export type PersonaId = (typeof PERSONA_OPTIONS)[number]["id"];

/** Where the ladder starts when the user has not chosen — matches the backend default. */
export const DEFAULT_PERSONA: PersonaId = "friendly_hr";

/**
 * Badge text for the persona the server reports mid-session. Keyed loosely by
 * string because this reads `data.persona` off the wire: the engine escalates on
 * its own, so it can legitimately name a rung the user did not pick, and an
 * unknown value must render a neutral fallback instead of crashing the header.
 *
 * Colours are theme tokens, not raw Tailwind shades, so the badge keeps its
 * contrast on both the dark canvas and the light theme's white surface.
 */
export const PERSONA_LABELS: Record<string, { label: string; color: string }> = {
  friendly_hr: { label: "Friendly HR", color: "text-[var(--color-signal)]" },
  curious_peer: { label: "Curious Peer", color: "text-[var(--color-info)]" },
  skeptical_tech_lead: { label: "Tech Lead", color: "text-[var(--color-warn)]" },
};
