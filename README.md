<div align="center">

```
 ██████╗ ██╗   ██╗ █████╗ ██████╗ ██████╗
██╔════╝ ██║   ██║██╔══██╗██╔══██╗██╔══██╗
██║  ███╗██║   ██║███████║██████╔╝██║  ██║
██║   ██║██║   ██║██╔══██║██╔══██╗██║  ██║
╚██████╔╝╚██████╔╝██║  ██║██║  ██║██████╔╝
 ╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝
```

### **Guardianship Utilizing AI for Real-time Detection**
#### *A Sovereign Edge-AI Proctoring Ecosystem*

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.136+-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org)
[![YOLOv8](https://img.shields.io/badge/YOLOv8s-Ultralytics-FF6F00?style=for-the-badge)](https://docs.ultralytics.com)
[![MediaPipe](https://img.shields.io/badge/MediaPipe-Face_Mesh-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker)
[![Tailwind](https://img.shields.io/badge/Tailwind-v4-38BDF8?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![SQLite](https://img.shields.io/badge/SQLite-Edge_DB-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://sqlite.org)
[![License](https://img.shields.io/badge/License-MIT-00FF41?style=for-the-badge)](#-license)

</div>

---

## ⚡ What is G.U.A.R.D.?

**G.U.A.R.D.** is a **real-time, edge-native AI proctoring system** built on a dual-model vision pipeline — **MediaPipe Face Mesh** running at 30 fps on CPU as a gatekeeper, with **YOLOv8s** running GPU-accelerated object detection on a 5-second cadence. It analyzes head pose, gaze direction, mouth activity, face count, and prohibited objects (phones, books, laptops) through a deterministic verdict engine — then feeds everything into a temporal **Behavioral Event Accumulator** that separates innocent micro-glances from genuine cheating patterns.

No VLM hallucinations. No cloud dependency. No black box.

> **The philosophy:** A proctoring system should be an *impartial sensor*, not a probability guess. G.U.A.R.D. replaces prompt-based VLM inference with a **deterministic, explainable verdict engine** — every decision is traceable back to exact sensor readings: `Objects: None | Faces: 1 | Pose: left | Talking: false`.

---

## 🏗️ System Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         BROWSER (Next.js 16)                             │
│                                                                          │
│  ┌────────────────────────────────┐   ┌───────────────────────────────┐  │
│  │       SniperScope.tsx          │   │        VoiceOrb.tsx           │  │
│  │  ┌──────────────────────────┐  │   │  ┌─────────────────────────┐ │  │
│  │  │ MediaPipe Face Mesh @30fps│  │   │  │ AudioContext + VAD      │ │  │
│  │  │ → faces, pose, talking   │  │   │  │ SpeechRecognition STT   │ │  │
│  │  └──────────────────────────┘  │   │  │ SpeechSynthesis TTS     │ │  │
│  │  ┌──────────────────────────┐  │   │  │ Framer Motion Orb       │ │  │
│  │  │ WebRTC Camera Feed       │  │   │  └─────────────────────────┘ │  │
│  │  │ 640×360 JPEG @ 5s loop   │  │   └───────────────────────────────┘  │
│  │  └──────────────────────────┘  │                                      │
│  └──────────────┬─────────────────┘                                      │
└─────────────────┼────────────────────────────────────────────────────────┘
                  │  POST /api/v1/analyze-frame
                  │  { candidate_id, timestamp, image_base64,
                  │    faces_detected, is_talking, head_pose }
                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    BACKEND (FastAPI + Uvicorn)                            │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                       edge_main.py                                 │  │
│  │                                                                    │  │
│  │  1. Checks BEA state → is session already SEVERE_VIOLATION?       │  │
│  │  2. Decodes base64 → OpenCV image array                           │  │
│  │  3. YOLOv8s inference (GPU/CPU, classes: person + cell phone)     │  │
│  │  4. Deterministic verdict engine (YOLO + Face + Pose → decision)  │  │
│  │  5. Routes verdict to BEA temporal accumulator                    │  │
│  │  6. Logs to SQLite in background task (with evidence frames)      │  │
│  └────────────────────────┬───────────────────────────────────────────┘  │
│                           │                                              │
│  ┌────────────────────────▼───────────────────────────────────────────┐  │
│  │              core_memory/bea.py  (BEA Engine)                      │  │
│  │                                                                    │  │
│  │  Behavioral Event Accumulator — 5-minute sliding window            │  │
│  │  • Yaw tracker (SIDE_OR_UP): 1 frame (5s) → violation ×1          │  │
│  │  • Pitch tracker (DOWN):     2 frames (10s) → violation ×1        │  │
│  │  • Risk score: min(violations × 20, 100) + burst_bonus            │  │
│  │  • 5 tiers: CLEAR → SOFT_WARNING → WARNING_LOGGED                 │  │
│  │             → HARD_WARNING → SEVERE_VIOLATION_LOGGED               │  │
│  │  • Autopsy flag at risk ≥75% → captures evidence frame            │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  voice_engine.py — Background STT/TTS thread                      │  │
│  │  • pyttsx3 for system speech • SpeechRecognition for candidate    │  │
│  │  • State machine: IDLE → LISTEN → PROCESS → SPEAK                 │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  sentry_logs.db (SQLite)  — full audit trail + evidence frames    │  │
│  │  candidate_id · timestamp · gaze · risk_score · ai_trace · image  │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
                  │
                  ▼  (Post-Session Only)
┌──────────────────────────────────────────────────────────────────────────┐
│         NVIDIA API  (meta/llama-3.1-8b-instruct)                         │
│         Generates personalized AI coaching report on session end          │
│         → Routed to /verdict page with Framer Motion reveal              │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 🧠 The Intelligence Stack

### Dual-Model Vision Pipeline

G.U.A.R.D. runs **two vision models simultaneously** — a fast CPU gatekeeper and a heavy GPU detector:

| Layer | Model | Runtime | FPS | Role |
|-------|-------|---------|-----|------|
| **Gatekeeper** | MediaPipe Face Mesh | CPU (Browser) | 30 | Head pose, face count, mouth activity |
| **Detector** | YOLOv8s (Ultralytics) | GPU/CPU (Backend) | 0.2 (5s) | Object detection: phones, books, laptops, persons |

The **Gatekeeper** runs in-browser via `@mediapipe/face_mesh`, computing:
- **Yaw** (left/right) — normalized nose position between eye bounds
- **Pitch** (up/down) — forehead-to-nose vs nose-to-chin ratio
- **Mouth Aspect Ratio (MAR)** — upper/lower lip distance for talking detection
- **Face count** — up to 3 simultaneous faces tracked

These lightweight telemetry signals are sent alongside every frame to the backend, where **YOLOv8s** performs heavy object detection on the decoded image.

---

### Deterministic Verdict Engine — `edge_main.py`

Unlike VLM-based systems that can hallucinate, G.U.A.R.D. uses a **rule-based decision tree** fed by exact sensor readings:

```
IF faces == 0           → CRITICAL: "Face not visible or obscured"
IF faces > 1            → CRITICAL: "Multiple persons detected"
IF "cell phone" in YOLO → CRITICAL: "Mobile device detected"
IF "book" or "laptop"   → CRITICAL: "Prohibited item detected"
IF pose ∈ {left,right,up} → gaze = SIDE_OR_UP
IF pose == "down"       → gaze = DOWN
ELSE                    → gaze = STRAIGHT (benign)
```

Every verdict produces a traceable **logic trace**: `Objects: cell phone (87%) | Faces: 1 | Pose: left | Talking: false`

**Key safeguard:** Critical flags (phone, multiple faces) trigger an instant fatal lockout via `bea_engine.trigger_fatal_lockout()` — the session is permanently flagged until manual reset.

---

### Memory Engine — `core_memory/bea.py`

The **Behavioral Event Accumulator (BEA)** is the temporal brain of G.U.A.R.D. — a sliding-window risk graph that separates innocent micro-glances from genuine cheating patterns:

```
Risk Score = min(violation_events × 20, 100) + burst_bonus

Intervention Tiers:
   0-19  → CLEAR                    (green)    — No action
  20-39  → SOFT_WARNING             (yellow)   — Monitoring intensifies
  40-74  → WARNING_LOGGED           (orange)   — Logged, under observation
  75-99  → HARD_WARNING             (orange)   — Voice interrogation triggered, evidence captured
  100    → SEVERE_VIOLATION_LOGGED   (red)      — Session permanently flagged
```

**Gaze thresholds** (aligned with Honorlock/Respondus standards):

```
SIDE_OR_UP (yaw):  1 frame  (5s)   → violation ×1
                   3+ frames (15s) → violation ×3  (spike)

DOWN (pitch):      2 frames (10s)  → violation ×1
                   6+ frames (30s) → violation ×3  (spike)

STRAIGHT:          Resets all consecutive counters immediately
```

**Autopsy flag:** When risk ≥ 75%, the `autopsy_flag` is set to `true` — the backend captures the evidence frame (base64 image) into SQLite for post-session forensic review on the `/autopsy` page.

---

### Voice Interrogator — Dual Engine

G.U.A.R.D. has **two voice systems** working in tandem:

**Frontend (`VoiceOrb.tsx`)** — Browser-native interrogation:
1. **TTS**: `SpeechSynthesis` speaks a challenge when risk hits `HARD_WARNING`
2. **STT**: `SpeechRecognition` records the candidate's verbal response
3. **Live VAD**: `AudioContext + AnalyserNode` drives the orb's scale via Framer Motion springs
4. **Transcript**: Live text bubbles to the dashboard

**Backend (`voice_engine.py`)** — Persistent background listener:
1. **Threaded loop**: `SpeechRecognition` + Google STT in a daemon thread
2. **TTS**: `pyttsx3` for system-level speech output
3. **State machine**: `IDLE → LISTEN → PROCESS → SPEAK` (polled via `/api/v1/voice-status`)

The orb has 4 reactive visual states:

| State | Visual | Trigger |
|-------|--------|---------|
| `IDLE` | Dark, dormant | Mic inactive |
| `LISTEN` | 🟢 Neon pulse, scale = f(volume) | Audio VAD active |
| `PROCESS` | 🟠 Spinning dashed ring | Speech ended, analyzing |
| `SPEAK` | 🔵 Erratic cyan burst | System is speaking |

---

### Post-Session AI Coach — `/verdict`

When the proctor clicks **"End Session & Generate Report"**, G.U.A.R.D.:

1. Computes actual session duration from `Date.now() - sessionStartTime`
2. Packages `{ total_violations, risk_score, session_duration_sec, critical_flags }` → `POST /generate-verdict`
3. Backend calls **NVIDIA API** (`meta/llama-3.1-8b-instruct`) with a 3-paragraph coaching prompt
4. Result is stored in `localStorage` and rendered on `/verdict` with staggered Framer Motion blur-reveals

---

## 🚀 Setup & Boot

### Prerequisites

| Requirement | Version | Install |
|---|---|---|
| Python | 3.11+ | [python.org](https://python.org) |
| Node.js | 18+ | [nodejs.org](https://nodejs.org) |
| pnpm | 10+ | `npm i -g pnpm` |
| CUDA *(optional)* | 11.8+ | [nvidia.com/cuda](https://developer.nvidia.com/cuda-downloads) |

> **GPU Note:** YOLOv8s auto-detects CUDA. If no GPU is available, it falls back to CPU inference seamlessly.

---

### 1. Clone

```bash
git clone https://github.com/electrifiedchan/guard-edge-ai-proctoring.git
cd guard-edge-ai-proctoring
```

### 2. Backend

```bash
cd backend

# Create virtual environment
python -m venv .venv

# Activate (Windows)
.venv\Scripts\activate

# Activate (Mac/Linux)
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Frontend

```bash
cd frontend
pnpm install
```

### 4. Environment Variables

Create a `.env` file in the `backend/` directory:

```env
NVIDIA_API_KEY=nvapi-xxxxx   # Required for post-session AI coaching report
```

> The NVIDIA API is only used for the optional post-session coaching report (`/generate-verdict`). All real-time proctoring runs fully offline.

---

### 🟢 Boot Sequence

**Option A — Manual (2 terminals):**

```bash
# Terminal 1 — Backend
cd backend
python -m uvicorn edge_main:app --host 0.0.0.0 --port 8080 --reload

# Terminal 2 — Frontend
cd frontend
pnpm dev
```

**Option B — One-click (Windows):**

```bash
startapp.bat
```

**Option C — Docker Compose:**

```bash
docker-compose up
```

Open **[http://localhost:3000](http://localhost:3000)** — the dashboard is live.

---

## 🖥️ Pages & UI

| Route | Name | Description |
|-------|------|-------------|
| `/` | **Main Dashboard** | Live camera feed, SniperScope HUD, VoiceOrb, BEA telemetry, risk score, inference log |
| `/autopsy` | **S.P.A.R.T.A. Terminal Autopsy** | Post-session evidence gallery — captured frames with AI logic traces, risk scores, timestamps |
| `/verdict` | **AI Coaching Report** | Personalized 3-paragraph coaching report generated by Llama 3.1 via NVIDIA API |

---

## 🌐 API Reference

**Interactive Docs:** [http://localhost:8080/docs](http://localhost:8080/docs) (Swagger UI, auto-generated)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/analyze-frame` | Submit frame + face telemetry for YOLO + verdict analysis |
| `GET` | `/api/v1/status/{candidate_id}` | Get current BEA risk state for a candidate |
| `GET` | `/api/v1/logs` | Fetch last 50 audit log entries |
| `GET` | `/api/v1/autopsy-logs` | Fetch all evidence frames (violations with captured images) |
| `GET` | `/api/v1/voice-status` | Poll current voice engine state (`IDLE`/`LISTEN`/`PROCESS`/`SPEAK`) |
| `POST` | `/generate-verdict` | Generate AI coaching report via NVIDIA Llama 3.1 |
| `POST` | `/reset-session` | Clear a candidate's BEA memory and unlock session |

---

### `POST /api/v1/analyze-frame`

**Request:**
```json
{
  "candidate_id": "major_project_candidate_01",
  "timestamp": 1714000000000,
  "image_base64": "<base64-encoded-jpeg>",
  "faces_detected": 1,
  "is_talking": false,
  "head_pose": "center"
}
```

**Response:**
```json
{
  "candidate_id": "major_project_candidate_01",
  "timestamp": 1714000000000,
  "verdict": "Candidate is fully engaged and attentive.",
  "gaze": "STRAIGHT",
  "risk_packet": {
    "candidate_id": "major_project_candidate_01",
    "risk_score": 0,
    "violation_count": 0,
    "critical_flags": [],
    "intervention_level": "CLEAR",
    "is_locked": false,
    "autopsy_flag": false
  }
}
```

---

## 📁 Project Structure

```
guard-edge-ai-proctoring/
│
├── backend/
│   ├── edge_main.py              # FastAPI app — YOLO inference, verdict engine, SQLite logging
│   ├── voice_engine.py           # Background STT/TTS thread (pyttsx3 + SpeechRecognition)
│   ├── core_memory/
│   │   └── bea.py                # Behavioral Event Accumulator (temporal risk graph)
│   ├── yolov8s.pt                # YOLOv8s pre-trained weights
│   └── sentry_logs.db            # SQLite audit database (auto-created)
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── globals.css       # Tailwind v4 + custom theme (sentry-neon, sentry-border)
│   │   │   ├── layout.tsx        # Root layout
│   │   │   ├── page.tsx          # Main dashboard — SniperScope + VoiceOrb + telemetry
│   │   │   ├── autopsy/
│   │   │   │   └── page.tsx      # S.P.A.R.T.A. Terminal Autopsy — evidence gallery
│   │   │   └── verdict/
│   │   │       └── page.tsx      # Post-session AI coaching report (Framer Motion)
│   │   └── components/
│   │       ├── SniperScope.tsx   # Camera feed, MediaPipe Face Mesh, YOLO loop, targeting HUD
│   │       ├── VoiceOrb.tsx      # Audio-reactive orb, VAD, SpeechRecognition/Synthesis
│   │       └── AuditTrail.tsx    # Real-time audit log table (polls /api/v1/logs)
│   └── package.json
│
├── graphify-out/                  # Codebase knowledge graph (auto-generated)
│   ├── graph.html                 # Interactive dependency visualization
│   ├── graph.json                 # Raw graph data (57 nodes, 56 edges, 5 communities)
│   └── GRAPH_REPORT.md           # Architecture analysis report
│
├── docker-compose.yml             # Full-stack containerized deployment
├── startapp.bat                   # Windows one-click launcher
├── requirements.txt               # Python dependencies
└── README.md
```

---

## 🛡️ Security Architecture

G.U.A.R.D. implements a **5-layer tripwire system**:

```
Layer 1 — HARDWARE TRIPWIRE (SniperScope.tsx)
  ├── Enumerates video devices on startup via navigator.mediaDevices
  ├── Flags OBS, virtual cameras, Snap Camera by label string match
  └── Instant COMPROMISED state on detection

Layer 2 — CPU GATEKEEPER (SniperScope.tsx + MediaPipe Face Mesh)
  ├── 30 fps real-time face landmark tracking (468 points)
  ├── Morphological head pose estimation (yaw + pitch)
  ├── Multi-face detection (up to 3 simultaneous faces)
  ├── Mouth Aspect Ratio for talking/earpiece detection
  └── Runs entirely in-browser — zero backend latency

Layer 3 — GPU DETECTOR (edge_main.py + YOLOv8s)
  ├── 12 FPM (1 frame every 5 seconds) inference cadence
  ├── Object detection: cell phone (class 67) + person (class 0)
  ├── Confidence threshold: 0.65 (tuned to minimize false positives)
  └── Critical detection → instant fatal lockout via BEA

Layer 4 — BEHAVIORAL TRIPWIRE (bea.py)
  ├── 5-minute sliding window temporal analysis
  ├── Escalation: CLEAR → SOFT → WARNING → HARD → SEVERE
  ├── Burst detection: 3 violations in 30s → +15 risk bonus
  └── Autopsy flag at risk ≥75% (captures evidence frame to SQLite)

Layer 5 — POST-SESSION AUDIT (sentry_logs.db + /autopsy)
  ├── Every inference logged: candidate_id, timestamp, gaze, risk, AI trace
  ├── Evidence frames captured at autopsy-flagged severity levels
  └── S.P.A.R.T.A. Autopsy page: timestamped photographic evidence grid
```

---

## 🔧 Configuration

Key constants you can tune:

| File | Constant | Default | Description |
|------|----------|---------|-------------|
| `edge_main.py` | `yolo_model(conf=...)` | `0.65` | YOLO confidence threshold |
| `edge_main.py` | `yolo_model(imgsz=...)` | `640` | YOLO input resolution |
| `edge_main.py` | `yolo_model(classes=...)` | `[0, 67]` | YOLO target classes (person, cell phone) |
| `SniperScope.tsx` | `loopTimerRef` timeout | `5000ms` | Backend inference cadence (5s = 12 FPM) |
| `SniperScope.tsx` | `targetWidth × targetHeight` | `640×360` | Frame capture resolution |
| `SniperScope.tsx` | `pitchRatio` thresholds | `>1.4 / <0.7` | Head pitch sensitivity |
| `SniperScope.tsx` | `noseX` thresholds | `<0.40 / >0.60` | Head yaw sensitivity |
| `bea.py` | `window_size_seconds` | `300` | Sliding memory window (5 minutes) |
| `bea.py` | Risk tier thresholds | `20/40/75/100` | Escalation breakpoints |

---

## 🖥️ Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Object Detection** | YOLOv8s (Ultralytics) on PyTorch | State-of-the-art real-time detection, CUDA-accelerated |
| **Face Analysis** | MediaPipe Face Mesh (468 landmarks) | 30 fps CPU-only, no backend round-trip |
| **Backend** | FastAPI + Uvicorn | Async, auto-docs, background tasks |
| **Memory** | BEA (Pure Python) + SQLite | Zero-dependency temporal risk graph |
| **AI Coach** | NVIDIA API (Llama 3.1 8B Instruct) | Post-session coaching reports |
| **Frontend** | Next.js 16 (Turbopack) | React 19, App Router, fast HMR |
| **Styling** | Tailwind CSS v4 | CSS-native `@theme` variables |
| **Animation** | Framer Motion 12 | Spring physics, staggered reveals |
| **Voice** | Web Audio API + SpeechRecognition + pyttsx3 | Browser-native + system-level TTS |
| **Deployment** | Docker Compose | Full-stack containerization |

---

## 📄 License

MIT — build on it, fork it, make it yours.

---

<div align="center">

**Built with intent. Runs on the edge. Answers to no one.**

*G.U.A.R.D. — Sovereignty is a feature, not a setting.*

</div>
