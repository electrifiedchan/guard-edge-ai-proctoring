const HONORIFICS = new Set(["mr", "mrs", "ms", "miss", "dr", "prof", "er", "shri", "smt", "sri"]);
const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "phd", "md", "mba"]);

/** "V. KRISHNAMURTHY" -> "Krishnamurthy" | "dr. anne-marie o'brien" -> "Anne-Marie" */
export function parseFirstName(raw?: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^\p{L}\p{M}\s.'-]/gu, " ")   // keep letters, marks, space, dot, apostrophe, hyphen
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;

  const tokens = cleaned
    .split(" ")
    .map((t) => t.replace(/\.$/, ""))
    .filter((t) => t.length > 0)
    .filter((t) => !HONORIFICS.has(t.toLowerCase().replace(/\./g, "")))
    .filter((t) => !SUFFIXES.has(t.toLowerCase().replace(/\./g, "")));

  // skip leading initials like "V" or "V.K"
  const named = tokens.find((t) => t.replace(/[^\p{L}]/gu, "").length > 2) ?? tokens[0];
  return named ? titleCase(named) : null;
}

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s'-])(\p{L})/gu, (_m, sep, ch) => sep + ch.toUpperCase());
}

/**
 * Two-letter initials for the corner avatar.
 *
 * Prefers first+last ("Aarav Mehta" -> "AM") and falls back to the first two
 * letters of a single token ("Aarav" -> "AA"), never one lonely letter, since a
 * 28px circle with a single glyph reads as a bullet rather than an identity.
 * Returns null for the "there" fallback — a generic name must not become "TH".
 */
export function initialsFrom(raw?: string | null): string | null {
  if (!raw) return null;

  const tokens = raw
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^\p{L}\p{M}\s.'-]/gu, " ")
    .split(/[\s.]+/)
    .map((t) => t.replace(/[^\p{L}\p{M}]/gu, ""))
    .filter((t) => t.length > 0)
    .filter((t) => !HONORIFICS.has(t.toLowerCase()))
    .filter((t) => !SUFFIXES.has(t.toLowerCase()));

  if (tokens.length === 0) return null;
  if (tokens.length === 1) {
    return tokens[0].slice(0, 2).toUpperCase().padEnd(2, tokens[0][0].toUpperCase());
  }
  return (tokens[0][0] + tokens[tokens.length - 1][0]).toUpperCase();
}

export function resolveDisplayName(input: {

  preferredName?: string | null;
  resumeName?: string | null;
  email?: string | null;
}): { name: string; isFallback: boolean; needsConfirm: boolean } {
  const pref = input.preferredName?.trim();
  if (pref) return { name: titleCase(pref), isFallback: false, needsConfirm: false };

  const first = parseFirstName(input.resumeName);
  if (first) return { name: first, isFallback: false, needsConfirm: first.length > 12 };

  const local = input.email?.split("@")[0]?.replace(/[._\d]+/g, " ").trim();
  const fromEmail = parseFirstName(local);
  if (fromEmail) return { name: fromEmail, isFallback: true, needsConfirm: true };

  return { name: "there", isFallback: true, needsConfirm: false };
}
