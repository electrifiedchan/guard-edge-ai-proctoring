# TODO

Open items from the 2026-08-06 review session. Items 1, 1b, 2 and 8 are done and
pushed (commit `e47d735`); what follows is what remains.

---

## 3. Stop the interviewer's voice on Disengage / End Session — DONE

Clicking **Disengage** in SniperScope cancelled speech, but audio could resume a
moment later: `handleDisengage` never set `sessionEndingRef.current`, so a turn
already in flight resolved *after* the cancel and called `speakText` again on a
dead session.

Fixed in `frontend/src/app/sentry/page.tsx`:

- `handleDisengage` latches `sessionEndingRef.current = true` *before* tearing
  anything down, so a turn mid-flight sees the run is over.
- `speakText` resolves immediately when the flag is set, rather than queueing
  an utterance nobody is listening for.
- Engage clears the flag back to `false` — without that reset the next session
  would be born dead, so Disengage → Engage stays workable.
- The turn pipeline re-checks the flag after every await (upload, transcribe,
  reply, speak), which keeps a late answer out of a transcript the user has
  already closed.


## 4. Persona choice belongs before engaging — PARTIALLY DONE

Move the persona buttons (Friendly HR / Curious Peer / …) into SniperScope as a
pre-engage choice, and make the selection actually reach the backend. Today
`currentPersona` is only ever *read from* the server response, so the badge
reflects the backend's pick and the user has no say. Requires passing the chosen
persona on session start.

Done so far:

- Backend accepts a caller-supplied persona on session start and seeds the
  escalation ladder from it, rather than always starting at the top
  (`backend/core_memory/conversation_engine.py`, `backend/edge_main.py`).
- The `/practice` surface has the pre-engage selector wired end to end: the
  choice is held in React state, sent on start, and reset when the session ends.

Still open — the half this item actually names:

- `/sentry` (`frontend/src/app/sentry/page.tsx`) still only *reads*
  `data.persona` off the start-session and per-turn responses; it never sends
  one, so the badge there remains the backend's pick. `SniperScope.tsx` has no
  persona code at all yet, so the pre-engage buttons still need to be built into
  it and threaded up to the page's `start-session` call.


## 5. Back button on the verdict image view — DONE

`frontend/src/components/verdict/FrameReview.tsx` now has three ways out of the
full-frame view, because a viewer that traps you is worse than no viewer at all:
the visible Back button, Escape (what people reach for first in a full-screen
view), and clicking the backdrop. The image itself stops propagation, so
clicking the evidence you are trying to look at does not dismiss it.


## 6. Refresh should land on the landing page — DONE

Confirm first, then land on `/`. Applies to every route except `/` itself.

Two halves, both mounted in the root layout:

- `components/RefreshGuard.tsx` — a `beforeunload` handler that makes the
  browser ask before the reload goes through, so a mistyped Ctrl-R can be
  cancelled. Skipped on `/`, which has no state to lose; any attached handler
  costs that page its bfcache eligibility in Firefox and Safari.
- `lib/refreshPolicy.ts` — a blocking inline script that clears the run's
  sessionStorage keys and `location.replace("/")`s on a reload it detects via
  Navigation Timing.

The redirect is a pre-paint script rather than an effect on purpose: the pages
run their own redirect guards on mount (`/sentry` → `/upload` when the session
key is missing, same for `/report` and `/verdict`), so an effect here would be
one more racing `router.push` in the same tick. Running before hydration means
the reloaded route never mounts — no flash of a half-built page, no race.

## 7. Per-resume memory — MOSTLY DONE

Memory is now keyed by resume identity instead of one global literal.

The bug was that `major_project_candidate_01` was hardcoded in *two* places —
`SniperScope.tsx` (which writes telemetry) and `dashboard/page.tsx` (which reads
it back). Every resume on the machine therefore wrote into and read from the same
timeline: upload a new CV and the dashboard still showed the previous one's
sessions, streak and trend.

- `lib/resumeMemory.ts` gained `activeCandidateId()`, deriving `resume_<hash>`
  from the already-existing content hash — no second identity scheme, as the
  item asked. Both the read and the write import it, so they cannot drift apart
  again; that duplication is what caused this in the first place.
