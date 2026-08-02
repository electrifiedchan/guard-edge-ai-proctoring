"use client";

import Link from "next/link";
import type { FocusArea as FocusAreaData } from "@/lib/dashboard";

interface FocusAreaProps {
  focus: FocusAreaData;
}

export default function FocusArea({ focus }: FocusAreaProps) {
  return (
    <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/20 p-5">
      <p className="text-xs uppercase tracking-[0.3em] text-emerald-400/80">Work on this next</p>

      <h3 className="mt-3 text-base font-medium text-neutral-100">{focus.title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-neutral-400">{focus.detail}</p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {/* /upload rather than /session?focus=: no /session route exists, and
            /practice does not read a focus param, so the query string would be
            dead weight. Routed to the real session entry point instead. */}
        <Link
          href="/upload"
          className="rounded-lg bg-emerald-500 px-3.5 py-2 text-sm font-medium text-neutral-950 transition-colors hover:bg-emerald-400"
        >
          Practice this →
        </Link>

        {focus.cta_session_id && (
          <Link
            href={`/replay?session=${encodeURIComponent(focus.cta_session_id)}`}
            className="text-sm text-neutral-400 underline-offset-4 transition-colors hover:text-neutral-200 hover:underline"
          >
            See the moment
          </Link>
        )}
      </div>
    </div>
  );
}
