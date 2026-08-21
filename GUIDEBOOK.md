# G.U.A.R.D. — The Guide Book

**Every file in this project, explained in plain English.**

You do not need to know how to code to read this. If you can read a story, you can
read this book.

---

## How to read this book

Every file gets the same four lines:

| Line | What it tells you |
|---|---|
| 🏷️ **What it is** | One sentence, no jargon |
| 🎯 **Why it exists** | The problem it solves — if we deleted it, what breaks |
| ⭐ **The main part** | The one important thing inside it |
| 🧸 **Picture it like** | An everyday comparison |

Files are grouped the way the project is built, not alphabetically. Start with
"The Big Picture" and read straight through — it's written as a journey.

---

## The Big Picture (read this first)

Imagine a **practice interview room**. Inside that room there are five workers:

1. **The Interviewer** — reads your resume, asks you tough questions out loud, listens to your answers.
2. **The Watcher** — a pair of eyes that notices where you're looking and whether a phone is on the desk.
3. **The Patient Teacher** — sees everything the Watcher sees, but *refuses to judge you instantly*. It waits.
4. **The Note-Taker** — writes tiny notes in a diary. Not video. Just notes.
5. **The Coach** — at the end, reads the diary and tells you how to get better.

That's the entire project. Every file below belongs to one of those five workers.

**The one rule that makes this project different:** the Patient Teacher.
Most cheating-detection software screams the instant it sees something. Ours waits
to see if a thing *keeps happening*. Glancing away once is being human. Staring
away for 12 seconds is a pattern. **We only report patterns.**

---

## The Journey of One Practice Session

Follow the arrows. This is what happens when someone uses the app:

```
  YOU
   │
   │  1. upload your resume  ──────────────────►  upload/page.tsx
   │                                                    │
   │                                              interviewer.py
   │                                              (reads the PDF,
   │                                               makes questions)
   │
   │  2. the interview starts  ─────────────────►  practice/page.tsx
   │                                                    │
   │      ┌───────────────────────────────────────┬─────┴──────────┐
   │      │                                       │                │
   │   YOUR EYES                            YOUR VOICE        THE DESK
   │      │                                       │                │
   │  SniperScope.tsx                        useVAD.ts      edge_main.py
   │  (MediaPipe, in your                    (hears when     (YOLO looks
   │   own browser, 30x                       you speak)      for a phone)
   │   per second)                                │                │
   │      │                                       │                │
   │      └──────────────►  edge_main.py  ◄────────┴────────────────┘
   │                        (the control room —
   │                         every signal arrives here)
   │                              │
   │                              ▼
   │                          bea.py
   │                    (THE PATIENT TEACHER —
   │                     starts a stopwatch,
   │                     refuses to panic)
   │                              │
   │              ┌───────────────┴───────────────┐
   │              ▼                               ▼
   │        interrupts.py                    timeline.py
   │     (speaks to you NOW,               (writes a tiny note
   │      but only for a phone              in the diary —
   │      or a second person)               ~200 bytes, no video)
   │
   │  3. the interview ends  ───────────────────►  report/page.tsx
   │                                              verdict/page.tsx
   │                                              replay/page.tsx
   │                                                    │
   │                                            (the Coach reads
   │                                             the diary back)
   │
   └─  4. come back tomorrow  ─────────────────►  dashboard/page.tsx
                                                  (are you improving?)
```

**The important thing to notice:** your webcam video goes to your *own* browser and
your *own* computer's backend. It never travels to the internet. The diary holds
words and numbers, not footage.

---

# PART 1 — THE BACKEND

*The backend is the part you never see. It runs quietly on your own computer and
does the thinking. Written in a language called Python.*

Think of the backend as **the staff room** of the interview centre.

---

## 1.1 The Control Room

### `backend/edge_main.py` — 1,638 lines · **THE BIGGEST AND MOST IMPORTANT FILE**

🏷️ **What it is** — The reception desk, switchboard, and manager of the whole backend.

🎯 **Why it exists** — Every other file is a specialist who only knows one job. Someone
has to *receive* messages from the browser, hand each one to the right specialist,
collect the answers, and send one clear reply back. That's this file.

⭐ **The main part** — A function called **`determine_verdict`**. This is the judge.
It takes four facts — *where are the eyes? how many faces? is the person talking?
what objects are on the desk?* — and returns a decision. Every accusation this app
ever makes is born in this one function.

🧸 **Picture it like** — A school **principal's office**. Teachers (the other files)
report to it. Nobody gets punished without going through this room first.

**Other important things living inside it:**