- `SniperScope.tsx` resolves it once per mount into a ref. It must not change
  underneath a run that is already recording, and it reads localStorage, which
  does not exist during the server render.
- The `{candidate_id}__{rand}` session-id format is unchanged, so the backend's
  prefix-matching for `/report` and `/verdict` still resolves.
- A browser with no resume gets `guard_no_active_resume`, which has no history —
  so it renders the empty state rather than a stranger's numbers.

Still open:

- Rows already written under the old hardcoded id are now orphaned: they are no
  longer attributed to any resume, so they simply stop appearing. That is the
  desired end state, but the old rows are still sitting in the DB and nothing
  prunes them.
- I did not verify whether the backend still *seeds* demo rows under that literal
  on startup. If it does, that seeding is now dead weight and should be removed.
  (Note: `?demo=1` on the dashboard is a separate, deliberate design-review path
  and should stay.)
- **Reviewed 2026-08-07: separation itself works, but two review findings.**
  First, the dashboard grid keys and the backend session-day keys disagreed by
  one UTC offset — that is 12d, fixed separately. Second, a real survivability
  defect: the identity (`activeCandidateId`) was routed through the resume
  *parse* cache's 24h TTL, and `getActiveResume()` DELETED the pointer on a
  cache miss. `/upload` calls it on mount, so the first visit a day after
  practising destroyed the hash — the only link to the candidate's history —
  and the dashboard then asked for `guard_no_active_resume`, rendering "you
  never practised" while the rows were still in the DB. Fixed: identity now
  reads the pointer directly and outlives the cache; a stale cache means
  "re-upload to start a session", never "you have no past".


## 9. Local LLM (Ollama) wiring

Set up and wire the local model path end to end.

## 10. Shorten the interviewer's speech — DONE

Replies are spoken aloud, so length is a UX cost, not just a token cost —
roughly 35 words is 12 seconds of dead air. Two layers in
`backend/core_memory/conversation_engine.py`:

- `BREVITY_RULE`, appended to every prompt. Each persona already said "2-3
  sentences max" and the model blew through it, because it spends the budget
  validating the answer before it gets around to asking anything. Naming the
  specific padding habits holds far better than restating a sentence count.
- `_trim_to_sentences` as the backstop, clamping to a word budget on a whole
  sentence — `max_tokens` cuts mid-word, which the browser's speech synthesiser
  reads out as a dangling fragment. It keeps the first sentence unconditionally,
  and if trimming would drop the question it pairs the opener with the question
  instead, since a slightly long reply beats a dead turn.

Covered by `backend/test_brevity.py` — 13 passing.


## 11. Escalation rules — DONE

Both rules live in `backend/core_memory/bea.py`:

- Phone-in-frame escalates instantly. `confirm_critical(instant=True)` bypasses
  the 3-of-5 buffer, since a phone in shot is a phone in shot and at a 5s frame
  cadence the buffer meant ~15 seconds of holding it before anything fired. The
  window is reported honestly as 1-of-1 so the UI does not render a fake ratio.
- A third event in quick succession escalates: `_calculate_risk` adds a penalty
  when `recent_burst >= 3` within a 30s window, on top of the per-event score.

The ordinary path still buffers, so a brief glance or someone walking past does
not get mistaken for a sustained violation.


## 12. Session data + detection accuracy — REPORTED, triage next session

Found by hand-testing a live run on 2026-08-06. Listed as observed; the causes
below are hypotheses to check, not diagnoses. Assume the list is incomplete —
these were spotted in one sitting.

### 12a. Check item 7 first — it may be implicated in 12b–12d

Before chasing anything else: I changed the candidate id in item 7 this session.
Any run recorded *before* that change was written under the old literal, and the
dashboard now asks for `resume_<hash>` — so it would correctly find nothing and
render zeros. That would produce exactly the "speaking time is 0, streak not lit"
symptoms below.

Cheap way to tell them apart: do one complete run *after* the change and see if
the numbers appear. If they do, 12b–12d were stale-data artifacts and the real
remaining bug is only that old rows are orphaned. If they are still zero, the
aggregation itself is broken and item 7 is a red herring. Do not start editing
the aggregation queries until this is settled.

