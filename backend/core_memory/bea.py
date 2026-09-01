import os
import time
import asyncio
from typing import Dict, Any

CRITICAL_BUFFER_SIZE = 5     # Last N frames considered
CRITICAL_THRESHOLD = 3       # Confirm lockout only when N-of-M frames are critical
MULTIPLE_FACES_THRESHOLD = int(os.getenv("BEA_MULTIPLE_FACES_THRESHOLD", "2"))
NO_FACE_THRESHOLD = int(os.getenv("BEA_NO_FACE_THRESHOLD", "3"))

# --- Wall-clock duration tiers (seconds, env-configurable) ---
# DOWN = looking at desk/lap. Lenient by default since keyboards/notes are legitimate.
DOWN_SOFT_SEC = float(os.getenv("BEA_DOWN_SOFT_SEC", "7"))
DOWN_WARN_SEC = float(os.getenv("BEA_DOWN_WARN_SEC", "10"))
DOWN_HARD_SEC = float(os.getenv("BEA_DOWN_HARD_SEC", "15"))

# SIDE = horizontal head turn. Stricter — looking at another person/screen is higher risk.
SIDE_SOFT_SEC = float(os.getenv("BEA_SIDE_SOFT_SEC", "5"))
SIDE_WARN_SEC = float(os.getenv("BEA_SIDE_WARN_SEC", "8"))
SIDE_HARD_SEC = float(os.getenv("BEA_SIDE_HARD_SEC", "12"))

# Single-frame glance up does NOT reset the timer; only a sustained STRAIGHT does.
GAZE_RESET_DEBOUNCE_SEC = float(os.getenv("BEA_RESET_DEBOUNCE_SEC", "2.0"))

# Risk contribution per tier (0..100 scale)
TIER_SOFT_PENALTY = 20
TIER_WARN_PENALTY = 50
TIER_HARD_PENALTY = 100

# Interpolate the live penalty between tier thresholds instead of stepping.
#
# _tier_for used to return a flat penalty per band, so a candidate looking away
# sat at exactly 20% for three seconds, jumped to 50%, sat there, then jumped to
# 100%. The ring showed nothing while the timer was actually running, which reads
# as a frozen or broken meter — and the moment it finally moved it moved 30
# points, which reads as an overreaction to nothing.
#
# With this on, the penalty rises smoothly with elapsed seconds toward the next
# tier's value, so the number the candidate sees tracks the thing being measured.
# The tier INDEX and the committed historical events are unchanged: escalation
# still happens at the thresholds, only the displayed number moves continuously.
PROGRESSIVE_RISK = os.getenv("BEA_PROGRESSIVE_RISK", "1") != "0"

# How long a CONFIRMED critical keeps the LIVE risk meter pinned at 100 after it
# was last seen. This governs ONLY the live composure number; the permanent
# record — critical_flags, peak_risk, the autopsy rows — is never touched by it.
#
# It exists because the pin used to be permanent. `_calculate_risk` forced risk
# to 100 whenever critical_flags was non-empty, and that list is only ever
# emptied by a full reset. The BEA identity is a stable resume_<hash> that
# outlives page reloads, so a SINGLE transient critical — a false phone box, a
# bystander's face at the frame edge, or the two or three no-face frames every
# camera emits before it acquires the candidate at Engage — latched the meter at
# COMPOSURE 0% / SEVERE for the rest of the run AND every later run under that
# resume, until the user manually hit "Clear memory". An actively-ongoing
# condition (a second face still in shot) stays pinned regardless of this window;
# what decays is only the TAIL after the evidence has gone.
CRITICAL_HOLD_SEC = float(os.getenv("BEA_CRITICAL_HOLD_SEC", "30"))