- **The YOLO eye for objects.** It loads a model file called `yolov8s.pt` that can
  spot a cell phone, a person, or a book in a photo.
- **The confidence floor, set to 0.35.** YOLO gives every guess a score out of 1. We
  used to only believe guesses above 0.65 — and we kept *missing real phones*, because
  a phone held at an angle only scores 0.35–0.55. Lowering the bar fixed a real blind
  spot. **This is a decision you should be able to explain.**
- **Which objects we watch: person, cell phone, book.** A laptop is deliberately
  **NOT** watched by default — lots of people have a second laptop on the desk and
  flagging that would be calling an innocent person a cheater.
- **The 3-clean-scan latch.** If a phone flickers out of view for one frame, we don't
  pretend it's a brand new phone when it comes back. One phone = one incident.
- **`build_moment_caption`** — writes the sentence that gets stamped on a saved photo.
  It had a real bug once: a clean frame was captioned "fully engaged and attentive"
  while the risk meter said HARD_WARNING. Now the caption always matches the reason.
- **A separate thread just for object scanning.** Object detection is slow and heavy.
  If it shared a lane with everything else, it would make the eye-tracking laggy.
  So it gets its own private lane.

---

## 1.2 The Brain Folder — `backend/core_memory/`

*"Core memory" is the folder where the thinking and remembering lives. Eight files.*

---

### `bea.py` — 481 lines · **THE HEART OF THE PROJECT**

🏷️ **What it is** — The Patient Teacher. BEA stands for **B**ehavioral **E**vent
**A**ccumulator. "Accumulator" just means *a thing that adds up over time*.

🎯 **Why it exists** — This is the single most important idea in the whole project.
Without it, the app would flag you for blinking. It exists to answer one question:
**"has this been going on long enough to matter?"**

⭐ **The main part** — A class called `BehavioralEventAccumulator` that holds a
**stopwatch per person**. When your eyes leave the screen it starts counting. As the
seconds pile up you cross tiers: *soft* → *warning* → *hard*. When you look back and
stay steady, the stopwatch **resets to zero**.

🧸 **Picture it like** — A **teacher who counts to ten before telling you off.** A bad
teacher shouts the moment you look at the window. A good teacher waits, and if you're
still staring out the window ten seconds later, *then* says something.

**The clever detail worth knowing:** looking **DOWN** is treated *gently* and looking
**SIDEWAYS** is treated *strictly*. Why? Looking down usually means a keyboard or
notes — normal and allowed. Turning your head sideways usually means another screen
or another person — much more suspicious. Same eyes, different meaning, different
patience. **This asymmetry is a deliberate design choice, not an accident.**

---

### `conversation_engine.py` — 683 lines

🏷️ **What it is** — The Interviewer's personality and memory of the conversation.

🎯 **Why it exists** — Asking 5 questions from a list is easy. Holding a *conversation*
— remembering what you already said, getting harder as you go, calling you by your
name — needs someone tracking the whole exchange. That's this file.

⭐ **The main part** — **Progressive personas.** The interviewer can be friendly,
neutral, or tough, and it *climbs the ladder* as the interview goes on. It starts
where you chose and gets harder.

🧸 **Picture it like** — A **video game difficulty curve.** Level 1 is gentle to teach
you the controls. By level 5 the game is genuinely testing you.

**Nice touch inside:** `_extract_candidate_name` pulls your real name off the top of
your resume so the interviewer can say *"So, Priya, tell me about…"*. It reads it with
plain text rules — it never asks the AI, because a name is a fact you can just look up,
and asking an AI to guess a fact it can read is how you get wrong names.

---

### `timeline.py` — 657 lines · **THE DIARY**

🏷️ **What it is** — The Note-Taker. Saves your session to a database and reads it back.

🎯 **Why it exists** — For the replay and the progress dashboard to exist at all,
something must *remember* the session after it ends. But we refuse to store video. So
this file stores **tiny text notes** instead — roughly 200 bytes per frame, which is
about the size of this sentence.

⭐ **The main part** — `get_dashboard_summary`. It reads every session you've ever
done and boils them into the numbers on your dashboard: your streak, your trend,
whether you're improving.

🧸 **Picture it like** — A **sports diary**. A footballer doesn't film every practice.
They write "*45 min, 30 shots, 22 on target*". Small notes, but enough to see progress
across months.

**Also inside:** `_readiness_band` decides whether you're "Strong", "Developing", or
"Needs targeted practice". Those exact cutoffs are mirrored in a frontend file
(`ReadinessRing.tsx`) — if one moves and the other doesn't, the dial lies to you.

---

