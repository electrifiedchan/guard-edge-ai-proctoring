"use client";

import Link from "next/link";
import type { RecentSession } from "@/lib/dashboard";
import { fmtDuration, shortDate } from "@/lib/dashboard";

interface SessionListProps {
  sessions: RecentSession[];
  limit?: number;
}

function composureColor(v: number): string {
  if (v >= 70) return "bg-emerald-500";
  if (v >= 45) return "bg-amber-400";
  return "bg-rose-500";
}

export default function SessionList({ sessions, limit = 5 }: SessionListProps) {
  const shown = sessions.slice(0, limit);

  return (
    <div>
      <ul className="divide-y divide-neutral-800">
        {shown.map((s) => (
          <li key={s.session_id}>
            <Link
              href={`/replay?session=${encodeURIComponent(s.session_id)}`}
              className="flex items-center gap-3 py-3 transition-colors hover:bg-neutral-800/30"
            >
              <div className="w-24 shrink-0">
                <p className="text-sm text-neutral-200">{shortDate(s.started_at)}</p>
                <p className="text-xs tabular-nums text-neutral-500">
                  {fmtDuration(s.duration_s)}
                </p>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div
                    className="h-1.5 w-full max-w-[8rem] overflow-hidden rounded-full bg-neutral-800"
                    role="img"
                    aria-label={`Average composure ${Math.round(s.avg_composure)} out of 100`}
                  >
                    <div
                      className={`h-full rounded-full ${composureColor(s.avg_composure)}`}
                      style={{ width: `${Math.max(0, Math.min(100, s.avg_composure))}%` }}
                    />
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-neutral-400">
                    {Math.round(s.avg_composure)}
                  </span>

                  {s.recovery_count > 0 && (
                    <span
                      className="shrink-0 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[11px] tabular-nums text-emerald-400"
                      title={`${s.recovery_count} recovery moment${s.recovery_count === 1 ? "" : "s"}`}
                    >
                      ↑{s.recovery_count}
                    </span>
                  )}
                </div>

                {s.headline && (
                  <p className="mt-1 truncate text-xs text-neutral-500">{s.headline}</p>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {/* No /sessions index route exists yet, so rather than link nowhere we
          state the count that is hidden. Swap back to a link if that page
          gets built. */}
      {sessions.length > limit && (
        <p className="mt-3 text-xs text-neutral-500">
          +{sessions.length - limit} older session
          {sessions.length - limit === 1 ? "" : "s"}
        </p>
      )}
    </div>
  );
}
