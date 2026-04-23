import logging
import json
import httpx
import sqlite3
from datetime import datetime
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from core_memory.bea import bea_engine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- S-TIER DATABASE INIT ---
def init_db():
    conn = sqlite3.connect("sentry_logs.db")
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS security_logs
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  candidate_id TEXT,
                  timestamp DATETIME,
                  gaze TEXT,
                  is_critical BOOLEAN,
                  risk_score INTEGER,
                  intervention_level TEXT,
                  ai_logic_trace TEXT)''')
    conn.commit()
    conn.close()
    logger.info("🗄️ SQLite Security Database Initialized.")

def log_to_db(candidate_id, gaze, is_critical, risk_score, level, logic_trace):
    try:
        conn = sqlite3.connect("sentry_logs.db")
        c = conn.cursor()
        c.execute("""INSERT INTO security_logs 
                     (candidate_id, timestamp, gaze, is_critical, risk_score, intervention_level, ai_logic_trace) 
                     VALUES (?, ?, ?, ?, ?, ?, ?)""",
                  (candidate_id, datetime.now(), gaze, is_critical, risk_score, level, logic_trace))
        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"Database error: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🛡️  G.U.A.R.D. Engine warming up...")
    init_db() # Boot the database
    app.state.http_client = httpx.AsyncClient(timeout=httpx.Timeout(30.0))
    yield
    await app.state.http_client.aclose()

app = FastAPI(title="G.U.A.R.D. Edge Vision Sentry", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "llama3.2-vision"
OLLAMA_OPTIONS = {"num_predict": 200, "temperature": 0.0, "num_ctx": 1024, "kv_cache_type": "q8_0"}

# The Elite Hallucination-Proof Prompt
SYSTEM_PROMPT = """
<role>You are a strict, objective computer vision sensor. You lack imagination and rely solely on structural geometric reality.</role>

<rules>
Rule 1 (GAZE): Determine if the person is looking 'STRAIGHT' (at monitor), 'DOWN' (at keyboard/desk), or 'SIDE_OR_UP' (away).
Rule 2 (CRITICAL_THREAT): A situation is ONLY critical if a mobile phone or an unauthorized human is 100% clearly visible.
</rules>

<negative_constraints>
- DO NOT guess based on linguistic priors. If an object is ambiguous (e.g., a wallet, notebook, shadow, or remote), YOU MUST IGNORE IT.
- Be cautious of small area ratios. Do not hallucinate objects or people in tiny, noisy background patches.
- If no distinct features (screen, camera lens, human face) are visible, you must explicitly declare absence.
</negative_constraints>

<output_format>
You must reply STRICTLY in JSON. Execute a Perception-Reasoning Decomposition using these exact keys:
{
  "blind_observation": "Phase 1: Neutrally describe the scene, hands, and desk context-free.",
  "entity_extraction": "Phase 2: Use exact syntax: 'NO TARGETS' if no phone/person is 100% visible. Otherwise, name the target.",
  "spatial_verification": "Phase 3: If a target is found, describe its exact physical location in the frame. If 'NO TARGETS', output 'N/A'.",
  "gaze": "STRAIGHT", "DOWN", or "SIDE_OR_UP",
  "is_critical": boolean (true ONLY if entity_extraction is NOT 'NO TARGETS'),
  "verdict": "Brief 1 sentence summary."
}
</output_format>
"""

class FramePayload(BaseModel):
    candidate_id: str
    timestamp: int
    image_payload: str  

@app.post("/api/v1/analyze-frame")
async def analyze_frame(payload: FramePayload, background_tasks: BackgroundTasks):
    current_state = await bea_engine.get_state(payload.candidate_id)
    if current_state.get("intervention_level") == "TERMINAL":
        return {"candidate_id": payload.candidate_id, "timestamp": payload.timestamp, "verdict": "SESSION LOCKED", "risk_packet": current_state}

    ollama_payload = {
        "model": OLLAMA_MODEL, "system": SYSTEM_PROMPT, "prompt": "Analyze this frame and output the required JSON.",
        "images": [payload.image_payload], "stream": False, "format": "json", "options": OLLAMA_OPTIONS
    }

    try:
        response = await app.state.http_client.post(OLLAMA_URL, json=ollama_payload)
        response.raise_for_status()
        data = response.json()
        raw_response = data.get("response", "{}")

        try:
            ai_response = json.loads(raw_response)
        except json.JSONDecodeError:
            ai_response = {"gaze": "STRAIGHT", "is_critical": False, "verdict": "JSON Error"}

        gaze = ai_response.get("gaze", "STRAIGHT")
        is_critical = bool(ai_response.get("is_critical", False))
        verdict = ai_response.get("verdict", "")
        logic_trace = ai_response.get("entity_extraction", "")

        if is_critical:
            risk_packet = await bea_engine.trigger_fatal_lockout(payload.candidate_id)
        else:
            risk_packet = await bea_engine.record_telemetry(payload.candidate_id, gaze)

        # 💾 Write to SQLite Database in the background
        background_tasks.add_task(log_to_db, payload.candidate_id, gaze, is_critical, risk_packet['risk_score'], risk_packet['intervention_level'], logic_trace)
        background_tasks.add_task(bea_engine.cleanup_stale_sessions)

        return {"candidate_id": payload.candidate_id, "timestamp": payload.timestamp, "verdict": verdict, "gaze": gaze, "risk_packet": risk_packet}

    except Exception as e:
        logger.error(f"❌ Error: {e}")
        raise HTTPException(status_code=503, detail="Edge AI Engine unreachable.")

@app.get("/api/v1/status/{candidate_id}")
async def get_candidate_status(candidate_id: str):
    return await bea_engine.get_state(candidate_id)

@app.post("/api/v1/reset/{candidate_id}")
async def reset_candidate_status(candidate_id: str):
    await bea_engine.reset_candidate(candidate_id)
    return {"status": "success"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)