from concurrent.futures import ThreadPoolExecutor
import asyncio
import logging
import base64
import uuid
import time
import cv2
import numpy as np
import os
from openai import AsyncOpenAI
from dotenv import load_dotenv

load_dotenv()
from ultralytics import YOLO
from contextlib import asynccontextmanager
from fastapi import FastAPI, File, HTTPException, BackgroundTasks, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from core_memory.bea import bea_engine
import shutil
from core_memory.interviewer import ai_interviewer
from core_memory.conversation_engine import conversation_engine
from core_memory.timeline import (
    init_timeline_tables,
    insert_frame,
    insert_moment,
    get_timeline,
)
from core_memory.voice_engine import transcribe_audio as whisper_transcribe
import voice_engine
import tempfile

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
EVIDENCE_DIR = os.path.join(BACKEND_DIR, "evidence")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🛡️  G.U.A.R.D. Engine warming up...")
    init_timeline_tables()   # ← MR 1: replaces old init_db()
    os.makedirs(EVIDENCE_DIR, exist_ok=True)

    if os.getenv("DISABLE_VOICE_ENGINE", "false").lower() != "true":
        try:
            voice_engine.start_voice_loop()
        except Exception as e:
            logger.warning(f"⚠️  Voice engine failed to start: {e}")
    else:
        logger.info("🔇 Voice engine disabled via DISABLE_VOICE_ENGINE")

    app.state.executor = ThreadPoolExecutor(max_workers=2)
    yield
    app.state.executor.shutdown(wait=False)


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="G.U.A.R.D. Edge Vision Sentry", lifespan=lifespan)

DEFAULT_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000"
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv("ALLOWED_ORIGINS", DEFAULT_ORIGINS).split(",")
    if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
logger.info(f"🌐 CORS allowed origins: {ALLOWED_ORIGINS}")

# Serve evidence frames by URL so the frontend can <img src> them
os.makedirs(EVIDENCE_DIR, exist_ok=True)
app.mount("/api/v1/evidence", StaticFiles(directory=EVIDENCE_DIR), name="evidence")


# ---------------------------------------------------------------------------
# YOLO
# ---------------------------------------------------------------------------
import torch
device = "cuda" if torch.cuda.is_available() else "cpu"
yolo_model = YOLO("yolov8s.pt")
yolo_model.to(device)
logger.info(f"🔫 YOLOv8s loaded on {device.upper()}")


# ---------------------------------------------------------------------------
# Evidence helper
# ---------------------------------------------------------------------------
def write_evidence_frame(session_id: str, image_base64: str) -> str | None:
    """Decode a base64 JPEG, write to EVIDENCE_DIR, return the URL path."""
    try:
        raw = image_base64.split(",", 1)[1] if "," in image_base64 else image_base64
        img_bytes = base64.b64decode(raw)
        filename = f"{session_id}_{int(time.time() * 1000)}_{uuid.uuid4().hex[:8]}.jpg"
        filepath = os.path.join(EVIDENCE_DIR, filename)
        with open(filepath, "wb") as f:
            f.write(img_bytes)
        return f"/api/v1/evidence/{filename}"
    except Exception as e:
        logger.error(f"❌ Evidence write error: {e}")
        return None


# ---------------------------------------------------------------------------
# Verdict logic (unchanged)
# ---------------------------------------------------------------------------
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
    elif head_pose in ["HEAD_LEFT", "HEAD_RIGHT", "HEAD_UP"]:
        gaze = "SIDE_OR_UP"
        direction = head_pose.replace("HEAD_", "").lower()
        verdict = f"Attention drift detected: head tilted {direction}."
    elif head_pose == "HEAD_DOWN":
        gaze = "DOWN"
        verdict = "Attention drift detected: head tilted down."

    if talking and not is_critical:
        verdict += " Verbal activity detected — possible earpiece coaching."

    logic_trace = (
        f"Objects: {detected_objects or 'None'} | Faces: {faces} "
        f"| Pose: {head_pose} | Talking: {talking}"
    )
    return gaze, is_critical, verdict, logic_trace


