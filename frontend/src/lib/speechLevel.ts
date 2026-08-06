/**
 * TTS amplitude envelope for the Audio Interrogator waveform.
 *
 * The waveform is supposed to visualise whoever currently holds the turn, but
 * the AI's half was never actually connected: while the interviewer spoke, the
 * ribbons ran a free-running sine that had no relationship to the speech, so it
 * kept undulating through pauses and sat still mid-sentence.
 *
 * It can't be wired the same way as the mic. `speechSynthesis` renders straight
 * to the output device and exposes no MediaStream or AudioNode, so there is no
 * PCM to run through an AnalyserNode — the audio is simply not reachable from
 * script. What the API *does* give us is `onboundary`, which fires as each word
 * begins. That's a real progress signal from the synthesiser, so we reconstruct
 * an envelope from it: every boundary is a fresh syllable-ish attack that decays
 * over roughly how long that word should take to say.
 *
 * Module-level state is deliberate. `window.speechSynthesis` is itself a single
 * global queue — only one utterance can be speaking per document — so a single
 * module mirrors the thing it tracks, and the waveform can read it per animation
 * frame without props being threaded through the page on every word.
 */

let speaking = false;
let lastBoundaryAt = 0;
let lastWordLength = 5;
let boundaryCount = 0;
let speechStartedAt = 0;

/** Sentinel: speaking, but the voice isn't reporting boundaries. */
export const NO_BOUNDARY_DATA = -1;

/** Some voices never fire `onboundary`; wait this long before giving up. */
const BOUNDARY_GRACE_MS = 500;

export function beginSpeech(): void {
  speaking = true;
  boundaryCount = 0;
  lastWordLength = 5;
  speechStartedAt = performance.now();
  lastBoundaryAt = speechStartedAt;
}

export function endSpeech(): void {
  speaking = false;
  boundaryCount = 0;
}

/**
 * @param charLength characters in the word being spoken. Chrome supplies this;
 *   Safari/Firefox often omit it, so callers pass a nominal value instead.
 */
export function noteWordBoundary(charLength: number): void {
  if (!speaking) return;
  lastBoundaryAt = performance.now();
  lastWordLength = Math.max(1, charLength || 5);
  boundaryCount += 1;
}

/**
 * Current TTS amplitude, 0–1.
 *
 * Returns NO_BOUNDARY_DATA when we're speaking but the engine hasn't reported
 * any boundaries past the grace window — remote/network voices in Chrome are
 * the common case. The caller should fall back to synthetic motion rather than
 * flatline, since the AI genuinely is talking; we just can't see the shape.
 */
export function getSpeechEnvelope(): number {
  if (!speaking) return 0;

  if (boundaryCount === 0) {
    return performance.now() - speechStartedAt > BOUNDARY_GRACE_MS
      ? NO_BOUNDARY_DATA
      : 0;
  }

  // Longer words hold longer. ~75ms/char lands close to the 0.92 rate set on
  // the utterance, clamped so neither "a" nor "responsibilities" looks wrong.
  const wordDurationSec = Math.min(0.6, Math.max(0.18, lastWordLength * 0.075));
  const progress = (performance.now() - lastBoundaryAt) / 1000 / wordDurationSec;

  if (progress >= 1) return 0;
  // Sharp attack into a longer decay — how a spoken syllable actually lands.
  return progress < 0.25 ? progress / 0.25 : 1 - (progress - 0.25) / 0.75;
}