### `llm_config.py` — 457 lines

🏷️ **What it is** — The switchboard that decides **which AI brain** answers.

🎯 **Why it exists** — The app can run its AI in two places: **on your own computer**
(private) or **on the internet** (needs no setup but your resume text leaves the
device). Something must choose, and the choice must be made in exactly *one* place
or the two paths drift apart and break differently.

⭐ **The main part** — Three modes:

| Mode | What it does | Does your resume leave your computer? |
|---|---|---|
| `auto` *(default)* | Looks for a local AI. Uses it if found, otherwise internet | Only if it falls back |
| `ollama` | **Forced local.** Would rather show an error than go online | **Never** |
| `nvidia` | Internet AI, for weak computers | Yes |

🧸 **Picture it like** — A **light switch with three positions**: *"whatever's
available"*, *"my own generator only"*, and *"city power"*.

**Why `auto` is the default:** a first-time user who installs the local AI gets privacy
without editing any settings. If we defaulted to internet, the private path would only
ever run for people who already knew it existed.

**The neat trick:** the local AI speaks the same "language" as the internet AI, so
supporting both is a couple of lines of settings — not two separate programs.

---

### `episodes.py` — 165 lines

🏷️ **What it is** — Groups repeated flags into **one event**.

🎯 **Why it exists** — If you look away for 10 seconds and the app checks 5 times a
second, that's 50 flags — for **one** look. A report listing 50 problems is useless
and unfair.

⭐ **The main part** — `EpisodeTracker`. It knows a behaviour is "still the same one"
until it's been absent for a while, then closes it and records **how long it lasted**.

🧸 **Picture it like** — A **phone bill**. It doesn't list every second of a 10-minute
call. It says *one call, 10 minutes*.

---

### `interrupts.py` — 154 lines

🏷️ **What it is** — Decides when the app should **speak to you mid-interview**.

🎯 **Why it exists** — A warning is only useful while you can still fix it. But
interrupting someone mid-sentence is rude and breaks their focus, so it must be rare.

⭐ **The main part** — Only **two** findings are allowed to interrupt: **a phone** and
**a second person**. Both are unmistakable. Everything else waits for the report.

🧸 **Picture it like** — A **fire alarm, not a doorbell**. It only goes off for
something certain and serious.

**The rule to remember:** *a guess must never interrupt someone.* That sentence is
written in the file's own tests.

---

### `interviewer.py` — 101 lines

🏷️ **What it is** — Reads your resume PDF and turns it into interview questions.

🎯 **Why it exists** — Generic questions are worthless practice. Questions about
*your actual projects* are the whole point of the app.

⭐ **The main part** — Extracts the text from the PDF, hands it to the AI, and asks for
3–5 tough **STAR** questions. (STAR = Situation, Task, Action, Result — the standard
way to structure an interview answer.)

🧸 **Picture it like** — A **teacher who reads your essay before the oral exam**, so
the questions are about what you actually wrote.

---

### `voice_engine.py` (in `core_memory/`) — 86 lines

🏷️ **What it is** — **Ears.** Turns your recorded speech into text.

🎯 **Why it exists** — The app needs to know *what you said* to judge your answer.

⭐ **The main part** — Loads a speech model called **faster-whisper** exactly once and
reuses it. Loading it fresh every time would add seconds to every answer. It also
auto-picks the fast setting if you have a graphics card, and a lighter setting if not.

🧸 **Picture it like** — A **court stenographer** who types everything said out loud.

> ⚠️ **CONFUSION WARNING:** there are **two** files named `voice_engine.py`.
> - `core_memory/voice_engine.py` = **ears** (speech → text)
> - `backend/voice_engine.py` = **mouth** (text → speech)
>
> Same name, opposite jobs. Don't mix them up in the viva.

---

## 1.3 Backend Helpers

### `backend/voice_engine.py` — 105 lines

🏷️ **What it is** — **Mouth.** Reads the interviewer's questions out loud.

🎯 **Why it exists** — A practice interview you *read* isn't practice. You need to hear
a question and answer with your voice, under a little pressure.

⭐ **The main part** — It imports its speech libraries **defensively**. Those libraries
need real sound hardware, which doesn't exist inside Docker or on a test server. So if
they're missing, the file logs a warning and the backend **still starts** — just
without a voice. A missing speaker must not take down the whole app.

🧸 **Picture it like** — A **car radio**. Nice to have, but the car must still drive
if it's broken.

---

### `ollama_model_guide.py` — 244 lines · **YOUR VIVA GOLD MINE**

🏷️ **What it is** — A hand-written table of which local AI models are good, which are
bad, and **why**.