# ---------------------------------------------------------------------------
# Frame payload model
# ---------------------------------------------------------------------------
class FramePayload(BaseModel):
    candidate_id: str
    timestamp: int
    image_base64: str
    faces_detected: int = 1
    is_talking: bool = False
    head_pose: str = "HEAD_CENTER"
    gaze_vector: list[float] | None = None
    # Optional: frontend may pass the active session_id once sessions are wired
    session_id: str | None = None


# ---------------------------------------------------------------------------
# /api/v1/analyze-frame  — MR 1 ingestion rewired to timeline_frames
# ---------------------------------------------------------------------------
@app.post("/api/v1/analyze-frame")
async def analyze_frame(payload: FramePayload, background_tasks: BackgroundTasks):
    print(
        f"\n📥 [BACKEND] INCOMING PAYLOAD → "
        f"Faces: {payload.faces_detected}, Pose: '{payload.head_pose}', Talking: {payload.is_talking}"
    )

    # Use candidate_id as the session_id when no explicit session is provided
    session_id = payload.session_id or payload.candidate_id

    current_state = await bea_engine.get_state(session_id)
    if current_state.get("intervention_level") == "SEVERE_VIOLATION_LOGGED":
        return {
            "candidate_id": payload.candidate_id,
            "timestamp": payload.timestamp,
            "verdict": "SESSION FLAGGED",
            "risk_packet": current_state,
        }

    # --- PHASE 1: Decode image ---
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

    # --- PHASE 2: YOLO (off event-loop, non-blocking) ---
    loop = asyncio.get_running_loop()
    results = await loop.run_in_executor(
        app.state.executor,
        lambda: yolo_model(image, verbose=False, classes=[0, 67], imgsz=640, augment=False, conf=0.65),
    )
    detected_objects = []
    for r in results:
        for box in r.boxes:
            cls_id = int(box.cls[0])
            label = yolo_model.names[cls_id]
            conf = float(box.conf[0])
            detected_objects.append(f"{label} ({conf:.0%})")
    logger.info(f"🔫 YOLO: {detected_objects or 'Nothing detected'}")

    # --- PHASE 3: Deterministic verdict ---
    gaze, is_critical, verdict, logic_trace = determine_verdict(
        detected_objects=detected_objects,
        faces=payload.faces_detected,
        talking=payload.is_talking,
        head_pose=payload.head_pose,
    )

    # --- PHASE 4: BEA temporal graph ---
    if is_critical:
        decision = await bea_engine.record_critical_signal(session_id, True, verdict)
        if decision["confirmed"]:
            consolidated = "; ".join(decision["pending_reasons"]) or verdict
            risk_packet = await bea_engine.trigger_fatal_lockout(session_id, reason=consolidated)
            verdict = f"CONFIRMED ({decision['count']}/{decision['threshold']}): {consolidated}"
        else:
            risk_packet = await bea_engine.record_telemetry(session_id, "SIDE_OR_UP")
            risk_packet["critical_pending"] = decision["count"]
            risk_packet["critical_threshold"] = decision["threshold"]
            verdict = f"⚠️ ANOMALY {decision['count']}/{decision['threshold']}: {verdict}"
    else:
        await bea_engine.record_critical_signal(session_id, False, "")
        risk_packet = await bea_engine.record_telemetry(session_id, gaze)

    # --- PHASE 5: MR 1 — persist to timeline_frames ---
    risk_score: int = risk_packet.get("risk_score", 0)
    composure: float = 100.0 - risk_score          # ← composure = 100 - risk
    autopsy_flag: bool = risk_packet.get("autopsy_flag", False)

    frame_id = uuid.uuid4().hex
    t_now = time.time()

    background_tasks.add_task(
        insert_frame,
        frame_id,
        session_id,
        t_now,
        composure,
        gaze,
        payload.head_pose,
        payload.faces_detected,
        payload.is_talking,
    )

    # Write evidence frame and log as a moment when BEA flags it
    if autopsy_flag:
        evidence_url = write_evidence_frame(session_id, payload.image_base64)
        moment_caption = verdict[:200]
        background_tasks.add_task(
            insert_moment,
            uuid.uuid4().hex,
            session_id,
            t_now,
            risk_packet.get("intervention_level", "WARNING"),
            moment_caption,
            evidence_url,
        )

    background_tasks.add_task(bea_engine.cleanup_stale_sessions)

    logger.info(f"👁️  VERDICT: {verdict}")
    logger.info(f"🧠  TRACE:   {logic_trace}")
    logger.info(f"🎯  GAZE: {gaze} | COMPOSURE: {composure:.0f}% | [{risk_packet['intervention_level']}]")
    logger.info("-" * 50)

    return {
        "candidate_id": payload.candidate_id,
        "session_id": session_id,
        "timestamp": payload.timestamp,
        "verdict": verdict,
        "gaze": gaze,
        "risk_packet": risk_packet,
    }