class BehavioralEventAccumulator:
    def __init__(self, window_size_seconds: int = 300):
        self.window_size = window_size_seconds
        self.memory: Dict[str, Dict[str, Any]] = {}
        self.lock = asyncio.Lock()

    def _fresh_state(self) -> Dict[str, Any]:
        return {
            "events": [],
            "is_locked": False,
            "critical_flags": [],
            "critical_buffer": [],
            "pending_critical_reasons": [],
            "multiple_faces_streak": 0,
            "no_face_streak": 0,
            "multiple_faces_confirmed": False,
            "no_face_confirmed": False,
            # Wall-clock duration trackers (None = not currently in that gaze state)
            "down_started_at": None,
            "side_started_at": None,
            "straight_started_at": None,
            # Highest tier already committed to historical events for the active stretch
            "down_recorded_tier": 0,
            "side_recorded_tier": 0,
            # Last-touched wall-clock timestamp; cleanup uses this, NOT events emptiness
            "last_activity": time.time(),
            # Highest risk this session ever reached. Never decays.
            #
            # risk_score is deliberately transient: events age out of the sliding
            # window and the live tier penalty vanishes the moment the candidate
            # looks back, which is correct for a LIVE meter. It is wrong for a
            # report. A session that peaked at 100% read as 0% by the time the
            # verdict was generated, so the page said "peak risk 0%" about a run
            # that had just been flagged — and the candidate watched the number
            # climb to 100 and then fall to nothing, which looks like the system
            # forgot. This is the number the report quotes.
            "peak_risk": 0,
            "peak_risk_at": None,
            # Wall-clock of the most recent CONFIRMED critical. The LIVE risk pin
            # keys off this (see _calculate_risk) so a past incident stops forcing
            # 100% once it has aged past CRITICAL_HOLD_SEC. None = none yet.
            "last_critical_at": None,
        }

    async def _ensure_candidate(self, candidate_id: str):
        if candidate_id not in self.memory:
            self.memory[candidate_id] = self._fresh_state()

    async def record_critical_signal(
        self,
        candidate_id: str,
        is_critical: bool,
        reason: str = "",
        instant: bool = False,
        signal_type: str | None = None,
    ) -> dict:
        """Confirm critical evidence using rules appropriate to each signal.

        Multiple faces require two consecutive samples; no face requires three.
        Their state is separate, so alternating failures cannot combine into a
        misleading confirmation. Other ambiguous signals retain the legacy
        rolling 3-of-5 buffer.

        `instant=True` bypasses confirmation and accepts this frame alone. Use it
        for unambiguous physical evidence such as a phone in shot.

        Returns:
            {confirmed, count, threshold, window, pending_reasons}
            confirmed=True means the caller should log the violation.
        """
        async with self.lock:

            await self._ensure_candidate(candidate_id)
            state = self.memory[candidate_id]
            state["last_activity"] = time.time()

            if signal_type in {"multiple_faces", "no_face"}:
                active_key = f"{signal_type}_streak"
                confirmed_key = f"{signal_type}_confirmed"
                other_key = (
                    "no_face_streak"
                    if signal_type == "multiple_faces"
                    else "multiple_faces_streak"
                )
                other_confirmed_key = (
                    "no_face_confirmed"
                    if signal_type == "multiple_faces"
                    else "multiple_faces_confirmed"
                )
                state[active_key] = state[active_key] + 1 if is_critical else 0
                state[other_key] = 0
                state[other_confirmed_key] = False
                threshold = (
                    MULTIPLE_FACES_THRESHOLD
                    if signal_type == "multiple_faces"
                    else NO_FACE_THRESHOLD
                )
                count = state[active_key]
                newly_confirmed = (
                    is_critical and count >= threshold and not state[confirmed_key]
                )
                if newly_confirmed:
                    state[confirmed_key] = True
                return {
                    "confirmed": newly_confirmed,
                    "active_confirmed": state[confirmed_key],
                    "count": count,
                    "threshold": threshold,
                    "window": threshold,
                    "instant": False,
                    "pending_reasons": [reason] if is_critical and reason else [],
                }

            if not is_critical:
                state["multiple_faces_streak"] = 0
                state["no_face_streak"] = 0
                state["multiple_faces_confirmed"] = False
                state["no_face_confirmed"] = False

            state["critical_buffer"].append(bool(is_critical))
            if is_critical and reason:
                state["pending_critical_reasons"].append(reason)

            # Slide the window
            if len(state["critical_buffer"]) > CRITICAL_BUFFER_SIZE:
                state["critical_buffer"] = state["critical_buffer"][-CRITICAL_BUFFER_SIZE:]
            if len(state["pending_critical_reasons"]) > CRITICAL_BUFFER_SIZE:
                state["pending_critical_reasons"] = state["pending_critical_reasons"][-CRITICAL_BUFFER_SIZE:]

            # Decay reasons when the latest frame is clean (prevents stale reasons lingering)
            if not is_critical and not any(state["critical_buffer"][-2:]):
                state["pending_critical_reasons"] = []

            count = sum(1 for v in state["critical_buffer"] if v)

            if instant and is_critical:
                # Report the window honestly as 1-of-1 so the UI doesn't render a
                # "2/3" progress label for something that was already decided.
                return {
                    "confirmed": True,
                    "count": 1,
                    "threshold": 1,
                    "window": 1,
                    "instant": True,
                    "pending_reasons": [reason] if reason else list(state["pending_critical_reasons"]),
                }

            confirmed = count >= CRITICAL_THRESHOLD

            return {
                "confirmed": confirmed,
                "count": count,
                "threshold": CRITICAL_THRESHOLD,
                "window": CRITICAL_BUFFER_SIZE,
                "instant": False,
                "pending_reasons": list(state["pending_critical_reasons"])
            }

    async def record_violation(self, candidate_id: str, reason: str = "") -> dict:
        """Log a confirmed critical violation and return a max-risk packet WITHOUT
        latching the session shut.

        `trigger_fatal_lockout` sets is_locked, and every later `record_telemetry`
        call short-circuits on that flag — so the first phone sighting froze gaze
        tracking for the rest of the interview and the final report had nothing to
        show after that point. The violation still needs recording; it just must not
        take the session down with it. The flag is permanent in `critical_flags`, so
        the verdict page can still report it.
        """
        async with self.lock:
            await self._ensure_candidate(candidate_id)
            state = self.memory[candidate_id]
            now = time.time()
            state["last_activity"] = now

            if reason and reason not in state["critical_flags"]:
                state["critical_flags"].append(reason)

            # Counts as a hard event so risk stays elevated after the object leaves.
            state["events"].append(now)
            # Arms the live risk pin. Risk is held at 100 for CRITICAL_HOLD_SEC
            # from here; a phone re-sighted or a face incident that keeps
            # re-confirming refreshes it, while a one-off blip is allowed to cool.
            state["last_critical_at"] = now

            return self._stamp_peak(candidate_id, {
                "candidate_id": candidate_id,
                "risk_score": 100,
                "violation_count": len(state["events"]),
                "critical_flags": list(state["critical_flags"]),
                "intervention_level": "SEVERE_VIOLATION_LOGGED",
                "is_locked": False,
                "autopsy_flag": True,
            })

    async def trigger_fatal_lockout(self, candidate_id: str, reason: str = "") -> dict:
        """Logs a fatal-level violation silently (Mobile Phone / Tab Switch).
        Changes state to locked so it permanently stays locked until reset.

        Retained for callers that genuinely want to end a session. The live
        interview path uses `record_violation` instead, so a flag no longer
        blinds the remainder of the run.
        """
        async with self.lock:
            await self._ensure_candidate(candidate_id)
            self.memory[candidate_id]["is_locked"] = True
            self.memory[candidate_id]["critical_flags"].append(reason)
            return self._generate_locked_state(candidate_id)


    # --- Wall-clock tiered telemetry (replaces frame-counted heuristic) ---
    async def record_telemetry(self, candidate_id: str, gaze: str) -> dict:
        """Wall-clock duration-based escalation. Single-frame glances are ignored;
        only sustained DOWN/SIDE accumulates risk through soft → warn → hard tiers."""
        async with self.lock:
            await self._ensure_candidate(candidate_id)
            state = self.memory[candidate_id]

            if state["is_locked"]:
                return self._generate_locked_state(candidate_id)

            now = time.time()
            state["last_activity"] = now
            live_state = "STRAIGHT"
            live_duration = 0.0
            live_tier = 0
            live_penalty = 0
            next_threshold_sec = None

            if gaze == "DOWN":
                if state["down_started_at"] is None:
                    state["down_started_at"] = now
                    state["down_recorded_tier"] = 0
                state["side_started_at"] = None
                state["side_recorded_tier"] = 0
                state["straight_started_at"] = None

                live_state = "DOWN"
                live_duration = now - state["down_started_at"]
                live_tier, live_penalty, next_threshold_sec = self._tier_for(
                    live_duration, DOWN_SOFT_SEC, DOWN_WARN_SEC, DOWN_HARD_SEC
                )
                self._commit_tier_event(state, "down_recorded_tier", live_tier, now)

            elif gaze == "SIDE_OR_UP":
                if state["side_started_at"] is None:
                    state["side_started_at"] = now
                    state["side_recorded_tier"] = 0
                state["down_started_at"] = None
                state["down_recorded_tier"] = 0
                state["straight_started_at"] = None

                live_state = "SIDE"
                live_duration = now - state["side_started_at"]
                live_tier, live_penalty, next_threshold_sec = self._tier_for(
                    live_duration, SIDE_SOFT_SEC, SIDE_WARN_SEC, SIDE_HARD_SEC
                )
                self._commit_tier_event(state, "side_recorded_tier", live_tier, now)

            else:  # STRAIGHT — debounce reset so single-frame glances don't clear the timer
                if state["straight_started_at"] is None:
                    state["straight_started_at"] = now
                if now - state["straight_started_at"] >= GAZE_RESET_DEBOUNCE_SEC:
                    state["down_started_at"] = None
                    state["side_started_at"] = None
                    state["down_recorded_tier"] = 0
                    state["side_recorded_tier"] = 0

            # Sliding-window GC for historical events
            cutoff = now - self.window_size
            state["events"] = [t for t in state["events"] if t > cutoff]

            packet = self._calculate_risk(candidate_id, state["events"], now)
            # Live duration penalty floor — risk never drops below current sustained tier
            if live_penalty > packet["risk_score"]:
                packet["risk_score"] = live_penalty
                packet["intervention_level"], packet["autopsy_flag"] = self._level_for(live_penalty)
                # Re-stamp: _calculate_risk already ratcheted the peak against the
                # windowed score, and this line just raised the score above it.
                # Without this the peak would miss every rise that came from a
                # sustained look-away rather than from committed events — which is
                # most of them.
                self._stamp_peak(candidate_id, packet)

            packet["gaze_state"] = live_state
            packet["gaze_duration_sec"] = round(live_duration, 1)
            packet["gaze_tier"] = live_tier  # 0=clear, 1=soft, 2=warn, 3=hard
            packet["gaze_next_threshold_sec"] = (
                round(next_threshold_sec, 1) if next_threshold_sec is not None else None
            )
            return packet

    @staticmethod
    def _tier_for(duration: float, soft: float, warn: float, hard: float):
        """Maps a sustained-gaze duration to (tier, risk_penalty, seconds_to_next_tier).

        The tier index is a hard band — escalation and event commits key off it.
        The penalty is interpolated within the band when PROGRESSIVE_RISK is on, so
        the displayed number climbs with the seconds actually elapsed rather than
        sitting still and then leaping 30 points at a threshold.
        """
        if duration < soft:
            penalty = (
                int(TIER_SOFT_PENALTY * (duration / soft))
                if PROGRESSIVE_RISK and soft > 0
                else 0
            )
            return 0, penalty, soft - duration
        if duration < warn:
            penalty = (
                TIER_SOFT_PENALTY
                + int((TIER_WARN_PENALTY - TIER_SOFT_PENALTY) * ((duration - soft) / (warn - soft)))
                if PROGRESSIVE_RISK and warn > soft
                else TIER_SOFT_PENALTY
            )
            return 1, penalty, warn - duration
        if duration < hard:
            penalty = (
                TIER_WARN_PENALTY
                + int((TIER_HARD_PENALTY - TIER_WARN_PENALTY) * ((duration - warn) / (hard - warn)))
                if PROGRESSIVE_RISK and hard > warn
                else TIER_WARN_PENALTY
            )
            return 2, penalty, hard - duration
        return 3, TIER_HARD_PENALTY, None

    @staticmethod
    def _commit_tier_event(state: dict, key: str, tier: int, now: float):
        """Commits one historical event per tier crossing so risk persists through brief recoveries."""
        last = state.get(key, 0)
        if tier > last:
            for _ in range(tier - last):
                state["events"].append(now)
            state[key] = tier

    @staticmethod
    def _level_for(risk_score: int):
        """Maps numeric risk to (intervention_level, autopsy_flag)."""
        if risk_score >= 100:
            return "SEVERE_VIOLATION_LOGGED", True
        if risk_score >= 75:
            return "HARD_WARNING", True
        if risk_score >= 40:
            return "WARNING_LOGGED", False
        if risk_score >= 20:
            return "SOFT_WARNING", False
        return "CLEAR", False

    def _stamp_peak(self, candidate_id: str, packet: dict) -> dict:
        """Ratchet the session peak up to this packet's risk and report it.

        Called at EVERY point a packet leaves the accumulator, because risk is
        assembled in several places (the sliding window, the live tier floor, a
        confirmed critical, a lockout) and a peak that only some of them updated
        would be silently wrong for exactly the sessions that mattered most.

        Monotonic by construction: max() only. Nothing lowers a peak except
        reset_candidate, which throws the whole session away.
        """
        state = self.memory.get(candidate_id)
        if state is None:
            packet["peak_risk"] = packet.get("risk_score", 0)
            return packet
        risk = packet.get("risk_score", 0)
        if risk > state.get("peak_risk", 0):
            state["peak_risk"] = risk
            state["peak_risk_at"] = time.time()
        packet["peak_risk"] = state["peak_risk"]
        packet["peak_risk_at"] = state["peak_risk_at"]
        return packet

    async def get_state(self, candidate_id: str) -> dict:
        async with self.lock:
            await self._ensure_candidate(candidate_id)
            state = self.memory[candidate_id]
            
            if state["is_locked"]:
                return self._generate_locked_state(candidate_id)

            current_time = time.time()
            cutoff = current_time - self.window_size
            state["events"] = [t for t in state["events"] if t > cutoff]
            
            return self._calculate_risk(candidate_id, state["events"], current_time)

    def _calculate_risk(self, candidate_id: str, events: list, current_time: float) -> dict:
        count = len(events)
        risk_score = min(count * 20, 100)

        # A confirmed critical is objective evidence, not a transient telemetry
        # tier, so the live meter is pinned at 100 while the critical is ACTIVE
        # (a second face / no face right now) or was seen within the last
        # CRITICAL_HOLD_SEC — one clean gaze frame must not repaint a phone
        # incident as a 20% session.
        #
        # It must NOT pin forever, which is what keying off `critical_flags`
        # (a permanent, reset-only list) did: one warm-up false positive read as
        # SEVERE / COMPOSURE 0% for the whole run and every run after it. The
        # permanent record stays permanent — peak_risk still ratchets to 100 and
        # the flag is still on the verdict — but the LIVE number now recovers.
        state = self.memory.get(candidate_id, {})
        if state.get("critical_flags"):
            active_critical = (
                state.get("multiple_faces_confirmed")
                or state.get("no_face_confirmed")
            )
            last_crit = state.get("last_critical_at")
            recently_critical = (
                last_crit is not None
                and current_time - last_crit < CRITICAL_HOLD_SEC
            )
            if active_critical or recently_critical:
                risk_score = 100

        recent_burst = len([t for t in events if current_time - t < 30])
        if recent_burst >= 3:
            risk_score = min(risk_score + 15, 100)

        level, autopsy_flag = self._level_for(risk_score)
        return self._stamp_peak(candidate_id, {
            "candidate_id": candidate_id,
            "risk_score": risk_score,
            "violation_count": count,
            "critical_flags": self.memory.get(candidate_id, {}).get("critical_flags", []),
            "intervention_level": level,
            "is_locked": False,
            "autopsy_flag": autopsy_flag
        })

    def _generate_locked_state(self, candidate_id: str) -> dict:
        memory = self.memory.get(candidate_id, {})
        return self._stamp_peak(candidate_id, {
            "candidate_id": candidate_id,
            "risk_score": 100,
            "violation_count": len(memory.get("events", [])),
            "critical_flags": memory.get("critical_flags", []),
            "intervention_level": "SEVERE_VIOLATION_LOGGED",
            "is_locked": False,
            "autopsy_flag": True
        })


    async def reset_candidate(self, candidate_id: str):
        async with self.lock:
            if candidate_id in self.memory:
                self.memory[candidate_id] = self._fresh_state()

    async def cleanup_stale_sessions(self):
        # Sessions are pruned only after `window_size` seconds of zero activity.
        # An empty events list is NOT a staleness signal — tier 0 (active gaze
        # tracking under the soft threshold) appends nothing, and wiping it
        # would reset the duration timer on every frame.
        current_time = time.time()
        async with self.lock:
            stale_keys = []
            for cid, data in self.memory.items():
                if data["is_locked"]:
                    continue
                last_seen = data.get("last_activity", 0)
                if current_time - last_seen > self.window_size:
                    stale_keys.append(cid)
            for k in stale_keys:
                del self.memory[k]

bea_engine = BehavioralEventAccumulator()