### 12b. Verdict page focus score reads 0 — FIXED

A field-name split, not a computation bug. `/api/v1/end-session` returns
`focus_score`; both `/sentry` and `/practice` read `data.average_focus_score`,
which is `undefined`, and `|| 0` rendered the missing field as a legitimate
looking 0%. That is why the screenshot showed TURNS 4 alongside FOCUS 0% — the
turns were counting all along, so the score never had a source problem.

- Both pages now read `focus_score`, and the `|| 0` fallback is gone: a missing
  field must not be indistinguishable from a real zero. That disguise is the
  whole reason this survived a "predates today's changes" reading.
- `average_focus_score` still exists on a different, older endpoint that
  genuinely receives it as input — it was not renamed, and was never in play.
- Pinned by `backend/test_session_lifecycle.py::verdict returns focus_score
  under the name the client reads`, which asserts the response key rather than
  the value, since the value was always right.

### 12c. Dashboard "Speaking time" reads 0 after ~3 minutes of talking — CONFIRMED WORKING

`is_talking` is computed in `SniperScope.tsx` from mouth-aspect-ratio and sent on
every frame, so the question is where it dies between there and
`get_dashboard_summary`. Worth checking whether the 5s frame cadence is even a
fair sampling basis for a "% of time talking" figure — a mouth open at the
instant of sampling is a coarse proxy, and the metric may be under-counting by
construction rather than by bug.

**Confirmed working by a live run on 2026-08-07** — speaking time increases. The
sampling-basis concern above still stands as an accuracy question, but it is not
a bug and nothing here is blocked.

### 12d. Streak grid: today's cell not lit after a session — FIXED

**The UTC hypothesis was right about the mechanism but wrong about the side.**
The note below correctly cleared the backend (`timeline.py` buckets with
`date.fromtimestamp(...)`, which is local) and correctly predicted the frontend
was the place to look. What it got wrong was the window: this is not a
midnight-to-05:30 edge case, it is wrong all evening.

`densifyActivity` in `lib/dashboard.ts` built each cell key by taking a LOCAL
midnight cursor and then calling `.toISOString().slice(0, 10)`, which converts to
UTC. At +05:30 local midnight is 18:30 the **previous** day, so every one of the
84 cell keys was shifted a day earlier than the keys the backend wrote. Today's
session therefore lit nothing — matching the 8:33pm IST report exactly.

- Added `localDateKey()` and switched `densifyActivity` to it.
- `lib/demoSummary.ts` held its own copy of the same construction and its comment
  explicitly instructed the reader to mirror it, so `?demo=1` — the one view
  that should have exposed this — reproduced the bug faithfully and looked
  correct. It now imports the shared helper instead of restating the format.
- Pinned by `frontend/scripts/check-activity-dates.mjs` (12 checks). Run it as
  `TZ=Asia/Kolkata node frontend/scripts/check-activity-dates.mjs`; under TZ=UTC
  the divergence assertion reports a **skip** rather than passing vacuously,
  because at zero offset the old broken code was also correct.

Original note, kept because its reasoning was half right and the half that was
wrong is instructive: `timeline.py` buckets with
`date.fromtimestamp(...)`, which is already LOCAL time, so an 8:33pm IST session
buckets to the correct local day on the backend. The mismatch, if any, is on the
frontend side: check whether the dashboard builds "today" with
`toISOString().slice(0,10)` (that IS UTC) and compares it against the backend's
local-time keys. Those two only disagree between local midnight and 05:30 IST,
which is a real but narrow window — so if the cell was dark at 8:33pm, timezone
is probably not the cause at all and 12a is the likelier explanation.

### 12e. Phone detected, but 3-5s late (was: "not detected")

**Restated after a retest — the original title was wrong.** The phone IS
detected; it just takes 3-5 seconds. A quick flash of the phone is missed
entirely, which is what the first report read as "not detected".

That number is the diagnosis. The frame cadence is 5s, so the phone is only
looked for when a frame is sampled — anything shown and withdrawn between two
ticks never reaches YOLO at all. A 3-5s lag is one sampling interval, i.e. the
detector is behaving correctly and the *sampler* is the bottleneck.

