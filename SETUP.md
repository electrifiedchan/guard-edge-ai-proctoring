# Setting Up G.U.A.R.D.

This file is the authoritative setup instruction, written for two readers:

- **A human** who cloned the repo and wants it running.
- **An AI coding agent** asked to set the project up, or to finish a setup that
  stopped halfway.

Both should follow the same order. Where the two differ, the difference is
called out.

---

## 0. What you are setting up

Four things run together:

| Piece | Where | Port | Started by |
|---|---|---|---|
| FastAPI backend (YOLOv8s, verdict engine, SQLite) | `./backend` | 8080 | `startapp.bat` |
| Next.js 16 frontend (camera, MediaPipe FaceMesh) | `./frontend` | 3000 | `startapp.bat` |
| Ollama local model server | system-wide | 11434 | `startapp.bat` |
| Python virtualenv holding the backend's deps | `./venv` | — | `setup.bat` |

**Run everything from the repository root.** Two things depend on it: the venv
lives at `./venv` (not `./backend/.venv`, which is an unused leftover), and
`edge_main.py` loads `YOLO("yolov8s.pt")` as a path relative to the working
directory, so the weights only resolve when the root is the cwd.

The camera and microphone are captured **in the browser** via `getUserMedia`.
Python never opens a capture device. This matters when you are debugging: a
missing webcam is a browser-permission problem, not a backend one.

---

## 1. Prerequisites

| Tool | Version | Why that version |
|---|---|---|
| **Python** | 3.10 (3.11 / 3.12 also work) | 3.10 is what the project was built and tested on. `ultralytics` and `faster-whisper` are the packages most likely to complain elsewhere. |
| **Node.js** | ≥ 20 LTS | Next.js 16 refuses to build on older Node. |
| **pnpm** | any current | `frontend/pnpm-lock.yaml` is the committed lockfile. **npm resolves a different tree than the one that was tested** — use pnpm. |
| **Ollama** | any current | Optional but recommended. Without it the app needs a cloud API key to run its LLM features. |
| **Browser** | Chrome or Edge | `getUserMedia` needs `localhost` or HTTPS. |

An NVIDIA GPU is optional. YOLOv8s runs on CPU, just slower.

---

## 2. The fast path (Windows)

```bat
setup.bat
startapp.bat
```

`setup.bat` is a thin wrapper; the real work is in `setup.ps1`, which runs
under `-ExecutionPolicy Bypass` **for that one process only** — it does not
loosen the machine-wide script policy and needs no admin rights.

Flags:

| Command | Effect |
|---|---|
| `setup.bat` | Full setup. |
| `setup.bat -SkipOllama` | Skip the ~2 GB local model pull. |
| `setup.bat -SkipFrontend` | Skip `pnpm install`. |
| `setup.bat -Force` | Redo steps that already look finished. |

Setup is re-runnable. Finished steps are detected and skipped, and nothing is
uninstalled when a step fails — so if it stops, fix the cause and run it again.

### What setup.ps1 does, in order

```
0/8  Verify this is the GUARD project folder
1/8  Locate Python  (3.10 preferred; winget-installs it if absent)
2/8  Locate Node.js >= 20 and pnpm
3/8  Locate Ollama  (winget-installs it if absent)
4/8  Check for an NVIDIA GPU  (informational only)
5/8  Build ./venv and pip install -r requirements.txt   <- the long one
6/8  pnpm install in ./frontend, then node scripts/copy-mediapipe.mjs
7/8  Fetch models: yolov8s.pt, ollama pull qwen2.5:3b, faster-whisper tiny.en
8/8  Write backend/.env  (API keys + LLM mode)
```

It then verifies: every required package imports, `backend/test_llm_config.py`
passes, and ports 3000 / 8080 / 11434 are free.

Everything it does is logged to `setup-log.txt`.

---

## 3. The manual path (any OS, or when setup.ps1 stops)

Do these in order from the repository root.

### 3a. Python environment