# ---------------------------------------------------------------------------
# GET /api/v1/session/{session_id}/timeline  — MR 1 read endpoint
# ---------------------------------------------------------------------------
@app.get("/api/v1/session/{session_id}/timeline")
async def get_session_timeline(session_id: str):
    """Return all timeline_frames and moments for a session."""
    try:
        return get_timeline(session_id)
    except Exception as e:
        logger.error(f"❌ Timeline read error: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve timeline.")


# ---------------------------------------------------------------------------
# Voice status
# ---------------------------------------------------------------------------
@app.get("/api/v1/voice-status")
async def get_voice_status():
    return voice_engine.voice_state


# ---------------------------------------------------------------------------
# Session breakdown (kept for verdict page compatibility)
# ---------------------------------------------------------------------------
VIOLATION_TYPES = {
    "DOWN_GAZE":       lambda gaze, pose: gaze == "DOWN",
    "SIDE_GAZE":       lambda gaze, pose: gaze == "SIDE_OR_UP",
    "MOBILE_DEVICE":   lambda gaze, pose: False,   # YOLO trace not stored in new schema
    "PROHIBITED_ITEM": lambda gaze, pose: False,
    "MULTIPLE_FACES":  lambda gaze, pose: False,
    "NO_FACE":         lambda gaze, pose: False,
    "TALKING":         lambda gaze, pose: False,
}

INFERENCE_CADENCE_SEC = 5

VIOLATION_LABELS = {
    "DOWN_GAZE":  "looking down (off-screen / at lap)",
    "SIDE_GAZE":  "looking sideways or up (off-screen)",
}


