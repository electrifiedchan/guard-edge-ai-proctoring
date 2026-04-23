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

![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=next.js&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-v4-38BDF8?style=for-the-badge&logo=tailwindcss&logoColor=white)
![Ollama](https://img.shields.io/badge/Ollama-LLaMA_3.2_Vision-FF6B35?style=for-the-badge)
![SQLite](https://img.shields.io/badge/SQLite-Edge_DB-003B57?style=for-the-badge&logo=sqlite&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-00FF41?style=for-the-badge)

</div>

---

## ⚡ What is G.U.A.R.D.?

**G.U.A.R.D.** is a fully **offline, sovereign** AI proctoring system. Unlike cloud-based proctoring tools that stream your webcam to remote servers, G.U.A.R.D. runs **entirely on your machine**. The vision model, the memory engine, and the audit database — all local, all private, all real-time.

No data leaves the device. No subscriptions. No surveillance capitalism.

> **The philosophy:** A proctoring system should be an *impartial sensor*, not a black box. G.U.A.R.D. is built on explainable AI — every decision is logged with a full reasoning trace.

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        BROWSER (Next.js 16)                         │
│                                                                     │
│  ┌──────────────────────────┐   ┌──────────────────────────────┐   │
│  │      SniperScope.tsx     │   │         VoiceOrb.tsx         │   │
│  │  ┌────────────────────┐  │   │  ┌──────────────────────┐   │   │
│  │  │  WebRTC Camera Feed│  │   │  │  AudioContext + VAD   │   │   │
│  │  │  320x320 JPEG crop │  │   │  │  SpeechRecognition    │   │   │
│  │  │  5-second loop     │  │   │  │  Framer Motion Orb    │   │   │
│  │  └────────────────────┘  │   │  └──────────────────────┘   │   │
│  └────────────┬─────────────┘   └──────────────────────────────┘   │
└───────────────┼─────────────────────────────────────────────────────┘
                │ POST /api/v1/analyze-frame
                │ { candidate_id, timestamp, image_payload: base64 }
                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   BACKEND (FastAPI + Uvicorn)                        │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                      edge_main.py                           │   │
│  │                                                             │   │
│  │  1. Checks BEA state → is session already TERMINAL?        │   │
│  │  2. Sends frame to Ollama Vision API (localhost:11434)      │   │
│  │  3. Parses structured JSON response (hallucination-proofed) │   │
│  │  4. Routes verdict to BEA engine                           │   │
│  │  5. Logs to SQLite in background task                      │   │
│  └────────────────────────┬────────────────────────────────────┘   │
│                           │                                         │
│  ┌────────────────────────▼────────────────────────────────────┐   │
│  │              core_memory/bea.py  (BEA Engine)               │   │
│  │                                                             │   │
│  │  Behavioral Event Accumulator — 5-minute sliding window     │   │
│  │  • Yaw tracker (SIDE_OR_UP): 5s grace → Hard Warning        │   │
│  │  • Pitch tracker (DOWN):    10s grace → Orange Alert        │   │
│  │  • Risk score: violations × 20, burst bonus +15            │   │
│  │  • 4 tiers: CLEAR → SOFT_WARNING → HARD_WARNING → TERMINAL │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  sentry_logs.db (SQLite)  — full audit trail               │   │
│  │  candidate_id · timestamp · gaze · risk_score · ai_trace   │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────┐
│               Ollama (localhost:11434)                               │
│               llama3.2-vision:latest  (10.7B Q4_K_M)               │
│               Runs fully offline — zero cloud dependency            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🧠 The Intelligence Stack

### Vision Engine — `edge_main.py`

The VLM inference pipeline uses a **Perception-Reasoning Decomposition** prompt — a 3-phase structured output format engineered to eliminate hallucinations:

| Phase | Key | Purpose |
|-------|-----|---------|
| 1 | `blind_observation` | Context-free scene description |
| 2 | `entity_extraction` | Strict target detection (`NO TARGETS` default) |
| 3 | `spatial_verification` | Physical location confirmation of any threat |
| — | `gaze` | `STRAIGHT` \| `DOWN` \| `SIDE_OR_UP` |
| — | `is_critical` | `true` only if phone/person 100% confirmed |
| — | `verdict` | 1-sentence human-readable summary |

**Key safeguard:** The model is instructed to *prefer false negatives over false positives*. A blur, shadow, or notebook is never flagged as a phone.

---

### Memory Engine — `core_memory/bea.py`

The **Behavioral Event Accumulator (BEA)** is the temporal brain of G.U.A.R.D. It's a sliding-window risk graph that separates innocent micro-glances from genuine cheating patterns:

```
Risk Score = min(violation_events × 20, 100) + burst_bonus

Intervention Tiers:
  0-19  → CLEAR          (green)   — No action
  20-39 → SOFT_WARNING   (yellow)  — Monitoring intensifies
  40-99 → HARD_WARNING   (orange)  — Voice interrogation triggered
  100   → TERMINAL       (red)     — Session permanently locked
```

**Gaze thresholds** (aligned with Honorlock/Respondus standards):

```
SIDE_OR_UP (yaw):  1 frame  (5s)  → violation ×1
                   3+ frames(15s) → violation ×3  (spike)

DOWN (pitch):      2 frames (10s) → violation ×1
                   6+ frames(30s) → violation ×3  (spike)

STRAIGHT:          Resets all consecutive counters immediately
```

---

### Voice Interrogator — `VoiceOrb.tsx`

When risk hits `HARD_WARNING`, the Voice Interrogator activates:

1. **TTS**: System speaks a challenge ("Candidate, explain your deviation")
2. **STT**: `SpeechRecognition` records the candidate's excuse
3. **Live VAD**: `AudioContext + AnalyserNode` drives the orb's scale in real-time via Framer Motion springs
4. **Transcript**: Bubbles up to the dashboard for human reviewer logging

The orb has 4 reactive visual states:

| State | Visual | Trigger |
|-------|--------|---------|
| `IDLE` | Dark, dormant | Mic inactive |
| `LISTEN` | 🟢 Neon pulse, scale = f(volume) | Audio VAD active |
| `PROCESS` | 🟠 Spinning dashed ring | Speech ended, analyzing |
| `SPEAK` | 🔵 Erratic cyan burst | System is speaking |

---

## 🚀 Setup & Boot

### Prerequisites

| Requirement | Version | Install |
|---|---|---|
| Python | 3.11+ | [python.org](https://python.org) |
| Node.js | 18+ | [nodejs.org](https://nodejs.org) |
| pnpm | 10+ | `npm i -g pnpm` |
| Ollama | latest | [ollama.com](https://ollama.com) |
| LLaMA 3.2 Vision | 11B | `ollama pull llama3.2-vision` |

---

### 1. Clone the Repo

```bash
git clone https://github.com/electrifiedchan/guard-edge-ai-proctoring.git
cd guard-edge-ai-proctoring
```

### 2. Backend Setup

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

### 3. Frontend Setup

```bash
cd frontend
pnpm install
```

---

### 🟢 Boot Sequence

Open **3 terminals** and run simultaneously:

**Terminal 1 — The AI Model:**
```bash
ollama serve
```

**Terminal 2 — The Brain (Backend):**
```bash
cd backend
python -m uvicorn edge_main:app --host 0.0.0.0 --port 8080 --reload
```

**Terminal 3 — The Face (Frontend):**
```bash
cd frontend
pnpm dev
```

Open **[http://localhost:3000](http://localhost:3000)** — the dashboard is live.

---

## 🌐 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/analyze-frame` | Submit a base64 frame for VLM analysis |
| `GET` | `/api/v1/status/{candidate_id}` | Get current risk state for a candidate |
| `POST` | `/api/v1/reset/{candidate_id}` | Reset/clear a candidate's session |

**Interactive Docs:** [http://localhost:8080/docs](http://localhost:8080/docs) (Swagger UI, auto-generated)

---

### `POST /api/v1/analyze-frame`

**Request:**
```json
{
  "candidate_id": "exam_session_001",
  "timestamp": 1714000000000,
  "image_payload": "<base64-encoded-jpeg>"
}
```

**Response:**
```json
{
  "candidate_id": "exam_session_001",
  "timestamp": 1714000000000,
  "verdict": "Candidate is looking at the screen. No threats detected.",
  "gaze": "STRAIGHT",
  "risk_packet": {
    "candidate_id": "exam_session_001",
    "risk_score": 0,
    "violation_count": 0,
    "intervention_level": "CLEAR"
  }
}
```

---

## 📁 Project Structure

```
guard-edge-ai-proctoring/
│
├── backend/
│   ├── edge_main.py              # FastAPI app, Ollama integration, SQLite logging
│   ├── core_memory/
│   │   └── bea.py                # Behavioral Event Accumulator (temporal risk graph)
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── globals.css       # Tailwind v4 + custom theme (sentry-neon, sentry-border)
│   │   │   ├── layout.tsx        # Root layout
│   │   │   └── page.tsx          # Main dashboard — wires all modules together
│   │   └── components/
│   │       ├── SniperScope.tsx   # Camera feed, VLM loop, hardware tripwire, targeting HUD
│   │       └── VoiceOrb.tsx      # Live mic, VAD, audio-reactive orb, SpeechRecognition STT
│   ├── package.json
│   ├── postcss.config.mjs
│   └── tsconfig.json
│
├── .gitignore
├── requirements.txt
└── README.md
```

---

## 🛡️ Security Architecture

G.U.A.R.D. implements a **layered tripwire system**:

```
Layer 1 — HARDWARE TRIPWIRE (SniperScope.tsx)
  └── Enumerates video devices on startup
  └── Flags OBS, virtual cameras, Snap Camera by label string match
  └── Instant LOCKED state on detection

Layer 2 — SOFTWARE TRIPWIRE (SniperScope.tsx)
  └── document.visibilitychange listener
  └── Tab switch / window blur → TERMINAL lockout
  └── (DEV MODE: commented out for development convenience)

Layer 3 — VISION TRIPWIRE (edge_main.py + Ollama)
  └── 12 FPM (frames per minute) inference cadence
  └── Phone/unauthorized person detection → instant TERMINAL
  └── Hallucination-proof 3-phase reasoning prompt

Layer 4 — BEHAVIORAL TRIPWIRE (bea.py)
  └── Sliding window gaze pattern analysis
  └── Temporal escalation: CLEAR → SOFT → HARD → TERMINAL
  └── Burst detection: 3 violations in 30s adds +15 risk bonus
```

---

## 🔧 Configuration

Key constants you may want to tune:

| File | Constant | Default | Description |
|------|----------|---------|-------------|
| `edge_main.py` | `OLLAMA_OPTIONS.num_predict` | `200` | Max tokens per inference |
| `edge_main.py` | `OLLAMA_OPTIONS.temperature` | `0.0` | Deterministic output (don't raise) |
| `SniperScope.tsx` | `loopTimerRef` timeout | `5000ms` | Inference cadence (5s = 12 FPM) |
| `SniperScope.tsx` | `cropSize` | `320px` | Frame crop size (tradeoff: accuracy vs VRAM) |
| `bea.py` | `window_size_seconds` | `300` | 5-minute sliding memory window |
| `VoiceOrb.tsx` | `VAD_THRESHOLD` | `18` | RMS threshold for voice activity (0-255) |
| `VoiceOrb.tsx` | `SILENCE_HOLD_MS` | `1800ms` | Silence before switching to PROCESS |

---

## 🖥️ Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Vision AI** | Ollama `llama3.2-vision` (10.7B Q4_K_M) | Runs offline, VRAM-efficient quantization |
| **Backend** | FastAPI + Uvicorn | Async, fast, auto-docs |
| **Memory** | Pure Python in-memory + SQLite | Zero-dependency, edge-native |
| **Frontend** | Next.js 16 (Turbopack) | Fast HMR, React 19, App Router |
| **Styling** | Tailwind CSS v4 | CSS-native `@theme` variables |
| **Animation** | Framer Motion 12 | Spring physics for audio-reactive orb |
| **Audio** | Web Audio API + SpeechRecognition | Native browser, no external SDK |

---

## 📄 License

MIT — build on it, fork it, make it yours.

---

<div align="center">

**Built with intent. Runs on the edge. Answers to no one.**

*G.U.A.R.D. — Sovereignty is a feature, not a setting.*

</div>
