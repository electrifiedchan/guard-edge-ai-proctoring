import logging
import traceback
import json
import base64
import httpx
import sqlite3
import cv2
import numpy as np
import os
from openai import AsyncOpenAI
from dotenv import load_dotenv
from ultralytics import YOLO
from datetime import datetime
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from core_memory.bea import bea_engine
import voice_engine

load_dotenv()

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
                  ai_logic_trace TEXT,
                  image_payload TEXT)''')
    conn.commit()
    conn.close()
    logger.info("🗄️ SQLite Security Database Initialized.")

def log_to_db(candidate_id, gaze, is_critical, risk_score, level, logic_trace, image_payload=None):
    try:
        conn = sqlite3.connect("sentry_logs.db")
        c = conn.cursor()
        c.execute("""INSERT INTO security_logs 
                     (candidate_id, timestamp, gaze, is_critical, risk_score, intervention_level, ai_logic_trace, image_payload) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                  (candidate_id, datetime.now(), gaze, is_critical, risk_score, level, logic_trace, image_payload))
        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"Database error: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🛡️  G.U.A.R.D. Engine warming up...")
    init_db() # Boot the database
    voice_engine.start_voice_loop() # Boot the voice engine
    app.state.http_client = httpx.AsyncClient(timeout=httpx.Timeout(30.0))
    yield
    await app.state.http_client.aclose()

app = FastAPI(title="G.U.A.R.D. Edge Vision Sentry", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "llama3.1:8b"
OLLAMA_OPTIONS = {"num_predict": 150, "temperature": 0.0, "num_ctx": 1024}

# --- YOLO26s STATE-OF-THE-ART OBJECT DETECTOR ---
yolo_model = YOLO("yolov8n.pt")
logger.info("🔫 YOLO26s VLM-Hybrid Object Detector Loaded.")

# The Hybrid Security Logic Prompt (Text-Only LLM)
SYSTEM_PROMPT = """
<role>You are an Educational Coach and Security Logic Engine for an advanced proctoring system. You will evaluate the candidate's engagement and risk based on YOLO visual arrays combined with MediaPipe CPU Tracking.</role>

<rules>
RULE 0 (CRITICAL OVERRIDE): If faces_detected == 0, the student has either left the frame, covered the webcam, or obscured their face completely. You MUST immediately flag this as a critical violation. Set the engagement_score to 0, output behavior_zone: "CRITICAL_VIOLATION", and state clearly in the verdict that the candidate's face is obscured or missing.
Rule 1 (CRITICAL): If 'Faces Detected' > 1, that is an immediate critical security violation (Multiple people present).
Rule 2 (COACHING): If 'Talking' is True but no phone is detected by YOLO, issue a warning about potential earpiece/verbal coaching.
Rule 3 (ATTENTION OVERRIDE): If the user's 'Head Pose' is anything other than 'center' (e.g., 'left', 'right', 'up', 'down'), you MUST penalize them. You MUST lower the engagement_score to a maximum of 40. You MUST set the behavior_zone to 'ATTENTION_DRIFT', and your verdict MUST state exactly which direction the candidate is looking away.
Rule 4 (TARGET): Identify any physical cheating tools detected by YOLO (e.g. cell phone). Output 'NONE' if no tools.
</rules>

<output_format>
You must reply STRICTLY in JSON. Use exact keys:
{
  "engagement_score": integer (0-100, 100=perfect attention, drop points for talking or head pose drift),
  "behavior_zone": "List the YOLO-detected objects and summarize tracking behaviors.",
  "target": "NONE or name of cheating tool",
  "confidence": "HIGH",
  "gaze": "STRAIGHT", "DOWN", or "SIDE_OR_UP" (derive from head pose),
  "critical": boolean (true ONLY if >1 face or target!=NONE),
  "verdict": "1 short coaching sentence."
}
</output_format>
"""

class FramePayload(BaseModel):
    candidate_id: str
    timestamp: int
    image_base64: str
    faces_detected: int = 1
    is_talking: bool = False
    head_pose: str = "center"

@app.post("/api/v1/analyze-frame")
async def analyze_frame(payload: FramePayload, background_tasks: BackgroundTasks):
    print(f"\n📥 [BACKEND] INCOMING PAYLOAD -> Faces: {payload.faces_detected}, Pose: '{payload.head_pose}', Talking: {payload.is_talking}")
    current_state = await bea_engine.get_state(payload.candidate_id)
    if current_state.get("intervention_level") == "SEVERE_VIOLATION_LOGGED":
        return {"candidate_id": payload.candidate_id, "timestamp": payload.timestamp, "verdict": "SESSION FLAGGED", "risk_packet": current_state}

    # --- PHASE 1: DECODE BASE64 IMAGE ---
    raw_b64 = payload.image_base64
    if "," in raw_b64:
        raw_b64 = raw_b64.split(",", 1)[1]
    try:
        img_bytes = base64.b64decode(raw_b64)
        img_array = np.frombuffer(img_bytes, dtype=np.uint8)
        image = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
    except Exception as e:
        logger.error(f"❌ Image decode error: {e}")
        raise HTTPException(status_code=400, detail="Invalid image payload.")

    # --- PHASE 2: YOLO26s INFERENCE (Deterministic, Zero Hallucination) ---
    results = yolo_model(image, verbose=False, classes=[0, 67], imgsz=640, augment=True, conf=0.35)
    detected_objects = []
    for r in results:
        for box in r.boxes:
            cls_id = int(box.cls[0])
            label = yolo_model.names[cls_id]
            conf = float(box.conf[0])
            detected_objects.append(f"{label} ({conf:.0%})")

    yolo_context = f"YOLO Detected Objects: {', '.join(detected_objects) if detected_objects else 'None detected'}"
    logger.info(f"🔫 {yolo_context}")

    # --- PHASE 3: TEXT-LLM RISK EVALUATION ---
    engine_mode = os.getenv("ENGINE_MODE", "offline").lower()

    user_prompt = (
        f"YOLO Vision Detected: {yolo_context}\n"
        f"MediaPipe CPU Telemetry -> Faces: {payload.faces_detected}, "
        f"Talking: {payload.is_talking}, Head Pose: {payload.head_pose}"
    )

    try:
        if engine_mode == "api":
            nv_client = AsyncOpenAI(
                base_url="https://integrate.api.nvidia.com/v1",
                api_key=os.getenv("NVIDIA_API_KEY")
            )
            
            completion = await nv_client.chat.completions.create(
                model="meta/llama-3.1-8b-instruct",
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.2,
                top_p=0.7,
                max_tokens=1024,
            )
            raw_llm_response = completion.choices[0].message.content
        else:
            ollama_payload = {
                "model": OLLAMA_MODEL, "system": SYSTEM_PROMPT,
                "prompt": user_prompt,
                "stream": False, "format": "json", "options": OLLAMA_OPTIONS
            }
            response = await app.state.http_client.post(OLLAMA_URL, json=ollama_payload)
            response.raise_for_status()
            data = response.json()
            raw_llm_response = data.get("response", "{}")

        # Strip any standard json markdown formatting if present from the NV response
        if raw_llm_response.startswith("```json"):
            raw_llm_response = raw_llm_response[7:].strip()
            if raw_llm_response.endswith("```"):
                raw_llm_response = raw_llm_response[:-3].strip()

        print(f"🧠 [LLM] RAW VERDICT: {raw_llm_response}\n")

        try:
            ai_response = json.loads(raw_llm_response)
        except json.JSONDecodeError:
            ai_response = {"gaze": "STRAIGHT", "critical": False, "verdict": "JSON Error"}

        # Extract the new compressed keys
        confidence = ai_response.get("confidence", "LOW")
        gaze = ai_response.get("gaze", "STRAIGHT")
        is_critical = bool(ai_response.get("critical", False))
        verdict = ai_response.get("verdict", "")
        logic_trace = ai_response.get("target", "None")

        # --- THE HALLUCINATION GUARDRAIL ---
        if is_critical and confidence != "HIGH":
            logger.warning(f"⚠️ AI Hallucination caught! Overriding low-confidence threat: {logic_trace}")
            is_critical = False
            verdict = f"System nominal. Ignored low-confidence object: {logic_trace}"

        if is_critical:
            risk_packet = await bea_engine.trigger_fatal_lockout(payload.candidate_id)
        else:
            risk_packet = await bea_engine.record_telemetry(payload.candidate_id, gaze)

        # Extract autopsy flag from BEA temporal graph
        autopsy_flag = risk_packet.get("autopsy_flag", False)

        # 💾 Write to SQLite Database in the background
        evidence_image = payload.image_base64 if autopsy_flag else None
        background_tasks.add_task(log_to_db, payload.candidate_id, gaze, is_critical, risk_packet['risk_score'], risk_packet['intervention_level'], logic_trace, evidence_image)
        background_tasks.add_task(bea_engine.cleanup_stale_sessions)

        # --- RESTORED TERMINAL LOGS ---
        logger.info(f"👁️  VERDICT: {verdict}")
        logger.info(f"🧠  LOGIC TRACE: {logic_trace}")
        logger.info(f"🎯  GAZE: {gaze} | CRITICAL: {is_critical} | RISK: {risk_packet['risk_score']}% [{risk_packet['intervention_level']}]")
        logger.info("-" * 50)

        return {"candidate_id": payload.candidate_id, "timestamp": payload.timestamp, "verdict": verdict, "gaze": gaze, "risk_packet": risk_packet}

    except Exception as e:
        logger.error(f"❌ Ollama Error [{type(e).__name__}]: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=503, detail="Edge AI Engine unreachable.")

@app.get("/api/v1/logs")
async def get_audit_logs():
    try:
        conn = sqlite3.connect("sentry_logs.db")
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute('''SELECT id, candidate_id, timestamp, gaze, is_critical, risk_score, intervention_level, ai_logic_trace 
                     FROM security_logs ORDER BY timestamp DESC LIMIT 50''')
        rows = c.fetchall()
        logs = [dict(row) for row in rows]
        conn.close()
        return logs
    except Exception as e:
        logger.error(f"❌ DB Read Error: {e}")
        raise HTTPException(status_code=500, detail="Database access error.")

@app.get("/api/v1/autopsy-logs")
async def get_autopsy_logs():
    try:
        conn = sqlite3.connect("sentry_logs.db")
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute('''SELECT id, candidate_id, timestamp, gaze, is_critical, risk_score, 
                     intervention_level, ai_logic_trace, image_payload 
                     FROM security_logs 
                     WHERE image_payload IS NOT NULL 
                     ORDER BY timestamp DESC''')
        rows = c.fetchall()
        logs = [dict(row) for row in rows]
        conn.close()
        logger.info(f"📸 Autopsy: Serving {len(logs)} evidence frames.")
        return logs
    except Exception as e:
        logger.error(f"❌ Autopsy DB Read Error: {e}")
        raise HTTPException(status_code=500, detail="Autopsy database access error.")

@app.get("/api/v1/voice-status")
async def get_voice_status():
    return voice_engine.voice_state

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