def _compute_session_breakdown(session_id: str, since_iso: str | None = None) -> dict:
    """Derive a violation breakdown from timeline_frames."""
    import contextlib
    from core_memory.timeline import _db
    from datetime import datetime

    with contextlib.closing(_db()) as conn:
        conn.row_factory = __import__("sqlite3").Row
        rows = [
            dict(r)
            for r in conn.execute(
                "SELECT * FROM timeline_frames WHERE session_id = ? ORDER BY t",
                (session_id,),
            )
        ]

    # Optional time-scope filter
    if since_iso:
        try:
            since_ts = datetime.fromisoformat(since_iso.replace("Z", "+00:00")).timestamp()
            rows = [r for r in rows if r["t"] >= since_ts]
        except Exception as e:
            logger.warning(f"⚠️ Could not parse since_iso '{since_iso}': {e}")

    buckets: dict[str, dict] = {
        t: {"count": 0, "first_at": None, "last_at": None,
            "peak_risk": 0, "peak_intervention_level": "CLEAR",
            "evidence_paths": [], "sample_events": []}
        for t in ("DOWN_GAZE", "SIDE_GAZE")
    }
    peak_event = None

    for row in rows:
        gaze = row.get("gaze") or ""
        composure = row.get("composure", 100)
        risk = int(100 - composure)
        ts = row["t"]

        if peak_event is None or risk > peak_event["risk_score"]:
            peak_event = {"timestamp": ts, "risk_score": risk,
                          "intervention_level": "", "logic_trace": ""}

        for vtype in ("DOWN_GAZE", "SIDE_GAZE"):
            predicate = VIOLATION_TYPES[vtype]
            if not predicate(gaze, row.get("head_pose", "")):
                continue
            b = buckets[vtype]
            b["count"] += 1
            if b["first_at"] is None:
                b["first_at"] = ts
            b["last_at"] = ts
            if risk > b["peak_risk"]:
                b["peak_risk"] = risk
            if len(b["sample_events"]) < 5:
                b["sample_events"].append({"timestamp": ts, "risk_score": risk})

    violations_by_type = {}
    for vtype, b in buckets.items():
        if b["count"] == 0:
            continue
        b["approx_total_seconds"] = b["count"] * INFERENCE_CADENCE_SEC
        violations_by_type[vtype] = b

    return {
        "candidate_id": session_id,
        "total_events": len(rows),
        "violations_by_type": violations_by_type,
        "peak_event": peak_event,
        "session_window": {
            "first_event_at": rows[0]["t"] if rows else None,
            "last_event_at": rows[-1]["t"] if rows else None,
        },
    }


@app.get("/api/v1/session-breakdown/{candidate_id}")
async def get_session_breakdown(candidate_id: str, since: str | None = None):
    try:
        return _compute_session_breakdown(candidate_id, since_iso=since)
    except Exception as e:
        logger.error(f"❌ Session breakdown error: {e}")
        raise HTTPException(status_code=500, detail="Failed to compute session breakdown.")


# ---------------------------------------------------------------------------
# Verdict report (LLM coaching)
# ---------------------------------------------------------------------------
VIOLATION_LABELS_FULL = {
    "DOWN_GAZE": "looking down (off-screen / at lap)",
    "SIDE_GAZE": "looking sideways or up (off-screen)",
}


def _format_breakdown_for_prompt(breakdown: dict) -> str:
    by_type = breakdown.get("violations_by_type") or {}
    if not by_type:
        return "No behavioural violations were logged during this session."
    lines = []
    for vtype, b in sorted(by_type.items(), key=lambda kv: -kv[1]["peak_risk"]):
        label = VIOLATION_LABELS_FULL.get(vtype, vtype)
        lines.append(
            f"- {label}: {b['count']} event(s), ~{b['approx_total_seconds']}s cumulative, "
            f"peak risk {b['peak_risk']}%, first at {b['first_at']}, last at {b['last_at']}"
        )
    return "\n".join(lines)


class FinalStats(BaseModel):
    candidate_id: str
    total_violations: int
    risk_score: int
    session_duration_sec: int = 300
    critical_flags: list[str] = []
    session_started_at: str | None = None