This also confirms item 11 is working: `confirm_critical(instant=True)` removed
the 3-of-5 buffer (~15s at this cadence), and what is left is purely capture
latency. So do NOT touch the buffer or `YOLO_CONF` — I had queued "lower the
confidence threshold" as a candidate last session and that would have been the
wrong move, buying false positives without shortening the gap by a millisecond.

Detector config is confirmed fine and can stay ruled out: `YOLO_WATCH_CLASSES`
includes 67 (`cell phone`), `YOLO_CONF` is 0.65, and `determine_verdict` checks
objects BEFORE face count, so nothing shadows the phone branch.

The real fix is decoupling object detection from the 5s conversational cadence:

1. Run a cheap object-only pass on its own faster timer (~1s) while leaving the
   full composure/gaze analysis on 5s. Object detection does not need to be
   synchronised to interview turns — that coupling is incidental.
2. Cost check first. YOLO at 1Hz on the edge device is the whole question here;
   measure a single-frame inference before committing, and if it will not hold,
   sample at 1s but only forward the frame when a frame-difference heuristic says
   something entered the scene.

Do not raise the *whole* pipeline to 1Hz — that multiplies inference cost by 5x
for the two metrics that do not need it.


### 12f. Head pose inverted — FIXED

Looking down reported "head tilted up". My guess in the previous session (that
the copy mapping was inverted) was **wrong**: `determine_verdict` in
`edge_main.py` maps `HEAD_DOWN` → "tilted down" correctly. The frontend was
genuinely sending `HEAD_UP` while the user looked down. Two separate sign bugs in
the iris maths in `SniperScope.tsx`, both now fixed:

1. **Vertical gaze was measured against the eyelids** (159/386 upper, 145/374
   lower) and normalised by the eyelid gap. The upper lid *follows* the gaze —
   look down and it droops onto the iris — so iris-to-upper-lid distance SHRANK
   when looking down, and the classifier read that as looking up. Exactly
   inverted, which matches the report. The eyelid-gap denominator also collapses
   toward zero during a blink, making the ratio explode.
2. **Horizontal gaze silently cancelled itself out.** It used
   `dist(iris,inner) - dist(iris,outer)` per eye, but the inner corner sits on
   opposite sides of the two eyes, so one physical look produced equal and
   OPPOSITE values in the left and right eye — and averaging them gave ~0.
   Horizontal drift was effectively undetectable, which is also why head pose was
   never vetoed sideways by the eyes.