🎯 **Why it exists** — Users have different computers. A 2 GB model works on a laptop;
a 9 GB one doesn't. This file measures your free graphics memory and recommends
something that will actually run.

⭐ **The main part** — The discovery that **size does not predict reliability**:

| Model | Size | Reliability | Verdict |
|---|---|---|---|
| **qwen2.5:3b** | 1.93 GB | Reliable | ✅ **Our default** |
| gemma3:4b | 3.0 GB | 100% parse rate | ✅ Best if you have room |
| phi4-mini | 2.2 GB | Best reasoning per GB | ✅ |
| **llama3.2:3b** | 2.2 GB | **only 48–57%** | ❌ **Rejected** |

**Why this matters so much:** our AI must reply in a strict format called JSON. If it
replies in ordinary prose instead, the app **crashes**. Llama 3.2 3B is the same size
and speed as our default — and it gets the format wrong nearly half the time. So we
picked on *format reliability*, **not** on reasoning benchmark scores.

🧸 **Picture it like** — Hiring a **form-filler, not a poet**. You don't need beautiful
writing. You need the boxes filled in correctly every single time.

**The rejected model is kept in the file on purpose**, marked "not recommended", with
the reason written next to it. Deleting it would lose the knowledge; the next person
would pick it again because it *looks* like the obvious choice.

---

### `prune_legacy_candidate.py` — 144 lines

🏷️ **What it is** — A one-time cleanup tool.

🎯 **Why it exists** — Early in development everyone's sessions were saved under one
fake shared ID. Once real user IDs arrived, that old junk data made the dashboard lie.

⭐ **The main part** — Counts the bad rows, shows you what it will delete, *then*
deletes. Never silently.

🧸 **Picture it like** — A **shredder for old paperwork** that shows you the pile first.

---

## 1.4 The Tests — proof that it works

*A test is a small program that checks a bigger program. All **11 pass**. Say that
number in your viva.*

**Why tests matter for your defence:** anyone can claim their code works. A passing
test is *evidence*. And notice the test names — they're written as **sentences**, so
the test file doubles as documentation:

| Test file | Lines | What it proves |
|---|---|---|
| `test_verdict_narration.py` | 333 | Labels never lie — a *gaze* flag never claims the *head* moved |
| `test_interrupt.py` | 256 | Only the two certain findings may interrupt; a guess never does |
| `test_timeline_migration.py` | 239 | Upgrading an old diary doesn't lose old entries |
| `test_llm_config.py` | 224 | The AI switchboard picks the right brain every time |
| `test_peak_risk.py` | 206 | The risk score rises fairly and never exceeds its cap |
| `test_episodes.py` | 156 | **10 flagged frames = 1 episode**, and it records real seconds |
| `test_dashboard_summary.py` | 131 | The dashboard never breaks, even with an empty database |
| `test_persona_contract.py` | 130 | The 3 personalities on screen match the 3 in the engine |
| `test_session_lifecycle.py` | 108 | A session survives to the end and errors clearly if late |
| `test_bea_face_confirmation.py` | 94 | "No face" and "two faces" evidence can't be wrongly combined |
| `test_brevity.py` | 86 | Spoken replies stay short enough to listen to |

🧸 **Picture it like** — The **checklist a pilot runs before take-off**. Boring, and
the reason planes don't crash.

**Honest limitation to admit before you're asked:** these tests cover the backend
*decision-making*. They do **not** cover the eye-tracking maths in the browser. Green
tests mean *"nothing that used to work is broken"* — not *"everything is proven right"*.
Saying this yourself makes you look rigorous.

---

## 1.5 The Benchmarks — measuring the phone detector

*Three files that exist because of one embarrassing problem: **the app was missing
real phones**.*

| File | Lines | What it does |
|---|---|---|
| `bench_phone_recall.py` | 209 | Tries many settings against **real saved photos** to find which catches the most phones |
| `bench_phone_hard.py` | 161 | Tests against a photo we *know* the app currently misses — the worst case |
| `bench_phone_validate.py` | 121 | Checks that raising the photo quality actually helped |

🎯 **Why they exist** — Guessing at settings is not engineering. These files let you
*measure* instead. The 0.35 confidence floor in `edge_main.py` came from here.

🧸 **Picture it like** — A **hearing test**. You don't guess whether someone's hearing
improved. You play the sounds and count.

⭐ **The finding** — An angled or half-covered phone scores 0.35–0.55. Our old
threshold of 0.65 threw those away. It *looked* like the app was slow; it was actually
**blind**.

---