@app.post("/generate-verdict")
async def generate_verdict(stats: FinalStats):
    try:
        breakdown = _compute_session_breakdown(stats.candidate_id, since_iso=stats.session_started_at)
    except Exception as e:
        logger.error(f"⚠️ Could not compute breakdown for verdict: {e}")
        breakdown = {"violations_by_type": {}, "peak_event": None, "session_window": {}}

    breakdown_block = _format_breakdown_for_prompt(breakdown)
    critical_context = ""
    if stats.critical_flags:
        flags_text = ", ".join(stats.critical_flags)
        critical_context = (
            f"\nCRITICAL VIOLATIONS: {flags_text}. Address this directly in paragraph 2.\n"
        )

    prompt = f"""You are a supportive interview coach reviewing a candidate's proctored session. Your tone is direct, warm, and constructive. Never invent details; every claim must be grounded in the data below.

SESSION DATA
Candidate: {stats.candidate_id}
Peak risk score: {stats.risk_score}%
Total flagged events: {stats.total_violations}
Approx session duration: {stats.session_duration_sec}s{critical_context}

BEHAVIOURAL BREAKDOWN (grouped by type)
{breakdown_block}

Write a 3-paragraph coaching report in plain prose (no bullet lists, no headings).
Paragraph 1 — Acknowledge effort, name one concrete strength from the numbers.
Paragraph 2 — Name the single most impactful pattern. Quote count and approx duration.
Paragraph 3 — Two specific actionable habits. Close with genuine encouragement.

Hard rules:
- Use ONLY the numbers shown. Do not invent percentages.
- Speak as a coach, not as an AI.
- Say 'moment', 'event', or 'pattern', never 'violation' or 'breach'.
- Keep it under 220 words."""

    try:
        client = AsyncOpenAI(
            base_url="https://integrate.api.nvidia.com/v1",
            api_key=os.environ.get("NVIDIA_API_KEY"),
        )
        completion = await client.chat.completions.create(
            model="meta/llama-3.1-8b-instruct",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.6,
            max_tokens=520,
        )
        ai_report = completion.choices[0].message.content
    except Exception as e:
        logger.error(f"NVIDIA API error: {e}")
        ai_report = (
            f"Mock Report (API unreachable):\n\n"
            f"You showed up and ran the full session — that takes focus.\n\n"
            f"The breakdown logged {stats.total_violations} flagged moments with a peak risk of {stats.risk_score}%.\n\n"
            f"Next session: keep your eyeline on the camera and treat each pause as a chance to re-center. You've got this."
        )

    return {
        "candidate_id": stats.candidate_id,
        "total_violations": stats.total_violations,
        "risk_score": stats.risk_score,
        "report": ai_report,
        "breakdown": breakdown,
    }


# ---------------------------------------------------------------------------
# GET /api/v1/logs  — Feeds the frontend AuditTrail component
# ---------------------------------------------------------------------------
@app.get("/api/v1/logs")
async def get_recent_logs():
    import sqlite3
    import contextlib
    from datetime import datetime
    from core_memory.timeline import DB_PATH
    
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        conn.row_factory = sqlite3.Row
        # Grab latest 50 frames, joined with moments where they exist
        rows = conn.execute(
            """
            SELECT f.frame_id as id, f.session_id as candidate_id, f.t as t, 
                   f.gaze, f.composure, f.head_pose, m.type as intervention_level, m.caption as logic_trace
            FROM timeline_frames f
            LEFT JOIN moments m ON f.t = m.t AND f.session_id = m.session_id
            ORDER BY f.t DESC LIMIT 50
            """
        ).fetchall()
        
        results = []
        for r in rows:
            risk = int(100 - r["composure"])
            # Synthesize intervention level if no explicit moment is tied to this frame
            if r["intervention_level"]:
                intervention = r["intervention_level"]
                logic = r["logic_trace"]
            else:
                intervention = "CLEAR" if risk < 20 else "SOFT_WARNING" if risk < 40 else "WARNING"
                logic = f"Gaze: {r['gaze']}, Pose: {r['head_pose']}"
                
            results.append({
                "id": r["id"],
                "candidate_id": r["candidate_id"],
                "timestamp": datetime.fromtimestamp(r["t"]).isoformat(),
                "gaze": r["gaze"],
                "is_critical": risk >= 80,
                "risk_score": risk,
                "intervention_level": intervention,
                "ai_logic_trace": logic
            })
        return results


# ---------------------------------------------------------------------------
# Misc endpoints
# ---------------------------------------------------------------------------
@app.get("/api/v1/status/{candidate_id}")
async def get_candidate_status(candidate_id: str):
    return await bea_engine.get_state(candidate_id)


