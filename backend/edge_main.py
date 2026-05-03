from concurrent.futures import ThreadPoolExecutor
import asyncio
import logging
import traceback
import json
import base64
import sqlite3
import cv2
import numpy as np
import os
import requests
from openai import AsyncOpenAI
from dotenv import load_dotenv

load_dotenv()
from ultralytics import YOLO
from datetime import datetime
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from core_memory.bea import bea_engine
import voice_engine

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
    app.state.executor = ThreadPoolExecutor(max_workers=2)
    yield
    app.state.executor.shutdown(wait=False)

app = FastAPI(title="G.U.A.R.D. Edge Vision Sentry", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

# --- YOLO26s STATE-OF-THE-ART OBJECT DETECTOR ---
import torch
device = 'cuda' if torch.cuda.is_available() else 'cpu'
yolo_model = YOLO('yolov8s.pt')
yolo_model.to(device)
logger.info(f'🔫 YOLOv8s loaded on {device.upper()}')

def determine_verdict(detected_objects: list, faces: int, talking: bool, head_pose: str):
    is_critical = False
    gaze = "STRAIGHT"
    verdict = "Candidate is fully engaged and attentive."

    if faces == 0:
        is_critical = True
        verdict = "CRITICAL: Candidate face not visible or obscured."

    elif faces > 1:
        is_critical = True
        verdict = "CRITICAL: Multiple persons detected in frame."

    elif any("cell phone" in obj.lower() for obj in detected_objects):
        is_critical = True
        verdict = "CRITICAL: Mobile device detected in frame."

    elif any("book" in obj.lower() or "laptop" in obj.lower() for obj in detected_objects):
        is_critical = True
        verdict = "CRITICAL: Prohibited item detected on desk."

    elif head_pose in ["left", "right", "up"]:
        gaze = "SIDE_OR_UP"
        verdict = f"Attention drift detected: candidate looking {head_pose}."

    elif head_pose == "down":
        gaze = "DOWN"
        verdict = "Candidate looking downward — possible reference material."

    if talking and not is_critical:
        verdict += " Verbal activity detected — possible earpiece coaching."

    logic_trace = f"Objects: {detected_objects or 'None'} | Faces: {faces} | Pose: {head_pose} | Talking: {talking}"

    return gaze, is_critical, verdict, logic_trace

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

    # --- PHASE 2: YOLO INFERENCE (Non-blocking, off event loop) ---
    loop = asyncio.get_running_loop()
    results = await loop.run_in_executor(
        app.state.executor,
        lambda: yolo_model(
            image,
            verbose=False,
            classes=[0, 67],
            imgsz=640,
            augment=False,
            conf=0.65
        )
    )
    detected_objects = []
    for r in results:
        for box in r.boxes:
            cls_id = int(box.cls[0])
            label = yolo_model.names[cls_id]
            conf = float(box.conf[0])
            detected_objects.append(f"{label} ({conf:.0%})")

    yolo_context = f"YOLO Detected Objects: {', '.join(detected_objects) if detected_objects else 'None detected'}"
    logger.info(f"🔫 {yolo_context}")

    # --- PHASE 3: DETERMINISTIC VERDICT ENGINE ---
    gaze, is_critical, verdict, logic_trace = determine_verdict(
        detected_objects=detected_objects,
        faces=payload.faces_detected,
        talking=payload.is_talking,
        head_pose=payload.head_pose
    )

    if is_critical:
        risk_packet = await bea_engine.trigger_fatal_lockout(payload.candidate_id, reason=verdict)
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

class FinalStats(BaseModel):
    candidate_id: str
    total_violations: int
    risk_score: int
    session_duration_sec: int = 300
    critical_flags: list[str] = []

@app.post("/generate-verdict")
async def generate_verdict(stats: FinalStats):
    critical_context = ""
    if stats.critical_flags:
        flags_text = ", ".join(stats.critical_flags)
        critical_context = f"\nCRITICAL VIOLATIONS DETECTED: {flags_text}\nThe candidate triggered a fatal violation for: {flags_text}. Address this severe breach of exam integrity directly in paragraph 2.\n"

    prompt = f"""You are an empathetic executive interview coach. Analyze the following candidate data: 
Total Violations flagged: {stats.total_violations}
Peak Risk Score: {stats.risk_score}%
Session Duration (sec): {stats.session_duration_sec}{critical_context}

Write a 3-paragraph coaching report. 
Paragraph 1: Praise their effort. 
Paragraph 2: Point out their specific posture/attention flaws based on the data. 
Paragraph 3: Give actionable advice for their next interview."""

    try:
        client = AsyncOpenAI(
            base_url="https://integrate.api.nvidia.com/v1",
            api_key=os.environ.get("NVIDIA_API_KEY")
        )

        completion = await client.chat.completions.create(
            model="meta/llama-3.1-8b-instruct",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=500
        )
        
        ai_report = completion.choices[0].message.content
    except Exception as e:
        logger.error(f"NVIDIA API error: {e}")
        ai_report = f"Mock Report (API unreachable):\n\nParagraph 1: You showed great effort today!\n\nParagraph 2: You had {stats.total_violations} visibility violations with a peak risk of {stats.risk_score}%.\n\nParagraph 3: Please ensure your posture and environment are optimized next time."

    return {
        "candidate_id": stats.candidate_id,
        "total_violations": stats.total_violations,
        "risk_score": stats.risk_score,
        "report": ai_report
    }

@app.get("/api/v1/status/{candidate_id}")
async def get_candidate_status(candidate_id: str):
    return await bea_engine.get_state(candidate_id)

@app.post("/reset-session")
async def reset_session(candidate_id: str = "major_project_candidate_01"):
    await bea_engine.reset_candidate(candidate_id)
    return {"status": "success", "message": "Memory cleared."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)