# PART 2 — THE FRONTEND

*The frontend is everything you SEE and CLICK — the pages, buttons, charts, and the
webcam box. It runs in your web browser. Built with a toolkit called **Next.js** and
written in **TypeScript** (JavaScript with safety rails).*

If the backend is the staff room, the frontend is **the building itself** — the rooms
you walk through, the signs on the walls, the front desk.

---

## 2.1 The Pages — the rooms you walk through

*Each of these is one screen. In this toolkit, a file called `page.tsx` inside a
folder becomes a web address. `app/dashboard/page.tsx` → the `/dashboard` page.*

---

### `app/page.tsx` — 41 lines · **THE FRONT DOOR**

🏷️ **What it is** — The marketing landing page. The first thing a visitor sees.

🎯 **Why it exists** — Someone arriving for the first time needs to understand what
this app *is* before they hand over their webcam and resume.

⭐ **The main part** — It's tiny (41 lines) because it just arranges bigger building
blocks from the `landing/` folder. It also switches on a special fancy font set that
*only* the landing page uses.

🧸 **Picture it like** — A **shop window**. Small sign, but it decides whether you walk in.

---

### `app/upload/page.tsx` — 440 lines

🏷️ **What it is** — The screen where you drop in your resume.

🎯 **Why it exists** — The interview is built from your resume, so this is step one of
the real journey.

⭐ **The main part** — Takes your PDF, sends it to the backend's `interviewer.py`, and
shows a friendly loading screen while questions are being written.

🧸 **Picture it like** — The **check-in desk** at a clinic. You hand over your form
before anything else happens.

---

### `app/choose-model/page.tsx` — 453 lines · **THE COOLEST SCREEN**

🏷️ **What it is** — Where you pick which AI brain runs: private (local) or online (cloud).

🎯 **Why it exists** — This is the privacy choice made visible. The whole "your data
stays on your machine" promise lives or dies on this screen.

⭐ **The main part** — It's styled as a scene from *The Matrix* — a still of Morpheus
offering two pills. Two invisible clickable circles sit exactly on the pills. The red
pill and blue pill *are* your two choices.

🧸 **Picture it like** — The **red-pill / blue-pill** scene. Genuinely — that's the
literal design. It's a memorable way to make a boring settings choice feel important.

---

### `app/practice/page.tsx` — 843 lines · **THE MAIN EVENT**

🏷️ **What it is** — The actual interview room. The biggest frontend page.

🎯 **Why it exists** — This is where everything happens at once: the interviewer talks,
your webcam watches, your mic listens, warnings appear. This page is the conductor
holding all of it together.

⭐ **The main part** — It wires together three separate systems live and at the same
time: the **eye-watcher** (SniperScope), the **voice detector** (useVAD), and the
**interviewer conversation**. Keeping three real-time things in sync without them
tripping over each other is why this file is large.

🧸 **Picture it like** — A **live TV control room** during a broadcast — cameras, mics,
and the presenter all running at once, one director keeping them in time.

---

### `app/sentry/page.tsx` — 711 lines

🏷️ **What it is** — A second, watchtower-style version of the monitoring view.

🎯 **Why it exists** — A more surveillance-focused layout, for when the emphasis is on
watching rather than the coaching conversation.

⭐ **The main part** — Manages reminders that were deferred by a question — a nudge
only stays worth saying for a short while, then the report becomes the right place for
it instead.

🧸 **Picture it like** — A **lifeguard's high chair** — same pool, a watching seat.

---

### `app/report/page.tsx` — 304 lines · **THE COACH'S VERDICT**

🏷️ **What it is** — The after-interview report. The coaching payoff.

🎯 **Why it exists** — Watching you is pointless unless you're told how to improve.
This page turns the session into advice.

⭐ **The main part** — Shows the AI coach's structured feedback: your verdict, your
strengths, the one thing to improve, and next actions — plus the drift timeline.

🧸 **Picture it like** — The **coach's chat after the match**. What went well, what to
drill next week.

---

### `app/verdict/page.tsx` — 219 lines · & `app/autopsy/page.tsx` — 186 lines

🏷️ **What they are** — The evidence viewers. They show the actual saved photo moments.

🎯 **Why they exist** — A score you can't check feels like an accusation. These pages
show the *proof*: "here's the exact frame where a phone appeared."

⭐ **The main part** — `autopsy` cleverly handles both new photos (saved as files) and
old ones (saved inside the database the early way), so old sessions still open.

🧸 **Picture it like** — The **replay booth** a referee uses to review a decision.

---

### `app/replay/page.tsx` — 308 lines

