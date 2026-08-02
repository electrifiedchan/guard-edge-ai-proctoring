"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { initialsFrom, resolveDisplayName } from "@/lib/greeting";
import { getActiveResume } from "@/lib/resumeMemory";
import { cn } from "@/lib/utils";

const PREFERRED_NAME_KEY = "guard.preferredName";
const SESSION_KEY = "guard_session";

/**
 * Corner identity chip that doubles as the way back to /dashboard.
 *
 * Replaces the "← Dashboard" pill that used to sit inline in each page header.
 * A circle with initials is the convention users already read as "me / my
 * account", so it needs no label to be understood, and it stops competing with
 * the primary action on pages where the real CTA is "Start a session".
 *
 * Identity comes from resolveDisplayName — the same path /sentry and /dashboard
 * use (preferred name → resume filename). Deliberately not a second
 * name-resolution implementation.
 */

/** localStorage/sessionStorage both throw in some private modes. */
function safeRead(store: "local" | "session", key: string): string | null {
  try {
    return (store === "local" ? window.localStorage : window.sessionStorage).getItem(key);
  } catch {
    return null;
  }
}

function readIdentity(): { name: string; initials: string | null } {
  const preferred = safeRead("local", PREFERRED_NAME_KEY);

  let resumeName: string | null = null;
  const session = safeRead("session", SESSION_KEY);
  if (session) {
    try {
      resumeName = (JSON.parse(session) as { file_name?: string }).file_name ?? null;
    } catch {
      // malformed session blob — fall through to the remembered resume
    }
  }
  resumeName = resumeName ?? getActiveResume()?.file_name ?? null;

  const cleaned = resumeName
    ? resumeName.replace(/\.(pdf|docx?|txt)$/i, "").replace(/[_-]+/g, " ")
    : null;

  const resolved = resolveDisplayName({ preferredName: preferred, resumeName: cleaned });

  // Prefer full-name initials ("Aarav Mehta" -> AM). resolveDisplayName returns
  // only a first name, which would collapse to "AA" and lose the surname.
  const initials = initialsFrom(preferred ?? cleaned) ?? initialsFrom(resolved.name);

  return { name: resolved.name, initials: resolved.name === "there" ? null : initials };
}

export default function DashboardButton({
  className,
  position = "static",
}: {
  className?: string;
  /**
   * "fixed" parks the chip in the viewport's top-right for immersive pages
   * (/sentry, /practice) that have no header row to sit in. "static" lets a
   * page header place it.
   */
  position?: "static" | "fixed";
}) {
  // Storage is client-only; resolving during render would desync hydration.
  const [identity, setIdentity] = useState<{ name: string; initials: string | null } | null>(null);

  useEffect(() => {
    setIdentity(readIdentity());
  }, []);

  const initials = identity?.initials ?? "GD";
  const label = identity?.initials
    ? `Back to dashboard — ${identity.name}`
    : "Back to dashboard";

  return (
    <Link
      href="/dashboard"
      aria-label={label}
      title={label}
      className={cn(
        // Filled indigo→violet avatar, not a surface-coloured outline chip.
        // The product's only accent is emerald (every CTA, incl. "Start a
        // session"), so a solid indigo reads unmistakably as "me / my account"
        // and never competes with an action. Indigo #6366f1 already exists in
        // the palette as the gaze "away" segment, so it's on-brand, not foreign.
        "group relative inline-grid h-10 w-10 shrink-0 place-items-center rounded-full",
        "bg-[linear-gradient(140deg,#818cf8_0%,#6366f1_45%,#7c3aed_100%)]",
        "text-[12px] font-bold tracking-wide text-white",
        "ring-1 ring-white/20 ring-inset",
        "shadow-[0_2px_10px_rgba(99,102,241,0.45)]",
        "transition-transform duration-150 hover:scale-105 active:scale-95",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80",
        "focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-canvas)]",
        position === "fixed" && "fixed right-5 top-5 z-40",
        className,
      )}
    >
      {/* Glossy top highlight so it reads as a raised pill, not a flat dot. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-1 top-1 h-1/3 rounded-full bg-white/25 blur-[2px]"
      />
      {/* Two letters carry no meaning for assistive tech; the aria-label does. */}
      <span aria-hidden="true" className="relative">{initials}</span>
    </Link>
  );
}
