<div align="center">

![G.U.A.R.D. Banner](https://capsule-render.vercel.app/api?type=waving&color=0,0d1117,00ff9c&height=200&section=header&text=G.U.A.R.D.&fontSize=80&fontColor=00ff9c&fontAlignY=38&desc=Guardianship%20Utilizing%20AI%20for%20Real-time%20Detection&descAlignY=58&descSize=16&descColor=a3a3a3&animation=fadeIn)

**Your AI interview coach. Decode the black box — before the real interview does it to you.**

*All on your hardware. No cloud video. No subscriptions. No surveillance.*

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org)
[![YOLOv8](https://img.shields.io/badge/YOLOv8s-Ultralytics-FF6F00?style=for-the-badge)](https://docs.ultralytics.com)
[![MediaPipe](https://img.shields.io/badge/MediaPipe-Face_Mesh-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev/edge/mediapipe)
[![License](https://img.shields.io/badge/License-MIT-00FF41?style=for-the-badge)](#-license)

</div>

---

## 🎯 The Problem

Online interviews are a **black box**. You get rejected and never learn why. Was it your answers? Your wandering eyes? The way you looked down every time a hard question landed? Nobody tells you — and by the time you find out, the opportunity is gone.

Interview coaching exists, but it's expensive, subjective, and can't see what a camera sees. Meanwhile, the tools that *can* see (cloud proctoring platforms) are built to catch cheaters, not to help candidates — and they stream your face to someone else's servers to do it.

## ⚡ The Answer

**G.U.A.R.D. is a sports-science lab for interviews.** It watches your practice sessions the way a real interviewer's eyes do — gaze, head pose, composure, speech — asks you questions generated **from your actual resume**, coaches you live when you drift, and then hands you a frame-by-frame replay of exactly what happened and when.

And it does all of this **entirely on your own machine**. The perception stack — dual vision pipeline, temporal memory engine, verdict logic, audit database — runs locally. **No video ever leaves the device.**

> **The philosophy:** a coach, not a cop. Every insight traces back to real sensor data
> (`Gaze: left 12.4s | Faces: 1 | Talking: false`), and every report shows you not just where
> you slipped — but where you **recovered**.

---

## ✨ What It Does

| Capability | What you get |
|---|---|
| 🎤 **Resume-Aware Interviewer** | Upload your resume (PDF/TXT). A local LLM generates questions targeting *your* projects, *your* claims, *your* gaps — then asks them out loud via TTS and transcribes your spoken answers. |
| 📈 **Composure Curve** | Every session is recorded as lightweight telemetry (~200 bytes/frame, never video). The Replay page renders your composure over time with a scrubber, captioned key moments, and evidence thumbnails. |
| 💚 **Recovery Moments** | The engine detects when you pull yourself back together after a rough stretch. Coaching that only shows mistakes is brutal; G.U.A.R.D. shows you your comebacks too. |
| 🔔 **Live Coach Nudges** | Real-time, cooldown-guarded prompts over WebSocket while you practice: *"Your eyes have drifted off-screen. Bring them back to the camera."* |
| 🛡️ **Resilience Score** | How often did composure dip — and how fast did you bounce back? Scored per session from the curve itself. |
| 📊 **Progress Trajectory** | Session-over-session trends: composure, eye contact, resilience. Watch yourself get measurably better at sitting in front of a camera. |
| 🔍 **Forensic Evidence Trail** | Flagged moments store a single evidence frame on disk with an audit trail in SQLite. You see exactly what the system saw. |

---

## 🔒 Privacy Architecture — What Runs Where

The real-time loop is **100% local**. The post-session AI coach is pluggable — local by default.

| Component | Mode | Network? |
|---|---|---|
| YOLOv8s object detection | **Local** (PyTorch / CUDA / CPU) | ❌ Never |
| MediaPipe Face Mesh (468/473 nodes + iris) | **Local** (Browser / WASM, 30 fps) | ❌ Never |
| Deterministic verdict engine + sensor fusion | **Local** (Python) | ❌ Never |
| BEA temporal memory (5-min risk window) | **Local** (in-process + SQLite snapshots) | ❌ Never |
| Session timeline (telemetry only, no images) | **Local** (SQLite, WAL mode) | ❌ Never |
| Evidence frames | **Local** (disk, URL-referenced) | ❌ Never |
| Live coach nudges | **Local** (rule engine over WebSocket) | ❌ Never |
| **AI interviewer + post-session coach** | 🔀 Switchable | See below |
| Voice STT | ⚠️ Browser `SpeechRecognition` (Chrome → Google) | Roadmap: local Whisper/Vosk |

### LLM — Two Modes

| Mode | Privacy | VRAM | Setup |
|---|---|---|---|
| 🟢 **Sovereign** *(recommended)* | ✅ Fully local, air-gapped | ~6 GB (8B model) | Run [Ollama](https://ollama.com), set `LLM_MODE=ollama` |
| 🟡 **Demo** | ⚠️ Cloud round-trip (NVIDIA NIM) | 0 GB | Set `LLM_MODE=nvidia` + `NVIDIA_API_KEY` |

**Bring your own model.** Sovereign Mode works with any Ollama model — `llama3.1:8b`, `mistral:7b`, `qwen2.5:14b`, or your own fine-tune (`OLLAMA_MODEL` env var). In Sovereign Mode, **zero data leaves the device — including your resume.**

---

## 🏗️ System Architecture

```
┌────────────────────────── BROWSER (Next.js 16) ──────────────────────────┐
│                                                                          │
│  SniperScope.tsx                    InterviewerPanel.tsx                 │
│  ├─ MediaPipe Face Mesh @30fps      ├─ Resume upload → tailored Qs       │
│  ├─ Iris tracking + head pose       ├─ TTS asks / STT transcribes        │
│  ├─ Zero-hour calibration (5s)      └─ Q&A pinned to timeline            │
│  └─ Frame loop (throttled)                                               │
│                                     VoiceOrb.tsx · CoachNudge.tsx        │
│         │  ▲                                                             │
│         │  └─── nudges & verdicts (server push) ────┐                    │
└─────────┼───────────────────────────────────────────┼────────────────────┘
          ▼                                           │
   WebSocket /ws/v1/frames  (HTTP POST fallback)      │
          │                                           │
┌─────────▼────────────── BACKEND (FastAPI) ──────────┴────────────────────┐
│                                                                          │
│  edge_main.py        YOLOv8s inference → deterministic verdict engine    │
│                      (3-tier sensor fusion — the eyes veto the head)     │
│  core_memory/                                                            │
│   ├─ bea.py          Behavioral Event Accumulator (decaying risk,        │
│   │                  3-of-5 critical buffer, debounced gaze resets)      │
│   ├─ timeline.py     Per-frame telemetry log · sessions · key moments    │
│   ├─ nudges.py       Live coaching rules (cooldown + calibration-aware)  │
│   ├─ interviewer.py  Resume parsing · LLM question gen · Q&A tracking    │
│   └─ metrics.py      Resilience scoring · cross-session aggregates      │
│                                                                          │
│  SQLite (WAL) ── sessions · timeline_frames · moments · interview_qa     │
└──────────────────────────────────────────────────────────────────────────┘
```

**Why the split?** Cheap 30 fps perception (face mesh, gaze, pose) runs in the browser for free; heavy inference (YOLO, LLM) runs on the edge server at a throttled cadence. That's how the whole thing stays real-time on a laptop.

---

## 🚀 Quick Start

**Prerequisites:** Python 3.11+, Node 20+, pnpm, a webcam. GPU optional (CUDA speeds up YOLO; CPU works).

```bash
# 1. Clone
git clone https://gitlab.com/mmnirupam-group/guard-edge-ai-proctoring.git
cd guard-edge-ai-proctoring

# 2. Backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# 3. Configure (pick ONE mode)
export LLM_MODE=ollama OLLAMA_MODEL=llama3.1:8b      # 🟢 Sovereign (needs Ollama running)
# export LLM_MODE=nvidia NVIDIA_API_KEY=nvapi-...    # 🟡 Demo (cloud fallback)

# 4. Run backend
uvicorn backend.edge_main:app --host 0.0.0.0 --port 8000

# 5. Frontend (new terminal)
cd frontend
pnpm install
echo "NEXT_PUBLIC_API_BASE=http://localhost:8000" > .env.local
pnpm dev
```

Open **http://localhost:3000** → allow camera + mic → upload a resume → practice.
Then open **/replay** to see your Composure Curve, and **/progress** after a few sessions.

> Windows one-shot: `startapp.bat` · Containers: `docker-compose up`

---

## 🖥️ The Pages

| Route | Purpose |
|---|---|
| `/` | Live dashboard — camera feed with gaze overlay, voice orb, AI interviewer panel, live nudges |
| `/replay` | Session replay — Composure Curve scrubber, key moments (❓ questions, 💬 answers, 🔻 drift, 💚 recoveries, 🟣 nudges), evidence thumbnails, resilience score, auto-generated headline (*"The decisive moment came at 3:42…"*) |
| `/progress` | Trajectory — composure / eye contact / resilience trends across sessions |
| `/autopsy` · `/verdict` | Forensic deep-dive and post-session AI coach report |

> **Note:** the Replay scrubber replays *data*, not video — because no video is ever recorded.
> That's not a limitation. That's the product.

---

## 📡 API Reference

| Method | Endpoint | Purpose |
|---|---|---|
| `WS` | `/ws/v1/frames` | Live frame telemetry in → verdicts + coach nudges out |
| `POST` | `/api/v1/analyze-frame` | HTTP fallback for the frame loop |
| `POST` | `/api/v1/session/start` | Begin a recorded practice session |
| `POST` | `/api/v1/session/{id}/end` | Close a session |
| `GET` | `/api/v1/sessions` | List sessions |
| `GET` | `/api/v1/session/{id}/timeline` | Full replay payload: curve, stats, moments, resilience, headline |
| `GET` | `/api/v1/progress` | Cross-session aggregates for the trajectory view |
| `POST` | `/api/v1/interview/resume` | Upload resume → tailored question plan |
| `POST` | `/api/v1/interview/{plan_id}/ask` | Mark a question asked (pins it to the timeline) |
| `POST` | `/api/v1/interview/answer/{qa_id}` | Submit an answer transcript |
| `GET` | `/api/v1/interview/{plan_id}/transcript` | Full Q&A transcript |
| `POST` | `/generate-verdict` | Post-session AI coach report (Ollama / NIM) |

---

## 🧠 Why the Engine Doesn't Cry Wolf

Naive camera-analysis tools flag everything — every micro-glance, every stretch. G.U.A.R.D.'s verdict engine is built specifically against false positives:

- **Zero-hour calibration** — 5 seconds of dynamic baselining per session; your neutral posture is the reference, not a rigid absolute
- **3-tier sensor fusion with eye-veto** — iris tracking can override head-pose conclusions (you can look at the camera while your head is tilted)
- **BEA temporal memory** — rolling 3-of-5 critical buffer, wall-clock duration tiers, and decaying risk, so one glance at the ceiling means nothing but a sustained pattern means something
- **Recovery detection** — sharp risk drops after bad stretches are first-class events, feeding the resilience score

This is the moat. The models are open — the behavioral judgment layer is the product.

---

## 🗺️ Roadmap

- [ ] Local STT (Whisper/Vosk) — close the last network dependency
- [ ] Answer-quality scoring — LLM rates transcript content per question
- [ ] Speech analytics — filler words, pace, pause discipline
- [ ] Avatar replay — re-render head pose + gaze on a wireframe from telemetry (rich replay, still zero video)
- [ ] ONNX / OpenVINO export — 2–3× faster CPU inference for GPU-less laptops
- [ ] Session-token auth + rate limiting for LAN deployments
- [ ] Interview archetypes — "FAANG behavioral", "startup technical", "HR screen" question styles

---

## 🧰 Tech Stack

**Backend:** FastAPI · Uvicorn · Ultralytics YOLOv8s · OpenCV · SQLite (WAL) · Ollama / NVIDIA NIM · pypdf  
**Frontend:** Next.js 16 · TypeScript · Tailwind v4 · MediaPipe Tasks (WASM) · Framer Motion · Web Speech API

---

## 📄 License

MIT — practice hard, own your data.

<div align="center">

![Footer](https://capsule-render.vercel.app/api?type=waving&color=0,00ff9c,0d1117&height=120&section=footer)

*Built for everyone who ever got a rejection email and wondered what the camera saw.*

</div>