🏷️ **What it is** — A play-back of your whole session with a scrubber bar.

🎯 **Why it exists** — Seeing your composure rise and fall over time teaches more than
a single final number.

⭐ **The main part** — Rebuilds the session from the tiny diary notes (`timeline.py`)
and lets you scrub through it like a video — except there was never any video.

🧸 **Picture it like** — A **game-replay with a timeline slider**, built from stats
instead of footage.

---

### `app/dashboard/page.tsx` — 531 lines · **THE PROGRESS TRACKER**

🏷️ **What it is** — Your home base across *many* sessions. Are you getting better?

🎯 **Why it exists** — One interview is a snapshot. Ten interviews is a *story*. This
is the page that makes practice feel worth repeating.

⭐ **The main part** — Pulls the all-sessions summary from the backend and lays out
every chart: composure trend, streak, readiness ring, gaze split.

🧸 **Picture it like** — A **fitness app's progress screen** — weekly streak, trend line,
"you're improving" badges.

---

### `app/layout.tsx` — 85 lines

🏷️ **What it is** — The shared frame wrapped around *every* page.

🎯 **Why it exists** — The theme system, the fonts, the things common to all pages have
to be declared once in a wrapper — not copy-pasted into every screen.

⭐ **The main part** — Sets up fonts and the dark/light theme provider for the entire app.

🧸 **Picture it like** — The **picture frame** every photo in the house shares.

---

## 2.2 The Big Three Components — the live machinery

*These three do the real-time heavy lifting. If you learn only three frontend files
for your viva, learn these.*

---

### `components/SniperScope.tsx` — 1,622 lines · **THE WATCHER — MOST IMPORTANT FRONTEND FILE**

🏷️ **What it is** — The eye-tracker. It watches your face 30 times a second, **inside
your own browser**.

🎯 **Why it exists** — This is *the* privacy feature. Because it runs in the browser,
your webcam video never has to travel anywhere. It looks at the picture and sends out
only tiny words like `"HEAD_LEFT"` — never the image.

⭐ **The main part** — **Sensor fusion with an "iris veto."** It has two ways of
knowing where you look: (1) which way your **head** is turned, (2) where your **eyes**
(iris) point. Sometimes they disagree — you lean back to think but your eyes stay on
screen. The rule: **if your eyes are clearly still on the screen, a small head-turn is
forgiven.** But a big, obvious head-turn cannot be forgiven — that always flags.

🧸 **Picture it like** — A **driving instructor** watching both your head *and* your
eyes. Tilting your head to think is fine as long as your eyes stay on the road. Turning
right around to chat with the back seat is never fine.

**Two details worth saying out loud in a viva:**
- **It smooths across several frames before deciding.** A single frame of eye-jitter
  used to be enough to falsely report a drift while you sat perfectly still. Now a
  frame must be *backed up by its neighbours* before it counts.
- **When the eyes can't be read, it says `"unknown"`, not `"centred"`.** A blink must
  never be mistaken for "eyes on screen" — that would hide a genuine look-away. This
  one word choice is why looking down stopped vanishing from the results.

---

### `hooks/useVAD.ts` — 202 lines · **THE EARS' TRIGGER**

