from concurrent.futures import ThreadPoolExecutor
import asyncio
import logging
import base64
import sqlite3
import uuid
import cv2
import numpy as np
import os
from openai import AsyncOpenAI
from dotenv import load_dotenv

load_dotenv()
from ultralytics import YOLO
from datetime import datetime
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from core_memory.bea import bea_engine
import voice_engine

# Anchor all on-disk paths to the backend folder so cwd doesn't matter
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BACKEND_DIR, "sentry_logs.db")
EVIDENCE_DIR = os.path.join(BACKEND_DIR, "evidence")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- S-TIER DATABASE INIT ---
def init_db():
    os.makedirs(EVIDENCE_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    # image_payload now stores a path (e.g. "/api/v1/evidence/<file>.jpg")
    # rather than a giant base64 blob, keeping the DB compact.
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
    logger.info(f"🗄️ SQLite Security Database Initialized at {DB_PATH}")
    logger.info(f"📸 Evidence directory: {EVIDENCE_DIR}")

def write_evidence_frame(candidate_id: str, image_base64: str) -> str | None:
    """Decodes a base64 JPEG and writes it to EVIDENCE_DIR. Returns the URL path
    served by the StaticFiles mount, or None on failure."""
    try:
        raw = image_base64.split(",", 1)[1] if "," in image_base64 else image_base64
        img_bytes = base64.b64decode(raw)
        filename = f"{candidate_id}_{int(datetime.now().timestamp() * 1000)}_{uuid.uuid4().hex[:8]}.jpg"
        filepath = os.path.join(EVIDENCE_DIR, filename)
        with open(filepath, "wb") as f:
            f.write(img_bytes)
        return f"/api/v1/evidence/{filename}"
    except Exception as e:
        logger.error(f"❌ Evidence write error: {e}")
        return None

def log_to_db(candidate_id, gaze, is_critical, risk_score, level, logic_trace, image_path=None):
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("""INSERT INTO security_logs
                     (candidate_id, timestamp, gaze, is_critical, risk_score, intervention_level, ai_logic_trace, image_payload)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                  (candidate_id, datetime.now(), gaze, is_critical, risk_score, level, logic_trace, image_path))
        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"Database error: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🛡️  G.U.A.R.D. Engine warming up...")
    init_db()  # Boot the database + ensure evidence dir exists
    # Voice engine is optional — skip on headless/Docker via DISABLE_VOICE_ENGINE=true
    if os.getenv("DISABLE_VOICE_ENGINE", "false").lower() != "true":
        try:
            voice_engine.start_voice_loop()
        except Exception as e:
            logger.warning(f"⚠️  Voice engine failed to start (running headless?): {e}")
    else:
        logger.info("🔇 Voice engine disabled via DISABLE_VOICE_ENGINE")
    app.state.executor = ThreadPoolExecutor(max_workers=2)
    yield
    app.state.executor.shutdown(wait=False)

app = FastAPI(title="G.U.A.R.D. Edge Vision Sentry", lifespan=lifespan)

# CORS — restrict to local dev origins. Override via ALLOWED_ORIGINS env (comma-separated).
DEFAULT_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000"
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", DEFAULT_ORIGINS).split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
logger.info(f"🌐 CORS allowed origins: {ALLOWED_ORIGINS}")

# Serve evidence frames from disk so the autopsy page can <img src> them by URL
os.makedirs(EVIDENCE_DIR, exist_ok=True)
app.mount("/api/v1/evidence", StaticFiles(directory=EVIDENCE_DIR), name="evidence")

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

    # 3-of-5 critical grace period — single-frame anomalies (lighting glitches, brief
    # passerby) do NOT trigger immediate fatal lockout. Lockout fires only after the
    # rolling buffer confirms a sustained violation.
    if is_critical:
        decision = await bea_engine.record_critical_signal(payload.candidate_id, True, verdict)
        if decision["confirmed"]:
            consolidated = "; ".join(decision["pending_reasons"]) or verdict
            risk_packet = await bea_engine.trigger_fatal_lockout(payload.candidate_id, reason=consolidated)
            verdict = f"CONFIRMED ({decision['count']}/{decision['threshold']}): {consolidated}"
        else:
            # Treat unconfirmed criticals as elevated gaze deviation for risk accumulation
            risk_packet = await bea_engine.record_telemetry(payload.candidate_id, "SIDE_OR_UP")
            risk_packet["critical_pending"] = decision["count"]
            risk_packet["critical_threshold"] = decision["threshold"]
            verdict = f"⚠️ ANOMALY {decision['count']}/{decision['threshold']}: {verdict}"
    else:
        await bea_engine.record_critical_signal(payload.candidate_id, False, "")
        risk_packet = await bea_engine.record_telemetry(payload.candidate_id, gaze)

    # Extract autopsy flag from BEA temporal graph
    autopsy_flag = risk_packet.get("autopsy_flag", False)

    # Evidence frames go to disk; only the URL path is stored in SQLite (keeps DB lean)
    evidence_path = write_evidence_frame(payload.candidate_id, payload.image_base64) if autopsy_flag else None

    # Only persist rows with signal value — CLEAR/risk=0 frames are noise that buries
    # real violations under thousands of empty entries (see audit-trail polling endpoint).
    should_persist = (
        is_critical
        or risk_packet['risk_score'] > 0
        or risk_packet['intervention_level'] != 'CLEAR'
        or evidence_path is not None
    )
    if should_persist:
        background_tasks.add_task(log_to_db, payload.candidate_id, gaze, is_critical, risk_packet['risk_score'], risk_packet['intervention_level'], logic_trace, evidence_path)
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
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        # Hide legacy CLEAR/risk=0 rows so meaningful events aren't buried by historical noise.
        c.execute('''SELECT id, candidate_id, timestamp, gaze, is_critical, risk_score, intervention_level, ai_logic_trace
                     FROM security_logs
                     WHERE is_critical = 1 OR risk_score > 0 OR intervention_level != 'CLEAR'
                     ORDER BY timestamp DESC LIMIT 50''')
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
        conn = sqlite3.connect(DB_PATH)
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


# --- SESSION BREAKDOWN ---
# Canonical violation taxonomy. Each predicate is a substring/regex match against
# the `ai_logic_trace` string (format: "Objects: [...] | Faces: N | Pose: X | Talking: Y").
# Frame rows can match multiple types (e.g. looking down WHILE talking).
VIOLATION_TYPES = {
    "DOWN_GAZE":       lambda trace, gaze: "Pose: down" in trace or gaze == "DOWN",
    "SIDE_GAZE":       lambda trace, gaze: any(p in trace for p in ("Pose: left", "Pose: right", "Pose: up")) or gaze == "SIDE_OR_UP",
    "MOBILE_DEVICE":   lambda trace, gaze: "cell phone" in trace.lower(),
    "PROHIBITED_ITEM": lambda trace, gaze: ("book" in trace.lower() or "laptop" in trace.lower()) and "cell phone" not in trace.lower(),
    "MULTIPLE_FACES":  lambda trace, gaze: any(f"Faces: {n}" in trace for n in range(2, 10)),
    "NO_FACE":         lambda trace, gaze: "Faces: 0" in trace,
    "TALKING":         lambda trace, gaze: "Talking: True" in trace,
}

# Frame inference cadence — used only to estimate cumulative seconds for grouped
# violations. Approximate by design; the UI labels it as "approx".
INFERENCE_CADENCE_SEC = 5


def _compute_session_breakdown(candidate_id: str, since_iso: str | None = None) -> dict:
    """Pulls persisted log rows for the candidate, classifies each into one or
    more canonical violation buckets, and returns aggregate stats per type.

    If ``since_iso`` is provided (ISO-8601 timestamp string), only rows with
    ``timestamp >= since_iso`` are considered. The filter is applied in Python
    after the fetch because DB timestamps are naive-local while the frontend
    sends UTC ISO strings — a raw string compare would be wrong.

    Used by both the public /api/v1/session-breakdown endpoint and the
    /generate-verdict prompt grounding.
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute('''SELECT id, candidate_id, timestamp, gaze, is_critical, risk_score,
                 intervention_level, ai_logic_trace, image_payload
                 FROM security_logs
                 WHERE candidate_id = ?
                   AND (is_critical = 1 OR risk_score > 0 OR intervention_level != 'CLEAR')
                 ORDER BY timestamp ASC''', (candidate_id,))
    rows = [dict(r) for r in c.fetchall()]
    conn.close()

    # Time-scope filter. We do this in Python because the DB stores naive-local
    # timestamps from `datetime.now()` while the frontend sends UTC ISO strings —
    # a raw SQL string compare would mis-order them.
    if since_iso:
        try:
            # Python 3.11+ parses the trailing 'Z' as UTC.
            since_dt = datetime.fromisoformat(since_iso.replace("Z", "+00:00"))
            # Normalise to local naive so we can compare against DB values that
            # were written via datetime.now() (also local naive).
            if since_dt.tzinfo is not None:
                since_dt = since_dt.astimezone().replace(tzinfo=None)
            filtered = []
            for r in rows:
                try:
                    row_dt = datetime.fromisoformat(r["timestamp"])
                except (TypeError, ValueError):
                    continue
                if row_dt >= since_dt:
                    filtered.append(r)
            rows = filtered
        except Exception as e:
            logger.warning(f"⚠️ Could not parse session start filter '{since_iso}': {e}. Returning unfiltered set.")

    buckets: dict[str, dict] = {
        t: {
            "count": 0,
            "first_at": None,
            "last_at": None,
            "peak_risk": 0,
            "peak_intervention_level": "CLEAR",
            "evidence_paths": [],
            "sample_events": [],
        }
        for t in VIOLATION_TYPES
    }

    peak_event = None
    for row in rows:
        trace = row.get("ai_logic_trace") or ""
        gaze = row.get("gaze") or ""
        ts = row["timestamp"]
        risk = int(row.get("risk_score") or 0)
        level = row.get("intervention_level") or "CLEAR"
        evidence = row.get("image_payload")

        if peak_event is None or risk > peak_event["risk_score"]:
            peak_event = {
                "timestamp": ts,
                "risk_score": risk,
                "intervention_level": level,
                "logic_trace": trace,
                "evidence_path": evidence,
            }

        for vtype, predicate in VIOLATION_TYPES.items():
            if not predicate(trace, gaze):
                continue
            b = buckets[vtype]
            b["count"] += 1
            if b["first_at"] is None:
                b["first_at"] = ts
            b["last_at"] = ts
            if risk > b["peak_risk"]:
                b["peak_risk"] = risk
                b["peak_intervention_level"] = level
            if evidence and evidence not in b["evidence_paths"]:
                b["evidence_paths"].append(evidence)
            if len(b["sample_events"]) < 5:
                b["sample_events"].append({
                    "timestamp": ts,
                    "risk_score": risk,
                    "intervention_level": level,
                    "logic_trace": trace,
                })

    # Add approx duration + drop empty buckets so the UI doesn't render zero-count cards
    violations_by_type = {}
    for vtype, b in buckets.items():
        if b["count"] == 0:
            continue
        b["approx_total_seconds"] = b["count"] * INFERENCE_CADENCE_SEC
        violations_by_type[vtype] = b

    session_window = {
        "first_event_at": rows[0]["timestamp"] if rows else None,
        "last_event_at": rows[-1]["timestamp"] if rows else None,
    }

    return {
        "candidate_id": candidate_id,
        "total_events": len(rows),
        "violations_by_type": violations_by_type,
        "peak_event": peak_event,
        "session_window": session_window,
    }


@app.get("/api/v1/session-breakdown/{candidate_id}")
async def get_session_breakdown(candidate_id: str, since: str | None = None):
    try:
        return _compute_session_breakdown(candidate_id, since_iso=since)
    except Exception as e:
        logger.error(f"❌ Session breakdown error: {e}")
        raise HTTPException(status_code=500, detail="Failed to compute session breakdown.")


class FinalStats(BaseModel):
    candidate_id: str
    total_violations: int
    risk_score: int
    session_duration_sec: int = 300
    critical_flags: list[str] = []
    # ISO-8601 timestamp marking when the candidate's current session began.
    # When provided, the verdict is scoped to events at-or-after this moment so
    # we don't fold prior runs into the report.
    session_started_at: str | None = None

# Human-readable labels for each canonical violation type. Used in the LLM prompt
# so the model speaks in the same language as the UI cards.
VIOLATION_LABELS = {
    "DOWN_GAZE":       "looking down (off-screen / at lap)",
    "SIDE_GAZE":       "looking sideways or up (off-screen)",
    "MOBILE_DEVICE":   "mobile phone visible in frame",
    "PROHIBITED_ITEM": "prohibited item visible (book / second laptop)",
    "MULTIPLE_FACES":  "additional person visible in frame",
    "NO_FACE":         "candidate not visible in frame",
    "TALKING":         "talking detected",
}


def _format_breakdown_for_prompt(breakdown: dict) -> str:
    """Render the structured breakdown as a compact, factual block the LLM can
    quote directly. We keep this terse so the model grounds claims in counts and
    timestamps rather than inventing details."""
    by_type = breakdown.get("violations_by_type") or {}
    if not by_type:
        return "No behavioural violations were logged during this session."

    lines = []
    # Sort by peak risk desc so the most serious type leads.
    for vtype, b in sorted(by_type.items(), key=lambda kv: -kv[1]["peak_risk"]):
        label = VIOLATION_LABELS.get(vtype, vtype)
        lines.append(
            f"- {label}: {b['count']} event(s), "
            f"~{b['approx_total_seconds']}s cumulative, "
            f"peak risk {b['peak_risk']}% ({b['peak_intervention_level']}), "
            f"first at {b['first_at']}, last at {b['last_at']}"
        )
    return "\n".join(lines)


@app.post("/generate-verdict")
async def generate_verdict(stats: FinalStats):
    # Pull the grouped breakdown so the LLM speaks from real evidence.
    # Scope to the current session when the frontend provides a start marker —
    # otherwise we'd fold every prior run for this candidate into the report.
    try:
        breakdown = _compute_session_breakdown(
            stats.candidate_id,
            since_iso=stats.session_started_at,
        )
    except Exception as e:
        logger.error(f"⚠️ Could not compute breakdown for verdict: {e}")
        breakdown = {"violations_by_type": {}, "peak_event": None, "session_window": {}}

    breakdown_block = _format_breakdown_for_prompt(breakdown)

    critical_context = ""
    if stats.critical_flags:
        flags_text = ", ".join(stats.critical_flags)
        critical_context = (
            f"\nCRITICAL VIOLATIONS: {flags_text}. Address this directly and "
            f"without sugar-coating in paragraph 2.\n"
        )

    prompt = f"""You are a supportive interview coach reviewing a candidate's proctored session. Your tone is direct, warm, and constructive — you are building this person up, not shaming them. Never invent details; every claim must be grounded in the data below.

SESSION DATA
Candidate: {stats.candidate_id}
Peak risk score: {stats.risk_score}%
Total flagged events: {stats.total_violations}
Approx session duration: {stats.session_duration_sec}s{critical_context}

BEHAVIOURAL BREAKDOWN (grouped by type)
{breakdown_block}

Write a 3-paragraph coaching report in plain prose (no bullet lists, no headings).

Paragraph 1 — Acknowledge the effort and name one concrete thing the candidate did right (e.g. low total events, brief recovery times, no critical flags). Be specific to their numbers.

Paragraph 2 — Name the single most impactful pattern from the breakdown above (the one with the highest peak risk or longest cumulative time). Quote the count and approx duration. Explain in one sentence why that pattern reads as a problem to a human proctor or interviewer.

Paragraph 3 — Give two specific, actionable habits for next time, tailored to the pattern from paragraph 2. Close with one sentence of genuine encouragement.

Hard rules:
- Use ONLY the numbers shown above. Do not invent percentages or counts.
- Do not write "as an AI". Speak as a coach.
- Do not use the words "violation" or "breach" — say "moment", "event", or "pattern" instead.
- Keep it under 220 words total."""

    try:
        client = AsyncOpenAI(
            base_url="https://integrate.api.nvidia.com/v1",
            api_key=os.environ.get("NVIDIA_API_KEY")
        )

        completion = await client.chat.completions.create(
            model="meta/llama-3.1-8b-instruct",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.6,
            max_tokens=520
        )

        ai_report = completion.choices[0].message.content
    except Exception as e:
        logger.error(f"NVIDIA API error: {e}")
        ai_report = (
            f"Mock Report (API unreachable):\n\n"
            f"You showed up and ran the full session — that takes focus, and the data shows you held a clean frame for most of it.\n\n"
            f"The breakdown logged {stats.total_violations} flagged moments with a peak risk of {stats.risk_score}%. "
            f"The dominant pattern was visible in the grouped cards below.\n\n"
            f"Next session: keep your eyeline on the camera, clear the desk of secondary devices, and treat each pause as a chance to re-center. You've got this."
        )

    return {
        "candidate_id": stats.candidate_id,
        "total_violations": stats.total_violations,
        "risk_score": stats.risk_score,
        "report": ai_report,
        "breakdown": breakdown,
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