@app.post("/reset-session")
async def reset_session(candidate_id: str = "major_project_candidate_01"):
    await bea_engine.reset_candidate(candidate_id)
    return {"status": "success", "message": "Memory cleared."}


# ---------------------------------------------------------------------------
# MR 3: AI Interviewer Endpoints
# ---------------------------------------------------------------------------
@app.post("/api/v1/interview/upload-resume")
async def upload_resume(file: UploadFile = File(...)):
    """Accepts a PDF, parses it, and returns LLM-generated STAR questions."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    temp_path = f"temp_{uuid.uuid4().hex}.pdf"

    try:
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        resume_text = ai_interviewer.extract_text_from_pdf(temp_path)
        if not resume_text:
            raise HTTPException(status_code=422, detail="Could not extract text from the provided PDF.")

        logger.info(f"\U0001f9e0 Generating questions for resume: {file.filename}")
        questions = await ai_interviewer.generate_questions(resume_text)

        return {
            "status": "success",
            "filename": file.filename,
            "questions": questions,
        }
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


# ---------------------------------------------------------------------------
# MR 4: Local Voice Transcription (faster-whisper, fully offline)
# ---------------------------------------------------------------------------
ALLOWED_AUDIO_TYPES = {
    "audio/webm", "audio/ogg", "audio/wav", "audio/wave", "audio/x-wav",
    "audio/mp3", "audio/mpeg", "audio/mp4", "audio/m4a", "audio/flac",
    "video/webm",  # browser MediaRecorder often sends video/webm for audio-only
}


@app.post("/api/v1/voice/transcribe")
async def transcribe_audio_endpoint(file: UploadFile = File(...)):
    """Accept an audio file, transcribe locally via faster-whisper, return text."""

    # Validate content type (lenient — browsers vary)
    content_type = (file.content_type or "").lower().split(";")[0].strip()
    if content_type and content_type not in ALLOWED_AUDIO_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio type: {content_type}. Send wav, webm, ogg, mp3, or m4a.",
        )

    # Determine file extension from the original filename or content type
    ext = ".webm"
    if file.filename:
        _, dot_ext = os.path.splitext(file.filename)
        if dot_ext:
            ext = dot_ext

    tmp_fd = None
    tmp_path = None
    try:
        # Write upload to a temp file (faster-whisper needs a file path)
        tmp_fd, tmp_path = tempfile.mkstemp(suffix=ext, prefix="guard_audio_")
        with os.fdopen(tmp_fd, "wb") as tmp_file:
            tmp_fd = None  # os.fdopen takes ownership of the fd
            shutil.copyfileobj(file.file, tmp_file)

        # Run transcription on the thread pool so we don't block the event loop
        loop = asyncio.get_running_loop()
        transcript = await loop.run_in_executor(
            app.state.executor,
            whisper_transcribe,
            tmp_path,
        )

        logger.info(f"🎙️  Transcription complete: {len(transcript)} chars")
        return {"status": "success", "transcript": transcript}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Transcription error: {e}")
        raise HTTPException(status_code=500, detail="Transcription failed.")
    finally:
        # Clean up temp file
        if tmp_fd is not None:
            os.close(tmp_fd)
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)


# ---------------------------------------------------------------------------
# MR 6: Verdict Engine — AI Coaching Report
# ---------------------------------------------------------------------------
class VerdictRequest(BaseModel):
    questions: list[str]
    transcripts: list[str]
    average_focus_score: float


@app.post("/api/v1/interview/generate-verdict")
async def generate_verdict(payload: VerdictRequest):
    """Evaluate interview answers + focus score and return an AI coaching report."""

    if len(payload.questions) == 0 or len(payload.transcripts) == 0:
        raise HTTPException(status_code=400, detail="Questions and transcripts are required.")

    if len(payload.questions) != len(payload.transcripts):
        raise HTTPException(
            status_code=400,
            detail="Questions and transcripts must be the same length.",
        )

    # Build the QA block for the LLM
    qa_block = ""
    for i, (q, a) in enumerate(zip(payload.questions, payload.transcripts), 1):
        qa_block += f"\n--- Question {i} ---\nQ: {q}\nA: {a}\n"

    focus_label = (
        "Excellent" if payload.average_focus_score >= 80
        else "Moderate" if payload.average_focus_score >= 50
        else "Poor"
    )

    prompt = f"""You are a strict but empathetic executive interview coach. A candidate just completed a practice interview. Evaluate their performance and provide actionable coaching feedback.