```bash
python -m venv venv
venv\Scripts\activate          # Windows
source venv/bin/activate       # macOS / Linux
pip install -r requirements.txt
```

`requirements.txt` is fully pinned. If a package fails to build, the usual
cause is a Python version outside 3.10–3.12.

### 3b. Frontend packages

```bash
cd frontend
pnpm install
```

`postinstall` runs `scripts/copy-mediapipe.mjs`, which copies the MediaPipe
FaceMesh assets out of `node_modules` into `public/mediapipe`. **MediaPipe is
vendored deliberately, not loaded from a CDN** — that is what makes offline
("Sovereign") mode actually offline. Do not reintroduce a CDN URL. If the face
overlay is missing at runtime, run `node scripts/copy-mediapipe.mjs` by hand.

### 3c. Models

- **`yolov8s.pt`** — committed to the repo, already in the root. Nothing to do.
  If it is missing, place it in the repository root; the backend cannot detect
  phones without it.
- **Ollama model** — `ollama pull qwen2.5:3b` (~1.9 GB). Set `OLLAMA_MODELS`
  first if you want the weights off your system drive.
- **Whisper** — `faster-whisper` downloads `tiny.en` (~75 MB) from Hugging Face
  on first use. Setup pre-warms it so the first interview is not slow.

### 3d. `backend/.env`

Create `backend/.env` — **not** a `.env` at the project root. `llm_config.py`
resolves the path as `backend/.env` relative to its own location, so a root
`.env` is silently ignored.

```ini
LLM_MODE=auto
OLLAMA_MODEL=qwen2.5:3b
WHISPER_MODEL=tiny.en
NVIDIA_API_KEY=
GROQ_API_KEY=
```

Write it as **UTF-8 with no BOM**. A BOM on the first line makes the first
variable unreadable to the parser.

`LLM_MODE` values:

| Mode | Behaviour | Resume leaves device? |
|---|---|---|
| `auto` *(default)* | Local Ollama when it answers on 11434, cloud otherwise | Only on fallback |
| `ollama` | **Sovereign** — forced local, errors rather than falling back | Never |
| `nvidia` | **Demo** — NVIDIA NIM cloud, for low-VRAM machines | Yes |

With no API keys, use `LLM_MODE=ollama` and the app is fully offline.

The mode is also changeable from inside the app. Note that editing
`backend/.env` does **not** change a process that is already running — restart
the backend after an edit.

### 3e. Frontend env (optional)

Both variables below default to `http://localhost:8080`, so you only need
`frontend/.env.local` if the backend is somewhere else:

```ini
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
NEXT_PUBLIC_API_BASE=http://localhost:8080
```

Two names exist for historical reasons — `/replay` reads `NEXT_PUBLIC_API_BASE`,
everything else reads `NEXT_PUBLIC_API_BASE_URL`. Set both if you set either.

---

## 4. Running it

**Windows, one shot:** `startapp.bat` — starts Ollama (skipping it if
`ollama.exe` is already running, since `ollama serve` errors when 11434 is
taken), then the backend, then the frontend, each in its own window.

**Manually:**

```bash
# Backend — from the repository root
venv\Scripts\activate
set DISABLE_VOICE_ENGINE=true
python backend\edge_main.py
```

`DISABLE_VOICE_ENGINE=true` keeps the server-side `pyttsx3` engine out of the
way; speech is done in the browser.

```bash
# Frontend — new terminal
cd frontend && pnpm dev
```

Do not use `npx next dev`: npx silently downloads a transient copy when it
cannot resolve the local binary, which masks a broken install and can boot a
version other than the one the lockfile pins. `startapp.bat` invokes
`node node_modules/next/dist/bin/next dev` for exactly this reason.

Leave Turbopack on. Next 16 defaults to it, and forcing `--webpack` tripled
first-compile time on every route.

Then open:

