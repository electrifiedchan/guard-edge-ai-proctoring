import os
import time
import asyncio
from typing import Dict, Any

CRITICAL_BUFFER_SIZE = 5     # Last N frames considered
CRITICAL_THRESHOLD = 3       # Confirm lockout only when N-of-M frames are critical

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
            # Wall-clock duration trackers (None = not currently in that gaze state)
            "down_started_at": None,
            "side_started_at": None,
            "straight_started_at": None,
            # Highest tier already committed to historical events for the active stretch
            "down_recorded_tier": 0,
            "side_recorded_tier": 0,
            # Last-touched wall-clock timestamp; cleanup uses this, NOT events emptiness
            "last_activity": time.time(),
        }

    async def _ensure_candidate(self, candidate_id: str):
        if candidate_id not in self.memory:
            self.memory[candidate_id] = self._fresh_state()

    async def record_critical_signal(self, candidate_id: str, is_critical: bool, reason: str = "") -> dict:
        """Rolling 3-of-5 critical buffer. Filters single-frame anomalies (lighting glitches,
        someone walking past briefly) from sustained violations (real phone, real second person).

        Returns:
            {confirmed, count, threshold, window, pending_reasons}
            confirmed=True means caller should engage `trigger_fatal_lockout`.
        """
        async with self.lock:
            await self._ensure_candidate(candidate_id)
            state = self.memory[candidate_id]
            state["last_activity"] = time.time()

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
            confirmed = count >= CRITICAL_THRESHOLD

            return {
                "confirmed": confirmed,
                "count": count,
                "threshold": CRITICAL_THRESHOLD,
                "window": CRITICAL_BUFFER_SIZE,
                "pending_reasons": list(state["pending_critical_reasons"])
            }

    async def trigger_fatal_lockout(self, candidate_id: str, reason: str = "") -> dict:
        """Logs a fatal-level violation silently (Mobile Phone / Tab Switch).
        Changes state to locked so it permanently stays locked until reset."""
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

            packet["gaze_state"] = live_state
            packet["gaze_duration_sec"] = round(live_duration, 1)
            packet["gaze_tier"] = live_tier  # 0=clear, 1=soft, 2=warn, 3=hard
            packet["gaze_next_threshold_sec"] = (
                round(next_threshold_sec, 1) if next_threshold_sec is not None else None
            )
            return packet

    @staticmethod
    def _tier_for(duration: float, soft: float, warn: float, hard: float):
        """Maps a sustained-gaze duration to (tier, risk_penalty, seconds_to_next_tier)."""
        if duration < soft:
            return 0, 0, soft - duration
        if duration < warn:
            return 1, TIER_SOFT_PENALTY, warn - duration
        if duration < hard:
            return 2, TIER_WARN_PENALTY, hard - duration
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

        recent_burst = len([t for t in events if current_time - t < 30])
        if recent_burst >= 3:
            risk_score = min(risk_score + 15, 100)

        level, autopsy_flag = self._level_for(risk_score)
        return {
            "candidate_id": candidate_id,
            "risk_score": risk_score,
            "violation_count": count,
            "critical_flags": self.memory.get(candidate_id, {}).get("critical_flags", []),
            "intervention_level": level,
            "is_locked": False,
            "autopsy_flag": autopsy_flag
        }

    def _generate_locked_state(self, candidate_id: str) -> dict:
        memory = self.memory.get(candidate_id, {})
        return {
            "candidate_id": candidate_id,
            "risk_score": 100,
            "violation_count": len(memory.get("events", [])),
            "critical_flags": memory.get("critical_flags", []),
            "intervention_level": "SEVERE_VIOLATION_LOGGED",
            "is_locked": False,
            "autopsy_flag": True
        }

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