INTERVIEW DATA:
{qa_block}

FOCUS/COMPOSURE SCORE: {payload.average_focus_score:.0f}/100 ({focus_label})
(This score measures eye contact, head stability, and engagement via computer vision during the interview.)

INSTRUCTIONS:
- Write exactly 3 paragraphs of coaching feedback.
- Paragraph 1: Overall impression — were the answers structured (STAR method), specific, and compelling?
- Paragraph 2: Identify the weakest answer and explain specifically how to improve it.
- Paragraph 3: Comment on their composure/focus score and body language. If high, praise discipline. If low, give concrete tips for camera presence.
- Be direct. No fluff. Use "you" to address the candidate.
- End with one punchy sentence summarizing their readiness level.

Return ONLY the coaching text. No JSON, no markdown headers, no pleasantries."""

    try:
        nvidia_api_key = os.getenv("NVIDIA_API_KEY", "")
        client = AsyncOpenAI(
            base_url="https://integrate.api.nvidia.com/v1",
            api_key=nvidia_api_key,
        )

        completion = await client.chat.completions.create(
            model="meta/llama-3.1-8b-instruct",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.6,
            max_tokens=800,
        )

        report = completion.choices[0].message.content.strip()
        logger.info(f"📋 Verdict generated: {len(report)} chars")

        return {
            "status": "success",
            "report": report,
            "focus_score": payload.average_focus_score,
            "focus_label": focus_label,
        }

    except Exception as e:
        logger.error(f"❌ Verdict generation failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate coaching report.")


# ---------------------------------------------------------------------------
# MR 7: Conversational Interview Engine
# ---------------------------------------------------------------------------
class StartSessionRequest(BaseModel):
    resume_text: str
    questions: list[dict]


class ConversationTurnRequest(BaseModel):
    session_id: str
    transcript: str
    focus_score: float = 100.0


class EndSessionRequest(BaseModel):
    session_id: str


@app.post("/api/v1/interview/start-session")
async def start_interview_session(payload: StartSessionRequest):
    """Create a conversational interview session and return the AI's opening greeting."""
    try:
        result = await conversation_engine.create_session(
            resume_text=payload.resume_text,
            questions=payload.questions,
        )
        logger.info(f"🎬 Interview session started: {result['session_id']}")
        return result
    except Exception as e:
        logger.error(f"❌ Session creation failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to start interview session.")


@app.post("/api/v1/interview/conversation-turn")
async def interview_conversation_turn(payload: ConversationTurnRequest):
    """Process a candidate's spoken answer and return the AI's conversational response."""
    try:
        result = await conversation_engine.process_candidate_turn(
            session_id=payload.session_id,
            transcript=payload.transcript,
            focus_score=payload.focus_score,
        )
        logger.info(
            f"💬 Turn {result['turn_number']} | persona={result['persona']} | "
            f"complete={result['is_complete']}"
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"❌ Conversation turn failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Conversation turn error: {str(e)}")


@app.post("/api/v1/interview/end-session")
async def end_interview_session(payload: EndSessionRequest):
    """Generate the final empathetic coaching verdict for the interview session."""
    try:
        result = await conversation_engine.generate_final_verdict(payload.session_id)
        logger.info(f"📋 Session {payload.session_id} verdict generated")
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"❌ Verdict generation failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate verdict.")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)