| URL | What |
|---|---|
| http://localhost:3000 | Landing page |
| http://localhost:3000/dashboard | Dashboard (append `?demo=1` for sample data) |
| http://localhost:3000/practice | Live session |
| http://localhost:8080/docs | Backend API docs |

Allow camera and microphone when the browser asks. The first page load compiles
for a few seconds, then it is fast.

---

## 5. Verifying the setup

```bat
backend\run_tests.bat
```

Runs six suites against the project venv: session lifecycle, dashboard summary,
brevity, verdict narration, persona contract, and LLM config. It stops at the
first failure.

`backend/test_llm_config.py` is hermetic — it fakes the Ollama socket, so it is
a real check that the config layer works on this machine with no server up.

Frontend type check:

```bash
cd frontend && npx tsc --noEmit
```

---

## 6. When it goes wrong

| Symptom | Cause | Fix |
|---|---|---|
| `setup.bat` stops partway | Any step | Read `setup-log.txt` — it names the step that stopped. Fix, re-run `setup.bat`. |
| Backend starts, no phone detection | `yolov8s.pt` not in the repository root, or backend not launched from the root | Run from the root. `edge_main.py` resolves the weights relative to the cwd. |
| Port already in use | 3000, 8080, or 11434 taken | Close the owner. For 11434, that is usually the Ollama tray app — which is fine, `startapp.bat` detects and reuses it. |
| Face overlay missing | `public/mediapipe` not populated | `cd frontend && node scripts/copy-mediapipe.mjs` |
| `.env` setting ignored | Root `.env` instead of `backend/.env`, a BOM on line 1, or a stale process | Move the file, re-save as UTF-8 no BOM, restart the backend. |
| LLM calls fail | No keys and `LLM_MODE=auto` with Ollama down | Start Ollama, or set `LLM_MODE=ollama`. |
| Camera blocked | Not on `localhost`/HTTPS, or a non-Chromium browser | Use Chrome or Edge on `localhost`. |
| Weird dependency errors after `npm install` | npm resolved a different tree than the pnpm lockfile | `rm -rf frontend/node_modules && cd frontend && pnpm install` |

`docker-compose.yml` is present but **not currently usable** — it references
`backend/Dockerfile` and `frontend/Dockerfile`, neither of which exists in the
repo. Use the native setup above.

---

## 7. Notes for an AI agent

If you were handed this project and told to set it up, or to rescue a setup
that failed:

1. **Read `setup-log.txt` first** if it exists. It records exactly which step
   stopped. `setup.ps1` is the authoritative, plain-text list of every step, so
   the log plus the script is enough to finish the job without guessing.
2. **Re-run `setup.bat` rather than hand-rolling steps.** It is idempotent and
   skips finished work. Only fall back to §3 when the script cannot run at all
   (non-Windows, or no PowerShell).
3. **Read `AGENTS.md`.** It is the binding contract for edits in this repo —
   scope, staging rules, commit rules, and the secrets policy.
4. **Never commit** `backend/.env`, `frontend/.env.local`, `*.db`, evidence
   frames, or anything else `.gitignore` names. Stage explicit paths; never
   `git add .`.
5. **`memory/` is gitignored on purpose.** It holds per-session working notes,
   not repository history. Everything in it except `.gitignore` stays local.
6. **Verify before claiming done.** `backend\run_tests.bat` for the backend,
   `npx tsc --noEmit` in `frontend/` for types. Report failures honestly rather
   than describing the setup as complete.
7. **Do not "fix" the vendored MediaPipe** into a CDN load, and do not switch
   the frontend to npm. Both look like cleanups and both break something that
   was deliberate.

---

## 8. Where to read next

| File | What it holds |
|---|---|
| `README.md` | What the project is and what it does |
| `GUIDEBOOK.md` | Deep walkthrough of every file and subsystem |
| `AGENTS.md` | Rules for AI agents working in this repo |
| `ai-context.yaml` | Machine-readable stack summary and core data flow |
| `setup.ps1` | The setup steps themselves, in plain text |