🏷️ **What it is** — Voice Activity Detection. It notices *when you start and stop
talking*. ("Hook" is just this toolkit's word for a reusable piece of logic.)

🎯 **Why it exists** — The app records your answer to send for transcription. It needs
to know when you actually spoke, and it must hand over a *clean* recording.

⭐ **The main part** — It waits for the recorder to fully finish before releasing the
microphone. Cutting the mic a split-second early produced a broken audio file — which
was the mysterious, occasional "failed to transcribe" error. This file fixed it.

🧸 **Picture it like** — A **voice-activated recorder** that waits for you to finish
your sentence before clicking stop — instead of chopping off your last word.

---

### `components/VoiceOrb.tsx` — 300 lines

🏷️ **What it is** — The glowing blob that pulses while there's talking.

🎯 **Why it exists** — People need to *see* that the app is listening, and whose turn
it is to speak. Silence with no feedback feels broken.

⭐ **The main part** — When you're speaking, the ribbons move to your **real** mic level
from `useVAD`, not a fake animation. It's an honest visual.

🧸 **Picture it like** — The **Siri / Alexa glow** that dances to your actual voice.

---

## 2.3 Supporting Components — the smaller helpers

*None of these is complicated. Each does one small visible job.*

**Around the app:**

| File | Lines | What it is, in one line |
|---|---|---|
| `FocusPIP.tsx` | 302 | A small always-on webcam box with a *local-only* focus score — no backend, no frames leave |
| `AuditTrail.tsx` | 156 | The scrolling log of what the watcher noticed, moment by moment |
| `ViolationCard.tsx` | 133 | One flagged event shown as a tidy card |
| `LoadingOverlay.tsx` | 124 | The "please wait" screen, with coach-tone messages instead of a boring spinner |
| `DashboardButton.tsx` | 78 | The little circle-with-your-initials in the corner that takes you home |
| `ModeBadge.tsx` | 64 | The chip showing which AI brain is running, and the way back to switch it |
| `ThemeToggle.tsx` | 54 | The dark/light switch (hidden on the landing page, which is always dark) |
| `RefreshGuard.tsx` | 49 | The "are you sure?" popup if you try to refresh mid-interview and lose your run |
| `PersonaPicker.tsx` | 103 | The pick-your-interviewer-difficulty control, shared by two pages |

**The dashboard charts** (`components/dashboard/`): each is one chart or tile —
`ComposureTrend` (your composure line over time), `ReadinessRing` (the big "how ready
are you" dial), `GazeSplit` (a bar of where your eyes spent time), `PracticeStreak`
(day streak), `StatCard` / `CountUp` (numbers that animate upward), `SessionList`
(your past sessions), `Panel` (the frame every chart sits in), `DashboardTour` /
`EmptyDashboard` (a guided walkthrough and a tempting blurred preview before you have
any data).

**The report & evidence views:**
- `report/DriftTimeline.tsx` (355) — the "when exactly did I lose focus?" ribbon. It
  replaced a single averaged score, which hid *when* things went wrong.
- `verdict/FrameReview.tsx` (283) — groups the flagged moments and shows the proof photo
  for whichever one you click.

**The building blocks** (`components/ui/`): `GlassCard`, `Kicker`, `Stat`, `ScoreRing`
— tiny reusable Lego bricks (a frosted-glass box, a small label, a stat, a progress
ring) used all over so everything looks consistent.

---

## 2.4 The Landing Page Show — `components/landing/`

*This whole folder exists for one job: impress a first-time visitor. It's the "$200k
look" for the front door. Pure decoration and storytelling — none of it touches the
real interview.*

| File | Lines | The eye-candy it makes |
|---|---|---|
| `Hero.tsx` | 144 | The big top banner with the headline |
| `ParticleText.tsx` | 184 | Text that assembles out of flying dots |
| `GlowTriangle.tsx` | 257 | The glowing shape in the background |
| `BentoGrid.tsx` | 91 | The grid of feature boxes, each with a glow that revolves around its border |
| `PipelineSection.tsx` | 125 | An animation showing how a frame flows through the system, step lighting up by step |
| `WordmarkSection.tsx` | 114 | The giant "GUARD" letters |
| `Navbar` · `Footer` · `CTASection` · `TelemetryStrip` · `ForceDark` | small | Top bar, bottom bar, the "get started" button, a strip of fake live stats, and the switch that pins this page to dark mode |

**Inside `landing/bento/`** — the five feature boxes, each a mini-demo that runs with
*no* camera and *no* network (all faked for the show):
- `CellVision.tsx` — a face-mesh wireframe, to advertise the eye-tracking
- `CellVoice.tsx` + `Waveform.tsx` — a Siri-style voice wave
- `CellLlama.tsx` — the "local AI judge" box (deliberately doesn't name a brand)
- `CellPrivacy.tsx` — the list of privacy promises
- `CellStar.tsx` + `faceMeshData.ts` — the star cell and the hardcoded dot positions the face wireframe is drawn from

🧸 **Picture it like** — The **trailer for a movie**. Flashy, self-contained, and made
to make you want the real thing. It shares nothing with the actual interview engine.

---

## 2.5 The Frontend "Brain" — `components/lib/` (the logic helpers)

*These files have no visible shape. They're the shared rules and knowledge the pages
lean on — the frontend's own little staff room.*

**The most important ones:**

### `lib/llmMode.ts` — 333 lines
🏷️ The frontend half of the AI-brain choice. It talks to the backend's `llm_config.py`,
finds out which brain is running, lists the local models you could install, and lets
you switch or paste an API key. 🧸 *The remote control for the backend's TV.*

### `lib/greeting.ts` — 346 lines
🏷️ Works out your name and a friendly greeting. 🎯 It exists because of a real bug: a
resume file named `Gokulkrishn_V_Resume.pdf` once produced the initials **"GR"** —
Gokulkrishn + **R**esume — because "Resume" got read as a surname. This file has a list
of junk words (Resume, CV, Final…) to strip out so nobody gets greeted wrong.
🧸 *The host who reads your name tag correctly before saying hello.*

### `lib/dashboard.ts` — 186 lines
🏷️ Defines the exact shape of the dashboard data — and its types are **mirrored from**
the backend's `timeline.py`. If the backend changes a field, this is where the frontend
must agree. 🧸 *A translator making sure both sides use the same dictionary.*

**The rest, briefly:**

| File | Lines | One-line job |
|---|---|---|
| `resumeMemory.ts` | 245 | Remembers "do we already know this user's resume?" so they skip re-uploading |
| `theme.tsx` | 164 | The dark/light engine (dark is default; landing is force-dark) |
| `violation-templates.ts` | 149 | The supportive, never-shaming wording for each type of flag |
| `identity.ts` | 113 | The single answer to "who is using this app" — name & initials in one place |
| `speechLevel.ts` | 84 | Turns the AI's speaking into the waveform's up-and-down motion |
| `personas.ts` | 74 | The 3 interviewer difficulties, defined once (they used to drift apart in two files) |
| `chartTheme.ts` | 69 | Chart colours that flip correctly between dark and light |
| `panelGuides.ts` | 67 | The plain-language "what am I looking at?" text for each chart |
| `refreshPolicy.ts` | 65 | The rule that a mid-interview refresh sends you back to start |
| `motion.ts` | 44 | Shared animation timings, so movement feels consistent |
| `utils.ts` | 11 | A tiny helper that merges styling names without conflicts |
| `demoSummary.ts` / `mock-data.ts` | — | Fake-but-realistic data so screens can be shown with no backend running |

---

# PART 3 — THE GLUE FILES

*Not backend, not frontend. The files that set up, configure, and run everything.*

| File | What it is | Picture it like |
|---|---|---|
| `README.md` | The project's front-page explainer on GitHub | The **book cover & blurb** |
| `requirements.txt` | The shopping list of Python tools the backend needs | A **recipe's ingredient list** |
| `frontend/package.json` | The same shopping list, for the frontend | The frontend's ingredient list |
| `docker-compose.yml` | A recipe to run the whole app in sealed boxes, one command | **Flat-pack furniture** with one instruction sheet |
| `startapp.bat` | A double-click file that starts backend + frontend together (Windows) | The **"ON" button** for the whole app |
| `AGENTS.md` | Rules for any AI assistant (like me) working on this repo | The **house rules** on the fridge |
| `.gitignore` | The list of files that must **never** be saved to version history (secrets, video, your slides) | The **"do not photograph" sign** |
| `TODO.md` / `TODO_HISTORY.md` | What's left to do, and a kept record of past decisions and even wrong guesses | The **project diary** |
| `frontend/verify-*.js` | Small scripts that screenshot the UI to check it still looks right | **Spot-check photos** on the assembly line |
| `frontend/tsconfig.json`, `eslint.config.mjs`, `next.config.ts`, `postcss.config.mjs` | Settings files that tell the toolkit how strict to be and how to build | The **machine's dial settings** |

---

# PART 4 — THE 60-SECOND VERSION (memorise this)

If someone stops you in a corridor and asks "what did you build?", say this:

> "A **local-first interview coach**. You upload your resume, and a **local AI**
> (`interviewer.py`) asks you tough questions out loud. While you answer, your **own
> browser** watches your eyes (`SniperScope.tsx`) and a **local detector**
> (`edge_main.py` + YOLO) watches for a phone — **no video ever leaves your machine**.
> The clever part is the **Patient Teacher** (`bea.py`): it never flags a single glance,
> only a *sustained pattern*, because a coach shouldn't punish you for being human.
> Everything gets written as **tiny text notes, not video** (`timeline.py`), so
> afterwards you get a **replay and a coaching report**, and a **dashboard** tracking
> whether you're improving over time."

**The three sentences that win the viva:**
1. **"A coach, not a cop"** — we detect patterns and give advice, we don't just accuse.
2. **"No video leaves the device"** — and the honest version: *MediaPipe runs in the
   browser, YOLO and Whisper run on your own machine's backend; only the optional cloud
   AI mode sends any text out.* Local-first and privacy-aware.
3. **"We chose models for reliability, not benchmark scores"** — Llama 3.2 3B is the same
   size as our default but gets the format wrong ~half the time, so we rejected it.

---

*End of the Guide Book. Every source file in `backend/` and `frontend/src/` is covered
above. The `presentation/` slides and `FOR CONFERENCE PAPER/` are intentionally left
out — they aren't part of the running app.*

