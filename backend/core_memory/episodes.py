"""Episode grain for flagged behaviour.

The problem this solves: `autopsy_flag` is true on EVERY frame while accumulated
risk sits at or above 75, and the telemetry loop samples every 2 s. So one
continuous 20-second look-away wrote ~10 near-identical `moments` rows and ~10
near-identical evidence JPEGs — ten photographs of the same person in the same
position, each presented to them as a separate finding.

That is wrong three ways:
  1. The verdict page cannot group by topic, because the topic occurred once but
     is stored ten times with nothing linking the rows.
  2. It exaggerates. Ten rows reads as ten mistakes; the candidate made one.
  3. It stores ten photographs of a participant's face where one would do. The
     study consent covers evidence frames, so the honest thing is to keep the
     fewest that prove the point.

An EPISODE is one contiguous stretch of one flag kind. It opens on the rising
edge, absorbs every later frame of the same kind, and closes when that kind has
been absent for `gap_sec`. One row, one photo, a real start and end.

The gap is a debounce, not a timeout: a single frame where the phone slips out of
YOLO's view, or the head passes back through centre, must not split one episode
into two. It mirrors GAZE_RESET_DEBOUNCE_SEC in bea.py, which exists for the same
reason at the tier level, and PROP_CLEAR_SWEEPS in edge_main.py, which exists for
the same reason on the object path — "the behaviour stopped" needs more evidence
than "the behaviour started".

This module holds no database handle and does no I/O. It reports what changed and
lets the caller persist it, so it can be tested without a database and so the
writes stay on the caller's background-task queue.
"""

import os
import uuid

# How long a kind must be absent before its episode is considered over.
EPISODE_GAP_SEC = float(os.getenv("BEA_EPISODE_GAP_SEC", "2.0"))


class EpisodeTracker:
    """Collapses per-frame flags into per-episode records.

    Keyed by (session_id, kind): two different flags running at the same time are
    two concurrent episodes, which is the whole point of the concurrent-flag
    refactor in determine_verdict. A phone episode and a head-turn episode
    overlapping in time are two separate findings with two separate durations.
    """

    def __init__(self, gap_sec: float = EPISODE_GAP_SEC):
        self.gap_sec = gap_sec
        # (session_id, kind) -> episode record
        self._open: dict[tuple[str, str], dict] = {}

    def observe(
        self, session_id: str, t: float, active_kinds: list[str]
    ) -> tuple[list[dict], list[dict]]:
        """Record one frame's active flag kinds.

        Returns (opened, closed):
          opened — episodes that began on THIS frame. The caller should write a
                   moment row and capture one evidence image for each; this frame
                   is the one that caused the flag, so it is the honest photo.
          closed — episodes whose kind has now been absent for gap_sec. The caller
                   should update the existing row with the end time, duration and
                   frame count. No new image.
        """
        opened: list[dict] = []
        active = set(active_kinds)

        for kind in active:
            key = (session_id, kind)
            episode = self._open.get(key)
            if episode is None:
                episode = {
                    "moment_id": uuid.uuid4().hex,
                    "session_id": session_id,
                    "kind": kind,
                    "t_start": t,
                    # t_last tracks the last frame that SHOWED the behaviour, not
                    # the last frame seen. An episode's duration must not include
                    # the debounce gap that ended it — that gap is time the
                    # candidate was already fine.
                    "t_last": t,
                    "frame_count": 1,
                }
                self._open[key] = episode
                opened.append(dict(episode))
            else:
                episode["t_last"] = t
                episode["frame_count"] += 1

        closed = self._close_expired(session_id, t, active)
        return opened, closed

    def _close_expired(self, session_id: str, t: float, active: set[str]) -> list[dict]:
        closed: list[dict] = []
        for key, episode in list(self._open.items()):
            if key[0] != session_id or key[1] in active:
                continue
            if t - episode["t_last"] >= self.gap_sec:
                closed.append(self._finalize(key))
        return closed

    def close_session(self, session_id: str) -> list[dict]:
        """Close every open episode for a session.

        Needed because the last episode of a session has no following frame to
        expire it. Without this, a look-away still in progress when the candidate
        clicks stop would keep t_end NULL forever and its duration would be
        unknown — the one episode most likely to matter, since it was never
        recovered from.
        """
        return [self._finalize(key) for key in [k for k in self._open if k[0] == session_id]]

    def close_candidate(self, candidate_id: str) -> list[dict]:
        """Close every open episode across all of one candidate's runs.

        The report is requested with a candidate_id, not the per-run session_id
        that keys these episodes ("{candidate_id}__{rand}"), so the flush that
        happens when the report is generated has to sweep the prefix.
        """
        return [self._finalize(key) for key in self._candidate_keys(candidate_id)]

    def _candidate_keys(self, candidate_id: str) -> list[tuple[str, str]]:
        return [
            k for k in self._open
            if k[0] == candidate_id or k[0].startswith(f"{candidate_id}__")
        ]

    def _finalize(self, key: tuple[str, str]) -> dict:
        episode = self._open.pop(key)
        duration = max(0.0, episode["t_last"] - episode["t_start"])
        return {
            "moment_id": episode["moment_id"],
            "session_id": episode["session_id"],
            "kind": episode["kind"],
            "t_start": episode["t_start"],
            "t_end": episode["t_last"],
            "duration_sec": round(duration, 1),
            "frame_count": episode["frame_count"],
        }

    def open_count(self, session_id: str | None = None) -> int:
        """Diagnostic: how many episodes are currently open."""
        if session_id is None:
            return len(self._open)
        return sum(1 for k in self._open if k[0] == session_id)

    def forget_session(self, session_id: str) -> None:
        """Drop all state for a session without emitting closures."""
        for key in [k for k in self._open if k[0] == session_id]:
            self._open.pop(key, None)

    def forget_candidate(self, candidate_id: str) -> None:
        """Drop state for every run belonging to one candidate.

        Frames are stored under "{candidate_id}__{rand}" (one session_id per run),
        so "clear this candidate's memory" cannot be answered by an exact key
        match — it has to sweep the prefix. Without this, an episode still open
        when the user hits "Clear memory" would stay open, and the next frame of
        the same kind would be absorbed into a stretch that started before the
        reset instead of opening a fresh one.
        """
        for key in self._candidate_keys(candidate_id):
            self._open.pop(key, None)
