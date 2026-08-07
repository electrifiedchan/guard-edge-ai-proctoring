"use client";

import { useId } from "react";
import { motion } from "framer-motion";
import { PERSONA_OPTIONS, type PersonaId } from "@/lib/personas";

/**
 * The pre-engage interviewer choice, shared by `/practice` (pre-interview card)
 * and the sentry scope's idle panel. Both had to render the same three options;
 * the constants live in `lib/personas.ts` and the markup lives here so neither
 * gets a second copy that can drift.
 *
 * `compact` drops the blurbs for the scope overlay, where the picker sits inside
 * a 560px card on top of the video feed and the long copy crowds it out.
 */
type PersonaPickerProps = {
  value: PersonaId;
  onChange: (id: PersonaId) => void;
  compact?: boolean;
};

export default function PersonaPicker({ value, onChange, compact = false }: PersonaPickerProps) {
  // Two pickers sharing one layoutId would make framer animate the dot between
  // them. Only one mounts per page today, but scoping it costs nothing.
  const checkId = useId();

  return (
    // Full class strings, not `gap-${...}`: Tailwind extracts by scanning source
    // text, so an interpolated class name compiles to no rule at all.
    <div
      role="radiogroup"
      aria-label="Interviewer style"
      className={`grid sm:grid-cols-3 ${compact ? "gap-2" : "gap-3"}`}
    >
      {PERSONA_OPTIONS.map(({ id, label, tagline, blurb, accent, Icon }) => {
        const selected = value === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(id)}
            style={
              {
                borderColor: selected ? accent : undefined,
                // color-mix keeps the tint derived from the same token the theme
                // already swapped, so the wash works on the dark canvas and the
                // light surface without maintaining a second palette.
                backgroundColor: selected
                  ? `color-mix(in srgb, ${accent} 10%, transparent)`
                  : undefined,
              } as React.CSSProperties
            }
            className={`group relative text-left rounded-lg border transition-all cursor-pointer
              focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-signal)]
              ${compact ? "p-2.5" : "p-4"}
              ${
                selected
                  ? "shadow-sm"
                  : "border-[var(--color-hairline)] bg-[var(--color-surface)] hover:border-[var(--color-hairline-strong)]"
              }`}
          >
            <div className="flex items-center gap-2">
              <Icon
                size={compact ? 13 : 15}
                style={{ color: selected ? accent : undefined }}
                className={selected ? "" : "text-[var(--color-slate)]"}
              />
              <span
                className={`font-semibold text-[var(--color-snow)] ${
                  compact ? "text-[12px]" : "text-sm"
                }`}
              >
                {label}
              </span>
              {selected && (
                <motion.span
                  layoutId={`persona-check-${checkId}`}
                  className="ml-auto w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: accent }}
                />
              )}
            </div>

            <span
              className={`inline-block font-medium uppercase tracking-wider ${
                compact ? "mt-1 text-[9px]" : "mt-2 text-[10px]"
              }`}
              style={{ color: selected ? accent : undefined }}
            >
              <span className={selected ? "" : "text-[var(--color-fog)]"}>{tagline}</span>
            </span>

            {!compact && (
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-slate)]">{blurb}</p>
            )}
          </button>
        );
      })}
    </div>
  );
}
