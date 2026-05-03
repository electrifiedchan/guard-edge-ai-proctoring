import time
import asyncio
from typing import Dict, Any

class BehavioralEventAccumulator:
    def __init__(self, window_size_seconds: int = 300):
        self.window_size = window_size_seconds
        self.memory: Dict[str, Dict[str, Any]] = {}
        self.lock = asyncio.Lock()

    async def _ensure_candidate(self, candidate_id: str):
        if candidate_id not in self.memory:
            self.memory[candidate_id] = {
                "events": [], 
                "is_locked": False,
                "consecutive_down": 0,  # Pitch tracker
                "consecutive_side": 0,  # Yaw tracker
                "critical_flags": []    # Fatal reasons
            }

    async def trigger_fatal_lockout(self, candidate_id: str, reason: str = "") -> dict:
        """Logs a fatal-level violation silently (Mobile Phone / Tab Switch).
        Changes state to locked so it permanently stays locked until reset."""
        async with self.lock:
            await self._ensure_candidate(candidate_id)
            self.memory[candidate_id]["is_locked"] = True
            self.memory[candidate_id]["critical_flags"].append(reason)
            return self._generate_locked_state(candidate_id)

    # [ELITE UPGRADE]: Temporal Threshold Logic
    async def record_telemetry(self, candidate_id: str, gaze: str) -> dict:
        """Evaluates stateless gaze against industry-standard temporal limits."""
        async with self.lock:
            await self._ensure_candidate(candidate_id)
            state = self.memory[candidate_id]

            if state["is_locked"]:
                return self._generate_locked_state(candidate_id)

            current_time = time.time()
            is_violation = False
            penalty_multiplier = 1

            # 1. YAW (Horizontal Deviation) - Strict Rules (Honorlock/Respondus standards)
            if gaze == "SIDE_OR_UP":
                state["consecutive_side"] += 1
                state["consecutive_down"] = 0
                
                if state["consecutive_side"] == 1:  # 5 seconds: Micro-glance grace period over
                    is_violation = True
                    penalty_multiplier = 1
                elif state["consecutive_side"] >= 3: # 15 seconds: Red Flag / Hard Warning
                    is_violation = True
                    penalty_multiplier = 3 # Spikes the risk score heavily

            # 2. PITCH (Downward Deviation) - Lenient Rules (Keyboard/Notes allowance)
            elif gaze == "DOWN":
                state["consecutive_down"] += 1
                state["consecutive_side"] = 0
                
                if state["consecutive_down"] == 2:  # 10 seconds: Orange Alert
                    is_violation = True
                    penalty_multiplier = 1
                elif state["consecutive_down"] >= 6: # 30 seconds: Red Flag
                    is_violation = True
                    penalty_multiplier = 3

            # 3. STRAIGHT (Benign) - Resets Stopwatches
            else:
                state["consecutive_down"] = 0
                state["consecutive_side"] = 0

            # Record events based on penalty severity
            if is_violation:
                for _ in range(penalty_multiplier):
                    state["events"].append(current_time)

            # Sliding Window GC
            cutoff = current_time - self.window_size
            state["events"] = [t for t in state["events"] if t > cutoff]

            return self._calculate_risk(candidate_id, state["events"], current_time)

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

        # Silent Observer: Never lock out, only log severity
        autopsy_flag = False
        if risk_score >= 100:
            level = "SEVERE_VIOLATION_LOGGED"
            autopsy_flag = True
        elif risk_score >= 75:
            level = "HARD_WARNING"
            autopsy_flag = True
        elif risk_score >= 40:
            level = "WARNING_LOGGED"
        elif risk_score >= 20:
            level = "SOFT_WARNING"
        else:
            level = "CLEAR"

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
                self.memory[candidate_id] = {"events": [], "is_locked": False, "consecutive_down": 0, "consecutive_side": 0, "critical_flags": []}

    async def cleanup_stale_sessions(self):
        current_time = time.time()
        async with self.lock:
            stale_keys = []
            for cid, data in self.memory.items():
                if not data["events"] and not data["is_locked"]:
                    stale_keys.append(cid)
                elif data["events"] and (current_time - data["events"][-1] > self.window_size):
                    if not data["is_locked"]:
                        stale_keys.append(cid)
            for k in stale_keys:
                del self.memory[k]

bea_engine = BehavioralEventAccumulator()