Both axes now measure a signed offset from the eye-corner midpoint, normalised by
eye width. Corners are skin-anchored and do not move when the eye opens or
blinks, so neither axis depends on the eyelid any more, and both eyes agree in
sign. Added alongside: a blink gate (eye-aspect-ratio, used *only* to suppress the
read — deliberately not folded into the gaze signal, which was mistake #1), a
zero-width guard so a degenerate mesh cannot poison the calibration mean with
`Infinity`, and per-axis thresholds since x and y are no longer on a shared scale.

**The rewrite above was left half-landed and the file did not compile.** Five
defects, found on 2026-08-07 by running `tsc` against the working tree — the first
four were type errors, so no build had succeeded since the rewrite:

1. `pitchRatio` / `noseX` no longer exist — the 3D rewrite renamed them to
   `pitchDeg` / `yawDeg` — but the calibration sample push and the `classifyPose`
   call still used the old names. The sample struct is now `pitchDeg`/`yawDeg`
   too, rather than aliasing degrees behind a field called "ratio".
2. `fuseSensors` grew a third parameter, `headMagDeg`, and the one call site was
   never updated. `poseMagnitudeDeg` was therefore dead code, and the two rules
   that read the magnitude compared `undefined >= 22`, which is always false.
   Net effect: **every** strong deflection with a centred iris was vetoed to
   `HEAD_CENTER` — the exact lap-glance cheat the rewrite set out to catch.
3. `classifyGaze` returned `"center"` on a blink while `fuseSensors` tested for
   `"unknown"`, so that branch never ran. `"center"` is positive evidence the
   eyes are on-screen, so a blink through a look-away vetoed the head. This is
   mistake #1's twin: a no-opinion read being spelled the same as a centred one.
   Blink and degenerate-mesh now both report `"unknown"`.
4. The iris-usable gate now also requires at least one measurable eye. With
   neither, `currentGazeX/Y` fall back to `0`, which against a non-zero baseline
   is a deflection rather than a centre.
5. Leftover unused `nose` landmark from the old 2D yaw maths, removed.

Verified against ten synthetic scenarios (baseline pitch 6°, i.e. a laptop lid):
look-down with counter-rolled eyes, look-down mid-blink, look-down with centred
eyes, a 15° lid tilt that must still read centre, side turns with and without
vertical iris noise, iris-only drift on each axis, and a degenerate mesh. All ten
produce the expected label; four of them returned `HEAD_CENTER` before this fix.

Still to do here: those ten scenarios are a throwaway script, not a committed
test. Pinning them needs `classifyPose` / `classifyGaze` / `fuseSensors` /
`poseMagnitudeDeg` lifted out of the component into a module a test can import —
they are pure functions with no React dependency, so the only thing keeping them
uncoverable is where they sit. A node script under `frontend/scripts/` matches
the existing `check-initials.mjs` convention and needs no new dependency. Worth
doing: two of the five defects above are sign/no-opinion errors, which is exactly
the class that returns silently, and this rewrite has now shipped broken twice.


### 12h. "Head tilted down" while sitting dead centre — FIXED

Reported on 2026-08-07 after the 12f rewrite. Two independent causes; the first
is a mislabel, the second is a sampling error.

1. **An iris drift was being reported as a head tilt.** With the head genuinely
   centred, `fuseSensors` falls through every head-led case to Case C, where the
   iris wins and its vote is translated through `GAZE_TO_POSE` into `HEAD_DOWN`.
   The backend then narrates that string, honestly, as "head tilted down" — but
   the head had not moved at all. The vocabulary collapse was the bug: mapping
   the iris onto head labels threw away which sensor spoke. `GAZE_TO_DRIFT` now
   emits `GAZE_DOWN`/`GAZE_LEFT`/etc., and `determine_verdict` narrates those as
   eyes. Risk scoring is deliberately unchanged — a lap glance is a lap glance —
   so this only fixes the words, which is what 12g is about.
2. **One frame out of ~300 decided the whole 5s window.** `telemetryRef` is
   overwritten every `requestAnimationFrame` tick, and the inference loop reads
   it once per 5s, so the reported pose was whatever the single frame at the
   sampling instant happened to say. `GAZE_DELTA_Y` is 0.055 eye-widths with no
   temporal persistence, so ordinary iris jitter crossed it often enough to be
   caught regularly. Added a 3s majority window: the loop now sends the modal
   pose over recent frames, with `HEAD_CENTER` winning ties.

Sample starvation was investigated and ruled out — the face loop is
`requestAnimationFrame`, not the 5s cadence, so `samples.length >= 30` inside the
5s calibration window is reached easily and the baseline does lock.

Covered by `backend/test_verdict_narration.py` (6 tests, including that a gaze
drift scores identically to the equivalent head pose) and the 15 frontend
scenarios for the majority filter.

### 12g. Behavioural log copy contradicts the tier — PARTLY FIXED by 12h

Related to 12e: the log line said "fully engaged and attentive" while the tier
was `WARNING_LOGGED` at 40%. Whatever the detection outcome, the narration and
the risk state should never disagree on screen — that undermines trust in the
number even when the number is right.

12h fixed the specific contradiction where a centred head was narrated as a tilt.
Still open: the general guarantee. Nothing structurally prevents a clean-frame
narration from being emitted while the accumulated tier is elevated, because the
copy is chosen per frame from the current pose while the tier reflects history.
The frame-level string is arguably correct in isolation — the fix is for the
narration to acknowledge the standing tier, not to restate the frame.


---

### Note on running the local checks


`npx tsc` resolves to a decoy package on this machine, and the shell's working
directory does not persist between commands — so use absolute paths:

```
node "<repo>\frontend\node_modules\typescript\bin\tsc" --noEmit -p "<repo>\frontend\tsconfig.json"
node "<repo>\frontend\scripts\check-initials.mjs"
```

`startapp.bat` must be launched from the repo root as `.\startapp.bat`, not by
bare name.
